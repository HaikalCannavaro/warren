"""Private, single-owner Warren delivery relay. No model work runs on the phone.

Bind to loopback behind HTTPS. SQLite commits precede every Gateway mutation.
Only the configured Gateway is reachable; clients cannot supply upstream URLs.
"""
import asyncio
import hashlib
import hmac
import json
import os
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

TERMINAL = {"complete", "error", "unknown"}
RETRY_DELAY = 10
POLL_DELAY = 2


def result_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("text", "output", "content"):
            item = value.get(key)
            if isinstance(item, str):
                return item
            if isinstance(item, list):
                return "\n".join(x["text"] for x in item if isinstance(x, dict) and isinstance(x.get("text"), str))
    return None


class Store:
    def __init__(self, filename):
        self.db = sqlite3.connect(filename)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, device TEXT NOT NULL,
            conversation TEXT NOT NULL, request TEXT NOT NULL, session TEXT,
            admission TEXT, state TEXT NOT NULL DEFAULT 'queued', text TEXT NOT NULL DEFAULT '',
            error TEXT, epoch TEXT, seq INTEGER NOT NULL DEFAULT 0, attempted INTEGER NOT NULL DEFAULT 0,
            profile TEXT, created REAL NOT NULL, updated REAL NOT NULL, notified INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, session TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, token TEXT NOT NULL);
        """)
        if "attempted" not in {row[1] for row in self.db.execute("PRAGMA table_info(jobs)")}:
            with self.db:
                self.db.execute("ALTER TABLE jobs ADD COLUMN attempted INTEGER NOT NULL DEFAULT 0")

    def job(self, key):
        row = self.db.execute("SELECT * FROM jobs WHERE id=?", (key,)).fetchone()
        return dict(row) if row else None

    def accept(self, request):
        key = request["submissionId"]
        fingerprint = hashlib.sha256(json.dumps(request, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        existing = self.job(key)
        if existing:
            if not hmac.compare_digest(existing["fingerprint"], fingerprint):
                raise web.HTTPConflict(text="This submission ID already names a different message.")
            return existing
        pending = self.db.execute("SELECT count(*) FROM jobs WHERE state NOT IN ('complete','error','unknown')").fetchone()[0]
        if pending >= 100:
            raise web.HTTPServiceUnavailable(text="Delivery queue is full. Retry the same submission ID later.")
        with self.db:
            self.db.execute("INSERT INTO jobs(id,fingerprint,device,conversation,request,session,created,updated) VALUES(?,?,?,?,?,?,?,?)",
                            (key, fingerprint, request["deviceId"], request["conversationId"], json.dumps(request), request.get("sessionId"), time.time(), time.time()))
        return self.job(key)

    def update(self, key, **fields):
        allowed = {"session", "admission", "state", "text", "error", "epoch", "seq", "profile", "notified", "attempted"}
        if not fields or not fields.keys() <= allowed:
            raise ValueError("Invalid store update")
        with self.db:
            self.db.execute("UPDATE jobs SET " + ",".join(f"{name}=?" for name in fields) + ",updated=? WHERE id=?", (*fields.values(), time.time(), key))

    def session(self, conversation):
        row = self.db.execute("SELECT session FROM conversations WHERE id=?", (conversation,)).fetchone()
        return row[0] if row else None

    def remember_session(self, conversation, session):
        with self.db:
            self.db.execute("INSERT INTO conversations VALUES(?,?) ON CONFLICT(id) DO UPDATE SET session=excluded.session", (conversation, session))

    def public(self, key):
        job = self.job(key)
        return {"submissionId": job["id"], "conversationId": job["conversation"], "deviceId": job["device"],
                "sessionId": job["session"], "state": job["state"], "text": job["text"], "error": job["error"],
                "agentProfile": job["profile"], "updatedAt": int(job["updated"] * 1000)}


class Gateway:
    def __init__(self, http, url, token, event):
        self.http, self.url, self.token, self.event = http, url, token, event
        self.pending, self.counter = {}, 0

    async def __aenter__(self):
        self.ready = asyncio.get_running_loop().create_future()
        # Match Warren's current authenticated WSS contract. Never log this URL.
        self.socket = await self.http.ws_connect(self.url + "?" + urlencode({"token": self.token}), heartbeat=20, max_msg_size=2 * 1024 * 1024)
        self.reader = asyncio.create_task(self.read())
        try:
            ready = await asyncio.wait_for(self.ready, 15)
            if ready.get("session_authority") is not True:
                raise RuntimeError("Gateway is not a canonical session authority")
            await self.rpc("client.capabilities", {"server_requests": False})
            caps = (await self.rpc("runtime.describe", {})).get("capabilities", [])
            if not {"durable-admission-v1", "event-replay-v1"} <= set(caps):
                raise RuntimeError("Gateway requires durable-admission-v1 and event-replay-v1")
            return self
        except BaseException:
            await self.__aexit__(None, None, None)
            raise

    async def __aexit__(self, *_):
        self.reader.cancel()
        await asyncio.gather(self.reader, return_exceptions=True)
        await self.socket.close()

    async def read(self):
        try:
            async for message in self.socket:
                if message.type != WSMsgType.TEXT:
                    if message.type in {WSMsgType.CLOSED, WSMsgType.ERROR}:
                        break
                    continue
                frame = json.loads(message.data)
                if frame.get("method") == "event":
                    event = frame.get("params", {})
                    if event.get("type") == "gateway.ready" and not self.ready.done():
                        self.ready.set_result(event.get("payload", {}))
                    else:
                        self.event(event)
                elif "method" in frame and "id" in frame:
                    await self.socket.send_json({"jsonrpc": "2.0", "id": frame["id"], "error": {"code": -32601, "message": "Background delivery cannot answer interactive requests."}})
                elif frame.get("id") in self.pending:
                    future = self.pending.pop(frame["id"])
                    if not future.done():
                        # Do not echo upstream errors, which may contain private data.
                        if "error" in frame:
                            future.set_exception(RuntimeError("Gateway refused the operation"))
                        else:
                            future.set_result(frame.get("result", {}))
        finally:
            if not self.ready.done():
                self.ready.set_exception(ConnectionError("Gateway disconnected"))
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(ConnectionError("Gateway disconnected"))
            self.pending.clear()

    async def rpc(self, method, params):
        self.counter += 1
        key = self.counter
        future = asyncio.get_running_loop().create_future()
        self.pending[key] = future
        try:
            await self.socket.send_json({"jsonrpc": "2.0", "id": key, "method": method, "params": params})
            return await asyncio.wait_for(future, 30)
        finally:
            self.pending.pop(key, None)


class Relay:
    def __init__(self, store, gateway_url, gateway_token, auth_token):
        self.store, self.gateway_url, self.gateway_token, self.auth_token = store, gateway_url, gateway_token, auth_token
        self.running, self.locks = {}, {}
        self.limit = asyncio.Semaphore(4)
        self.push = None

    def event(self, key, event):
        job = self.store.job(key)
        if job["state"] in TERMINAL or event.get("session_id") != job["session"]:
            return
        admission = event.get("admission_id") or event.get("payload", {}).get("admission_id")
        if not job["admission"] or admission != job["admission"]:
            return
        seq, epoch = event.get("seq"), event.get("replay_epoch")
        if isinstance(seq, int):
            if epoch == job["epoch"] and seq <= job["seq"]:
                return
        payload, kind = event.get("payload", {}), event.get("type")
        fields = {}
        if isinstance(seq, int) and isinstance(epoch, str):
            fields.update(seq=seq, epoch=epoch)
        if kind == "message.delta" and isinstance(payload.get("text"), str):
            fields["text"] = (job["text"] + payload["text"])[-2 * 1024 * 1024:]
        if kind == "message.complete":
            body = result_text(payload)
            failed = payload.get("status") in {"error", "interrupted", "cancelled"} or payload.get("outcome") in {"failed", "cancelled", "interrupted"}
            complete = payload.get("status") == "complete" or payload.get("outcome") == "completed"
            fields.update(text=body if body is not None else job["text"], state="error" if failed else "complete" if complete else "unknown",
                          error="Hermes stopped or failed this task." if failed else None if complete else "Gateway returned an unrecognized final status.")
        if fields:
            self.store.update(key, **fields)

    async def execute(self, http, key):
        job = self.store.job(key)
        request = json.loads(job["request"])
        async with self.locks.setdefault(job["conversation"], asyncio.Lock()), self.limit:
            while self.store.job(key)["state"] not in TERMINAL:
                try:
                    async with Gateway(http, self.gateway_url, self.gateway_token, lambda event: self.event(key, event)) as gateway:
                        job = self.store.job(key)
                        session = job["session"] or self.store.session(job["conversation"])
                        snapshot = await gateway.rpc("session.resume", {"session_id": session}) if session else await gateway.rpc("session.create", {"request_id": "warren-" + job["conversation"], "source": "gui", **({"model": request["model"]} if request.get("model") else {})})
                        session = snapshot["session_id"]
                        if job["session"] and session != job["session"]:
                            self.store.update(key, state="unknown", error="Gateway changed the stored session identity. Inspect Hermes before retrying.")
                            break
                        self.store.remember_session(job["conversation"], session)
                        self.store.update(key, session=session, profile=snapshot.get("info", {}).get("profile_name"))
                        if not job["admission"]:
                            if not job["attempted"] and (snapshot.get("running") or snapshot.get("pending") or snapshot.get("prompts")):
                                await asyncio.sleep(POLL_DELAY)
                                continue
                            # The same durable submission ID is reused after any ambiguous disconnect.
                            # No new ID is generated and no cancel/interrupt RPC is ever called.
                            self.store.update(key, attempted=1)
                            receipt = await gateway.rpc("prompt.submit", {"session_id": session, "submission_id": key, "text": request["text"], "clarify_batch": True})
                            if receipt.get("ref", {}).get("session_id") != session or not receipt.get("admission_id"):
                                raise RuntimeError("Invalid admission receipt")
                            self.store.update(key, admission=receipt["admission_id"], state="running")
                        self.store.update(key, error=None)
                        while self.store.job(key)["state"] not in TERMINAL:
                            job = self.store.job(key)
                            params = {"session_id": session, "admission_id": job["admission"]}
                            try:
                                receipt = await gateway.rpc("prompt.receipt", {**params, "include_result": True})
                            except RuntimeError:
                                # Older durable-v1 gateways lack the optional result field.
                                # This fallback is read-only; exact final text still comes from replay.
                                receipt = await gateway.rpc("prompt.receipt", params)
                            if receipt.get("admission_id") != job["admission"] or receipt.get("ref", {}).get("session_id") != session:
                                raise RuntimeError("Invalid receipt identity")
                            if receipt.get("status") == "unknown":
                                self.store.update(key, state="unknown", error="Hermes reports an uncertain result. The task was not resubmitted.")
                                break
                            replay = await gateway.rpc("session.events.since", {"session_id": session, "last_sequence": job["seq"], **({"replay_epoch": job["epoch"]} if job["epoch"] else {})})
                            for event in replay.get("events", []):
                                self.event(key, event)
                            if self.store.job(key)["state"] in TERMINAL:
                                break
                            if receipt.get("status") == "terminal":
                                text = result_text(receipt.get("result"))
                                if text is not None:
                                    outcome = receipt.get("outcome")
                                    self.store.update(key, text=text, state="complete" if outcome in {"complete", "completed", "success", "succeeded", "stop"} else "error", error=None if outcome in {"complete", "completed", "success", "succeeded", "stop"} else "Hermes returned a non-success outcome.")
                                else:
                                    self.store.update(key, state="unknown", error="The task ended but its exact final result is not available. Inspect Hermes history.")
                                break
                            await asyncio.sleep(POLL_DELAY)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    # Connectivity is not a task failure. Keep the committed identity for recovery.
                    if self.store.job(key)["state"] not in TERMINAL:
                        self.store.update(key, error="Gateway unavailable. Reconnecting with the same request identity.")
                    await asyncio.sleep(RETRY_DELAY)
            await self.notify(key)

    async def notify(self, key):
        job = self.store.job(key)
        if job["notified"] or not self.push:
            return
        row = self.store.db.execute("SELECT token FROM devices WHERE id=?", (job["device"],)).fetchone()
        if not row:
            return
        from firebase_admin import messaging
        try:
            # Generic body: chat text never goes through FCM or the lock screen.
            message = messaging.Message(token=row[0], data={"submissionId": key, "conversationId": job["conversation"]},
                notification=messaging.Notification(title="Warren", body="Your Agent task has an update. Open Warren to sync."),
                android=messaging.AndroidConfig(priority="high", notification=messaging.AndroidNotification(channel_id="warren_agent_results", tag=key)))
            await asyncio.to_thread(messaging.send, message, app=self.push)
            self.store.update(key, notified=1)
        except Exception:
            pass  # Retried by the scheduler; never re-run the agent to retry a notification.

    async def scheduler(self, http):
        try:
            while True:
                rows = self.store.db.execute("SELECT id FROM jobs WHERE state NOT IN ('complete','error','unknown') ORDER BY created LIMIT 100").fetchall()
                for row in rows:
                    key = row[0]
                    if key not in self.running:
                        task = asyncio.create_task(self.execute(http, key))
                        self.running[key] = task
                        task.add_done_callback(lambda _task, key=key: self.running.pop(key, None))
                for row in self.store.db.execute("SELECT id FROM jobs WHERE state IN ('complete','error','unknown') AND notified=0 LIMIT 100").fetchall():
                    await self.notify(row[0])
                await asyncio.sleep(3)
        finally:
            for task in self.running.values():
                task.cancel()
            await asyncio.gather(*list(self.running.values()), return_exceptions=True)


def app_for(relay):
    @web.middleware
    async def auth(request, handler):
        provided = request.headers.get("Authorization", "")
        if not hmac.compare_digest(provided, "Bearer " + relay.auth_token):
            raise web.HTTPUnauthorized(text="Authentication required")
        return await handler(request)

    app = web.Application(middlewares=[auth], client_max_size=512 * 1024)

    async def health(_request):
        try:
            async with ClientSession(timeout=ClientTimeout(total=35), trust_env=False) as http:
                async with Gateway(http, relay.gateway_url, relay.gateway_token, lambda _event: None):
                    pass
        except Exception:
            raise web.HTTPServiceUnavailable(text="The configured Gateway is unavailable or does not support durable delivery and replay.")
        return web.json_response({"protocol": "warren-background-v1", "gatewayUrl": os.getenv("WARREN_GATEWAY_PUBLIC_URL", relay.gateway_url)})

    async def submit(request):
        try:
            value = await request.json()
            if not isinstance(value, dict) or set(value) - {"deviceId", "conversationId", "submissionId", "text", "sessionId", "model"}:
                raise ValueError()
            for name in ("deviceId", "conversationId", "submissionId"):
                if not isinstance(value.get(name), str) or not 1 <= len(value[name]) <= 128 or any(not (c.isascii() and (c.isalnum() or c in "-_")) for c in value[name]):
                    raise ValueError()
            if not isinstance(value.get("text"), str) or not value["text"].strip() or len(value["text"].encode()) > 64 * 1024:
                raise ValueError()
            for name in ("sessionId", "model"):
                if name in value and value[name] is not None and (not isinstance(value[name], str) or len(value[name]) > 512):
                    raise ValueError()
        except (ValueError, TypeError):
            raise web.HTTPBadRequest(text="Invalid background message")
        relay.store.accept(value)
        return web.json_response(relay.store.public(value["submissionId"]), status=202)

    async def get_job(request):
        key = request.match_info["key"]
        if not relay.store.job(key):
            raise web.HTTPNotFound()
        return web.json_response(relay.store.public(key))

    async def register(request):
        try:
            value = await request.json()
            if not isinstance(value, dict):
                raise ValueError()
        except (ValueError, TypeError):
            raise web.HTTPBadRequest()
        device, token = value.get("deviceId"), value.get("token")
        if not isinstance(device, str) or not 1 <= len(device) <= 128 or not isinstance(token, str) or not 1 <= len(token) <= 4096:
            raise web.HTTPBadRequest()
        with relay.store.db:
            relay.store.db.execute("INSERT INTO devices VALUES(?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token", (device, token))
        return web.json_response({"registered": True})

    async def lifetime(_app):
        async with ClientSession(timeout=ClientTimeout(total=40), trust_env=False) as http:
            task = asyncio.create_task(relay.scheduler(http))
            yield
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    app.router.add_get("/v1/health", health)
    app.router.add_post("/v1/jobs", submit)
    app.router.add_get("/v1/jobs/{key}", get_job)
    app.router.add_post("/v1/devices", register)
    app.cleanup_ctx.append(lifetime)
    return app


def main():
    os.umask(0o077)
    gateway = os.environ["WARREN_GATEWAY_URL"]
    parsed = urlsplit(gateway)
    if parsed.scheme not in {"ws", "wss"} or parsed.query or parsed.fragment or parsed.username or parsed.password or not parsed.path.endswith("/api/ws"):
        raise SystemExit("Invalid configured Gateway endpoint")
    auth = os.environ["WARREN_RELAY_TOKEN"]
    if len(auth) < 32:
        raise SystemExit("Use a separate relay token of at least 32 characters")
    store = Store(os.getenv("WARREN_RELAY_DB", "/var/lib/warren-relay/jobs.sqlite3"))
    relay = Relay(store, gateway, os.environ["WARREN_GATEWAY_TOKEN"], auth)
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if credentials_path:
        import firebase_admin
        from firebase_admin import credentials
        relay.push = firebase_admin.initialize_app(credentials.Certificate(credentials_path))
    web.run_app(app_for(relay), host="127.0.0.1", port=int(os.getenv("WARREN_RELAY_PORT", "8766")), access_log=None)


if __name__ == "__main__":
    main()

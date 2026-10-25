import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aiohttp import ClientSession, web
from aiohttp.test_utils import TestClient, TestServer
from relay import Relay, Store, app_for

REQUEST = {"deviceId": "device-1", "conversationId": "chat-1", "submissionId": "request-1", "text": "A task that must survive disconnects"}
RECEIPT = {"admission_id": "admission-1", "ref": {"session_id": "session-1"}, "status": "started", "outcome": None}


class RelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="warren-relay-")
        self.path = str(Path(self.folder.name) / "jobs.sqlite3")
        self.store = Store(self.path)
        self.relay = Relay(self.store, "ws://127.0.0.1/api/ws", "test-upstream-token", "test-relay-token")

    async def asyncTearDown(self):
        self.store.db.close()
        self.folder.cleanup()

    async def test_authenticated_http_accepts_idempotently_and_rejects_changed_content(self):
        client = TestClient(TestServer(app_for(self.relay)))
        await client.start_server()
        try:
            response = await client.post("/v1/jobs", json=REQUEST)
            self.assertEqual(response.status, 401)
            headers = {"Authorization": "Bearer test-relay-token"}
            for _ in range(2):
                response = await client.post("/v1/jobs", json=REQUEST, headers=headers)
                self.assertEqual(response.status, 202)
                self.assertEqual((await response.json())["submissionId"], "request-1")
            response = await client.post("/v1/jobs", json={**REQUEST, "text": "different"}, headers=headers)
            self.assertEqual(response.status, 409)
            self.assertEqual(self.store.db.execute("SELECT count(*) FROM jobs").fetchone()[0], 1)
            for bad in ([], {**REQUEST, "gatewayUrl": "http://other-host/"}, {**REQUEST, "submissionId": "../../path"}):
                response = await client.post("/v1/jobs", json=bad, headers=headers)
                self.assertEqual(response.status, 400)
            self.store.update("request-1", state="complete", text="Final reply")
            response = await client.get("/v1/jobs/request-1", headers=headers)
            body = await response.json()
            self.assertEqual(body["text"], "Final reply")
            self.assertNotIn("request", body)
        finally:
            await client.close()

    async def test_real_websocket_disconnect_reuses_submission_identity(self):
        submissions = []
        connections = 0

        async def websocket(request):
            nonlocal connections
            self.assertEqual(request.query["token"], "test-upstream-token")
            connections += 1
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            await ws.send_json({"jsonrpc": "2.0", "method": "event", "params": {"type": "gateway.ready", "payload": {"session_authority": True}}})
            async for message in ws:
                frame = json.loads(message.data)
                method, params = frame["method"], frame["params"]
                result = {}
                if method == "runtime.describe":
                    result = {"capabilities": ["durable-admission-v1", "event-replay-v1"]}
                elif method in {"session.create", "session.resume"}:
                    result = {"session_id": "session-1", "running": connections > 1, "info": {"desktop_protocol": "hermes-gateway-v1", "profile_name": "Leveret"}}
                elif method == "prompt.submit":
                    submissions.append(params["submission_id"])
                    if connections == 1:
                        # Server accepted the first submit, but its receipt never reached the relay.
                        await ws.close()
                        break
                    result = RECEIPT
                elif method == "prompt.receipt":
                    if params.get("include_result"):
                        await ws.send_json({"jsonrpc": "2.0", "id": frame["id"], "error": {"code": 4001, "message": "include_result is unavailable"}})
                        continue
                    result = {**RECEIPT, "status": "terminal", "outcome": "completed"}
                elif method == "session.events.since":
                    result = {"events": [{"type": "message.complete", "session_id": "session-1", "admission_id": "admission-1", "replay_epoch": "epoch", "seq": 1, "payload": {"text": "Finished after disconnect", "status": "complete"}}], "snapshot_required": False}
                await ws.send_json({"jsonrpc": "2.0", "id": frame["id"], "result": result})
            return ws

        app = web.Application()
        app.router.add_get("/api/ws", websocket)
        server = TestServer(app)
        await server.start_server()
        self.relay.gateway_url = str(server.make_url("/api/ws")).replace("http:", "ws:")
        self.store.accept(REQUEST)
        try:
            async with ClientSession() as http, asyncio.timeout(5):
                with patch("relay.RETRY_DELAY", 0.01):
                    await self.relay.execute(http, "request-1")
            self.assertEqual(submissions, ["request-1", "request-1"])
            self.assertEqual(self.store.job("request-1")["text"], "Finished after disconnect")
            self.assertEqual(self.store.job("request-1")["state"], "complete")
        finally:
            await server.close()

    async def test_committed_receipt_survives_store_restart_and_correlates_replay(self):
        self.store.accept(REQUEST)
        self.store.update("request-1", session="session-1", admission="admission-1", state="running")
        self.store.db.close()
        self.store = Store(self.path)
        self.relay.store = self.store
        event = {"type": "message.delta", "session_id": "session-1", "admission_id": "admission-1", "replay_epoch": "epoch", "seq": 3, "payload": {"text": "chunk"}}
        self.relay.event("request-1", {**event, "admission_id": "someone-else"})
        self.assertEqual(self.store.job("request-1")["text"], "")
        self.relay.event("request-1", event)
        self.relay.event("request-1", event)
        self.assertEqual(self.store.job("request-1")["text"], "chunk")
        self.relay.event("request-1", {**event, "seq": 4, "type": "message.complete", "payload": {"text": "Final", "status": "complete"}})
        self.assertEqual(self.store.public("request-1")["state"], "complete")
        self.assertEqual(self.store.public("request-1")["text"], "Final")

    async def test_uncertain_and_failed_gateway_results_are_never_success(self):
        self.store.accept(REQUEST)
        self.store.update("request-1", session="session-1", admission="admission-1", state="running")
        event = {"type": "message.complete", "session_id": "session-1", "admission_id": "admission-1", "payload": {"text": "partial"}}
        self.relay.event("request-1", event)
        self.assertEqual(self.store.job("request-1")["state"], "unknown")
        self.store.update("request-1", state="running")
        self.relay.event("request-1", {**event, "payload": {"outcome": "failed", "text": "partial"}})
        self.assertEqual(self.store.job("request-1")["state"], "error")


if __name__ == "__main__":
    unittest.main()

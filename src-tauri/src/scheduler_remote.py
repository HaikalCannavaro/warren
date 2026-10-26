"""Warren's remote crontab editor. Importing this module performs no I/O."""
import base64
import contextlib
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time

MAX_CRONTAB = 1024 * 1024
MAX_COMMAND = 32 * 1024
META = b"# WARREN_JOB "
DISABLED = b"# WARREN_DISABLED "
MACROS = {"@reboot", "@hourly", "@daily", "@weekly", "@monthly", "@yearly", "@annually", "@midnight"}
MONTHS = {name: index + 1 for index, name in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
DAYS = {name: index for index, name in enumerate("SUN MON TUE WED THU FRI SAT".split())}
ENVIRONMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*\s*=")


class CronError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message
        super().__init__(message)


def require(condition, code, message):
    if not condition:
        raise CronError(code, message)


def revision(raw):
    return hashlib.sha256(raw).hexdigest()


def clean_text(value, maximum, label, byte_limit=False, allow_tabs=False):
    require(isinstance(value, str), "invalid_job", f"{label} must be text.")
    require(value.strip() and not any((ord(char) < 32 and not (allow_tabs and char == "\t")) or 127 <= ord(char) <= 159 for char in value),
            "invalid_job", f"{label} must not be empty or contain line breaks or control characters.")
    try:
        encoded = value.encode("utf-8")
    except UnicodeError:
        raise CronError("invalid_job", f"{label} must contain valid Unicode text.")
    length = len(encoded) if byte_limit else len(value)
    require(length <= maximum, "invalid_job", f"{label} is too long.")
    return value


def validate_schedule(value):
    clean_text(value, 256, "Schedule", allow_tabs=True)
    fields = value.split()
    if len(fields) == 1 and fields[0] in MACROS:
        return fields[0]
    require(len(fields) == 5, "invalid_schedule", "Use five cron fields or a supported @macro.")
    for field, low, high, names in zip(fields, (0, 0, 1, 1, 0), (59, 23, 31, 12, 7), ({}, {}, {}, MONTHS, DAYS)):
        def number(token):
            if token.upper() in names:
                return names[token.upper()]
            require(bool(re.fullmatch(r"[0-9]{1,9}", token)), "invalid_schedule", "Cron fields contain an unsupported value.")
            return int(token)

        for part in field.split(","):
            segments = part.split("/")
            require(1 <= len(segments) <= 2, "invalid_schedule", "Invalid cron step.")
            if len(segments) == 2:
                require(bool(re.fullmatch(r"[0-9]{1,9}", segments[1])) and int(segments[1]) > 0,
                        "invalid_schedule", "Cron steps must be positive integers.")
            span = segments[0]
            if span == "*":
                continue
            bounds = span.split("-")
            require(1 <= len(bounds) <= 2 and all(bounds), "invalid_schedule", "Invalid cron range.")
            values = [number(token) for token in bounds]
            require(all(low <= item <= high for item in values) and values[0] <= values[-1],
                    "invalid_schedule", "A cron value or range is outside its allowed bounds.")
    return " ".join(fields)


def validate_job(job):
    require(isinstance(job, dict) and not set(job) - {"id", "name", "schedule", "command", "enabled"},
            "invalid_job", "Invalid scheduled job.")
    name = clean_text(job.get("name"), 120, "Name").strip()
    schedule = validate_schedule(job.get("schedule"))
    command = clean_text(job.get("command"), MAX_COMMAND, "Command", True, allow_tabs=True)
    require(type(job.get("enabled")) is bool, "invalid_job", "Choose whether the job is enabled.")
    if "id" in job:
        require(isinstance(job["id"], str) and job["id"], "invalid_job", "Invalid job identity.")
    return {"name": name, "schedule": schedule, "command": command, "enabled": job["enabled"]}


def lines(raw):
    pieces = raw.split(b"\n")
    return [piece + b"\n" for piece in pieces[:-1]] + ([pieces[-1]] if pieces[-1] else [])


def body(line):
    return line[:-2] if line.endswith(b"\r\n") else line[:-1] if line.endswith(b"\n") else line


def metadata(line):
    value = body(line)
    if not value.startswith(META):
        return None
    try:
        item = json.loads(base64.b64decode(value[len(META):], validate=True).decode("utf-8"))
        if not isinstance(item, dict) or set(item) != {"name"}:
            return None
        return clean_text(item["name"], 120, "Name").strip()
    except (ValueError, UnicodeError, CronError, KeyError):
        return None


def parse(raw):
    require(isinstance(raw, bytes) and len(raw) <= MAX_CRONTAB, "crontab_too_large", "This crontab exceeds Warren's 1 MiB limit.")
    source, entries, unsupported, custom_timezone = lines(raw), [], False, False
    for index, line in enumerate(source):
        original = body(line)
        enabled = not original.startswith(DISABLED)
        candidate = original if enabled else original[len(DISABLED):]
        try:
            # Only indentation and cron separators may be discarded. In a shell
            # command, an escaped trailing space or TAB can be significant.
            text = candidate.decode("utf-8").lstrip(" \t")
            if not text or text.startswith("#"):
                continue
            if ENVIRONMENT.match(text):
                custom_timezone |= bool(re.match(r"(?:CRON_TZ|TZ)\s*=", text))
                continue
            count = 1 if text.startswith("@") else 5
            fields = text.split(None, count)
            if len(fields) != count + 1:
                unsupported = True
                continue
            schedule = validate_schedule(" ".join(fields[:count]))
            command = clean_text(fields[-1], MAX_COMMAND, "Command", True, allow_tabs=True)
        except (UnicodeError, CronError):
            unsupported = True
            continue
        name = metadata(source[index - 1]) if index else None
        fallback_name = re.sub(r"[ \t]+", " ", command).strip(" \t")
        entry = {"id": f"line-{index + 1}-{hashlib.sha256(line).hexdigest()[:16]}",
                 "name": name or (fallback_name[:77] + "…" if len(fallback_name) > 80 else fallback_name),
                 "schedule": schedule, "command": command, "enabled": enabled,
                 "line": index, "metadata": index - 1 if name else None}
        entries.append(entry)
    warnings = []
    if unsupported:
        warnings.append("Some crontab lines use syntax Warren cannot edit; those lines are preserved.")
    if custom_timezone:
        warnings.append("CRON_TZ or TZ directives are present; individual jobs may use a different timezone.")
    return source, entries, " ".join(warnings) or None


def encoded_metadata(name):
    return META + base64.b64encode(json.dumps({"name": name}, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


class CronEditor:
    def __init__(self, read, install, lock, username, timezone):
        self.read, self.install, self.lock = read, install, lock
        self.username, self.timezone = username, timezone

    def snapshot(self, raw, warning=None):
        _, entries, parsed_warning = parse(raw)
        return {"revision": revision(raw), "username": self.username, "timezone": self.timezone,
                "jobs": [{key: value for key, value in entry.items() if key not in {"line", "metadata"}} for entry in entries],
                "warning": " ".join(filter(None, (parsed_warning, warning))) or None}

    def handle(self, request):
        require(isinstance(request, dict), "invalid_request", "Invalid scheduler request.")
        action = request.get("action")
        allowed = {"list": {"action"}, "save": {"action", "revision", "job"},
                   "toggle": {"action", "revision", "id", "enabled"}, "delete": {"action", "revision", "id"}}
        require(isinstance(action, str) and action in allowed and not set(request) - allowed[action], "invalid_request", "Unsupported scheduler action.")
        if action == "list":
            return self.snapshot(self.read())
        require(isinstance(request.get("revision"), str) and bool(re.fullmatch(r"[0-9a-f]{64}", request["revision"])),
                "invalid_request", "A current crontab revision is required. Refresh before editing.")
        job = validate_job(request.get("job")) if action == "save" else None
        target = request["job"].get("id") if action == "save" else request.get("id")
        if action != "save":
            require(isinstance(target, str) and target, "invalid_request", "Choose an existing job.")
        if action == "toggle":
            require(type(request.get("enabled")) is bool, "invalid_request", "Choose whether the job is enabled.")
        with self.lock():
            raw = self.read()
            source, entries, _ = parse(raw)
            require(request["revision"] == revision(raw), "stale_revision", "The server crontab changed. Refresh before applying this edit.")
            entry = next((item for item in entries if item["id"] == target), None) if target else None
            require(not target or entry is not None, "job_not_found", "This job no longer exists. Refresh the list.")
            if action == "save":
                new_line = (job["schedule"] + " " + job["command"]).encode("utf-8")
                if not job["enabled"]:
                    new_line = DISABLED + new_line
                meta = encoded_metadata(job["name"])
                if entry:
                    position = entry["line"]
                    source[position] = new_line + b"\n"
                    if entry["metadata"] is not None:
                        source[entry["metadata"]] = meta + b"\n"
                    else:
                        source.insert(position, meta + b"\n")
                else:
                    if source and not source[-1].endswith(b"\n"):
                        source[-1] += b"\n"
                    source.extend((meta + b"\n", new_line + b"\n"))
            elif action == "delete":
                for position in sorted(filter(lambda value: value is not None, (entry["line"], entry["metadata"])), reverse=True):
                    del source[position]
            else:
                if entry["enabled"] == request["enabled"]:
                    return self.snapshot(raw)
                line = source[entry["line"]]
                source[entry["line"]] = line[len(DISABLED):] if request["enabled"] else DISABLED + line
            updated = b"".join(source)
            if updated and not updated.endswith(b"\n"):
                updated += b"\n"
            require(len(updated) <= MAX_CRONTAB, "crontab_too_large", "The updated crontab exceeds Warren's 1 MiB limit.")
            self.install(updated)
            actual = self.read()
            warning = None if actual == updated else "The crontab changed again after saving. Review the current list before retrying."
            return self.snapshot(actual, warning)


def cli_read(runner=subprocess.run):
    try:
        result = runner(["crontab", "-l"], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        env={**os.environ, "LC_ALL": "C"}, timeout=5, check=False)
    except FileNotFoundError:
        raise CronError("cron_unavailable", "The crontab command is not installed on this Linux host.")
    except subprocess.TimeoutExpired:
        raise CronError("cron_timeout", "Reading the server crontab timed out.")
    except OSError:
        raise CronError("cron_read_failed", "Cannot run crontab for this SSH user. Check cron permissions on the server.")
    if result.returncode == 1 and b"no crontab" in result.stderr.lower():
        return b""
    require(result.returncode == 0, "cron_read_failed", "Cannot read this SSH user's crontab. Check cron permissions on the server.")
    require(len(result.stdout) <= MAX_CRONTAB, "crontab_too_large", "This crontab exceeds Warren's 1 MiB limit.")
    return result.stdout


def cli_install(raw, runner=subprocess.run):
    try:
        result = runner(["crontab", "-"], input=raw, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        env={**os.environ, "LC_ALL": "C"}, timeout=5, check=False)
    except FileNotFoundError:
        raise CronError("cron_unavailable", "The crontab command is not installed on this Linux host.")
    except subprocess.TimeoutExpired:
        raise CronError("cron_timeout", "Crontab installation was not confirmed. Refresh before retrying.")
    except OSError:
        raise CronError("cron_install_failed", "Cannot install this SSH user's crontab. Check cron permissions on the server.")
    require(result.returncode == 0, "cron_install_failed", "The server rejected the crontab update. Check cron syntax and permissions, then refresh.")


@contextlib.contextmanager
def user_lock(directory_root="/tmp", timeout=2):
    # This coordinates Warren writers only. External editors need not honor it.
    import fcntl
    uid = os.getuid()
    path = os.path.join(directory_root, f"warren-scheduler-{uid}")
    try:
        try:
            os.mkdir(path, 0o700)
        except FileExistsError:
            pass
        directory = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            info = os.fstat(directory)
            require(stat.S_ISDIR(info.st_mode) and info.st_uid == uid and not info.st_mode & 0o077,
                    "unsafe_lock", "The scheduler lock directory has unsafe ownership or permissions.")
            descriptor = os.open("edit.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=directory)
        finally:
            os.close(directory)
        try:
            info = os.fstat(descriptor)
            require(stat.S_ISREG(info.st_mode) and info.st_uid == uid and info.st_nlink == 1 and not info.st_mode & 0o077,
                    "unsafe_lock", "The scheduler lock file has unsafe ownership or permissions.")
            deadline = time.monotonic() + timeout
            while True:
                try:
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    require(time.monotonic() < deadline, "scheduler_busy", "Another Warren edit is in progress. Refresh and retry.")
                    time.sleep(0.05)
            try:
                yield
            finally:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
        finally:
            os.close(descriptor)
    except OSError:
        raise CronError("unsafe_lock", "The scheduler lock is unavailable or has unsafe permissions.")


def server_timezone():
    try:
        target = os.path.realpath("/etc/localtime")
        if "/zoneinfo/" in target:
            return target.split("/zoneinfo/", 1)[1]
        with open("/etc/timezone", encoding="utf-8") as source:
            value = source.read(256).strip()
            if value:
                return value
    except OSError:
        pass
    return time.tzname[0] or "server local time"


def main():
    try:
        require(sys.platform.startswith("linux"), "unsupported_host", "Scheduler requires a Linux host with Python 3 and crontab.")
        require(len(sys.argv) == 2 and len(sys.argv[1]) <= 262144, "invalid_request", "Invalid scheduler request.")
        try:
            request = json.loads(base64.b64decode(sys.argv[1], validate=True).decode("utf-8"))
        except (ValueError, UnicodeError):
            raise CronError("invalid_request", "The scheduler request is not valid base64 JSON.")
        import pwd
        editor = CronEditor(cli_read, cli_install, user_lock, pwd.getpwuid(os.getuid()).pw_name, server_timezone())
        response = editor.handle(request)
    except CronError as error:
        response = {"error": error.code, "message": error.message}
    except Exception:
        response = {"error": "scheduler_failed", "message": "The scheduler operation could not be completed. Refresh and check the Linux host."}
    # ASCII JSON also works when an SSH account uses an ASCII-only locale.
    print(json.dumps(response, ensure_ascii=True, separators=(",", ":")))


if __name__ == "__main__":
    main()

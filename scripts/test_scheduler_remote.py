import base64
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("scheduler_remote", Path(__file__).parents[1] / "src-tauri/src/scheduler_remote.py")
scheduler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scheduler)


class Store:
    def __init__(self, raw=b""):
        self.raw, self.installs, self.locked = raw, [], False
        self.editor = scheduler.CronEditor(self.read, self.install, self.lock, "deploy", "Asia/Jakarta")

    def read(self):
        return self.raw

    def install(self, value):
        assert self.locked
        self.installs.append(value)
        self.raw = value

    @contextlib.contextmanager
    def lock(self):
        self.locked = True
        try:
            yield
        finally:
            self.locked = False

    def list(self):
        return self.editor.handle({"action": "list"})

    def apply(self, action, **values):
        return self.editor.handle({"action": action, "revision": self.list()["revision"], **values})


def job(**changes):
    return {"name": "Nightly backup", "schedule": "15 2 * * *", "command": "/opt/backup.sh", "enabled": True, **changes}


class SchedulerTests(unittest.TestCase):
    def test_lists_active_and_warren_disabled_entries_without_adopting_comments(self):
        store = Store(b"# keep comment\nSHELL=/bin/bash\n# * * * * * commented\n0 3 * * * /opt/backup\n# WARREN_DISABLED @reboot /opt/start\n")
        result = store.list()
        self.assertEqual([item["enabled"] for item in result["jobs"]], [True, False])
        self.assertEqual(result["jobs"][1]["schedule"], "@reboot")
        self.assertEqual(result["username"], "deploy")
        self.assertEqual(store.installs, [])

    def test_create_edit_toggle_delete_preserves_unrelated_bytes(self):
        original = b"# private notes\r\nMAILTO=ops@example.test\r\nCRON_TZ=UTC\n@unsupported leave-me-alone\n0 4 * * * existing --flag\n"
        store = Store(original)
        created = store.apply("save", job=job())
        self.assertTrue(store.raw.startswith(original))
        saved = created["jobs"][-1]
        self.assertEqual(saved["name"], "Nightly backup")
        edited = store.apply("save", job=job(id=saved["id"], name="Weekly backup", schedule="0 2 * * MON"))
        selected = edited["jobs"][-1]
        disabled = store.apply("toggle", id=selected["id"], enabled=False)
        self.assertFalse(disabled["jobs"][-1]["enabled"])
        enabled = store.apply("toggle", id=disabled["jobs"][-1]["id"], enabled=True)
        self.assertTrue(enabled["jobs"][-1]["enabled"])
        store.apply("delete", id=enabled["jobs"][-1]["id"])
        self.assertEqual(store.raw, original)

    def test_edit_plain_entry_adds_only_its_own_metadata(self):
        store = Store(b"# user notes\n0 2 * * * /opt/old\n# trailing\n")
        identity = store.list()["jobs"][0]["id"]
        result = store.apply("save", job=job(id=identity, name="Backup", command="/opt/new"))
        self.assertEqual(result["jobs"][0]["name"], "Backup")
        self.assertTrue(store.raw.startswith(b"# user notes\n# WARREN_JOB "))
        self.assertTrue(store.raw.endswith(b"# trailing\n"))

    def test_ordinary_comment_and_invalid_metadata_are_not_deleted(self):
        original = b"# WARREN_JOB not-valid-base64\n# ordinary comment\n@daily /opt/job\n"
        store = Store(original)
        store.apply("delete", id=store.list()["jobs"][0]["id"])
        self.assertEqual(store.raw, b"# WARREN_JOB not-valid-base64\n# ordinary comment\n")

    def test_toggle_round_trip_preserves_original_spacing_and_crlf(self):
        original = b"# heading\n  5\t1  * * *   /opt/job --flag\r\n"
        store = Store(original)
        disabled = store.apply("toggle", id=store.list()["jobs"][0]["id"], enabled=False)
        store.apply("toggle", id=disabled["jobs"][0]["id"], enabled=True)
        self.assertEqual(store.raw, original)

    def test_name_only_edit_preserves_escaped_trailing_command_space(self):
        original_command = "/opt/job\\ "
        store = Store(b"# untouched\n@daily " + original_command.encode() + b"\n")
        selected = store.list()["jobs"][0]
        self.assertEqual(selected["command"], original_command)
        changed = store.apply("save", job={**selected, "name": "Renamed only"})
        self.assertEqual(changed["jobs"][0]["command"], original_command)
        self.assertTrue(store.raw.endswith(b"@daily " + original_command.encode() + b"\n"))
        self.assertTrue(store.raw.startswith(b"# untouched\n"))

    def test_tabs_are_valid_command_and_schedule_whitespace_but_not_name_controls(self):
        command = "printf\t'%s'\tvalue\\ \t"
        store = Store(b"000000005\t01\t* JAN MON-FRI\t" + command.encode() + b"\n")
        selected = store.list()["jobs"][0]
        self.assertEqual(selected["command"], command)
        self.assertNotIn("\t", selected["name"])
        changed = store.apply("save", job={**selected, "name": "Tab command", "schedule": "000000005\t01\t* JAN MON-FRI"})
        self.assertEqual(changed["jobs"][0]["command"], command)
        with self.assertRaises(scheduler.CronError):
            store.apply("save", job=job(name="Invalid\tname"))

    def test_numeric_endpoints_and_steps_accept_at_most_nine_ascii_digits(self):
        self.assertEqual(scheduler.validate_schedule("000000005 000000001 * * *"), "000000005 000000001 * * *")
        self.assertEqual(scheduler.validate_schedule("*/000000001 * * * *"), "*/000000001 * * * *")
        for value in ("0000000005 * * * *", "*/0000000001 * * * *", "000000060 * * * *", "*/000000000 * * * *"):
            with self.subTest(value=value), self.assertRaises(scheduler.CronError):
                scheduler.validate_schedule(value)

    def test_new_job_terminates_existing_last_line_without_rewriting_it(self):
        store = Store(b"# existing final comment")
        store.apply("save", job=job())
        self.assertTrue(store.raw.startswith(b"# existing final comment\n# WARREN_JOB "))
        self.assertTrue(store.raw.endswith(b"\n"))

    def test_named_ranges_lists_steps_and_macros(self):
        for value in ["*/5 1-4/2 1,15 JAN,MAR MON-FRI", "0 0 * jan-dec/2 sun,7", "@reboot", "@hourly", "@daily", "@weekly", "@monthly", "@yearly", "@annually", "@midnight"]:
            with self.subTest(value=value):
                self.assertEqual(scheduler.validate_schedule(value), value)

    def test_invalid_schedules_are_rejected(self):
        for value in ["", "* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "*/0 * * * *", "1,,2 * * * *", "* * * DEC-JAN *", "@unknown", "* * * * *\n@reboot bad", "* * * * MON#2"]:
            with self.subTest(value=value), self.assertRaises(scheduler.CronError):
                scheduler.validate_schedule(value)

    def test_newline_control_and_oversized_commands_are_rejected(self):
        for command in ["", "   ", "true\nfalse", "true\rfalse", "echo\x1bsecret", "x" * (scheduler.MAX_COMMAND + 1), "é" * scheduler.MAX_COMMAND]:
            with self.subTest(command=repr(command[:20])), self.assertRaises(scheduler.CronError):
                Store().apply("save", job=job(command=command))

    def test_stale_revision_is_checked_again_inside_the_lock(self):
        store = Store(b"@daily /opt/old\n")
        before = store.list()
        store.raw = b"@daily /opt/external-change\n"
        with self.assertRaises(scheduler.CronError) as error:
            store.editor.handle({"action": "delete", "revision": before["revision"], "id": before["jobs"][0]["id"]})
        self.assertEqual(error.exception.code, "stale_revision")
        self.assertEqual(store.installs, [])

    def test_install_failure_leaves_fake_original_intact(self):
        store = Store(b"@daily /opt/old\n")
        original = store.raw
        def reject(_raw):
            raise scheduler.CronError("cron_install_failed", "Rejected")
        store.editor.install = reject
        with self.assertRaises(scheduler.CronError):
            store.apply("save", job=job())
        self.assertEqual(store.raw, original)

    def test_commands_are_only_stdin_data_to_crontab_not_shell_arguments(self):
        command = "echo $(touch /tmp/never-created); printf '%s' `id`"
        store = Store()
        result = store.apply("save", job=job(command=command))
        calls = []
        def runner(args, **kwargs):
            calls.append((args, kwargs))
            return subprocess.CompletedProcess(args, 0, b"", b"")
        scheduler.cli_install(store.raw, runner)
        self.assertEqual(result["jobs"][0]["command"], command)
        self.assertEqual(calls[0][0], ["crontab", "-"])
        self.assertIn(command.encode(), calls[0][1]["input"])
        self.assertNotIn("shell", calls[0][1])

    def test_cli_empty_missing_permissions_and_timeout_are_distinct(self):
        empty = lambda args, **kw: subprocess.CompletedProcess(args, 1, b"", b"no crontab for deploy\n")
        self.assertEqual(scheduler.cli_read(empty), b"")
        denied = lambda args, **kw: subprocess.CompletedProcess(args, 1, b"", b"permission denied")
        with self.assertRaises(scheduler.CronError) as error:
            scheduler.cli_read(denied)
        self.assertEqual(error.exception.code, "cron_read_failed")
        def missing(*args, **kwargs):
            raise FileNotFoundError()
        with self.assertRaises(scheduler.CronError) as error:
            scheduler.cli_read(missing)
        self.assertEqual(error.exception.code, "cron_unavailable")
        def timeout(*args, **kwargs):
            raise subprocess.TimeoutExpired("crontab", 5)
        with self.assertRaises(scheduler.CronError) as error:
            scheduler.cli_read(timeout)
        self.assertEqual(error.exception.code, "cron_timeout")

    def test_unknown_lines_and_timezone_overrides_are_preserved_and_reported(self):
        raw = b"CRON_TZ=UTC\n@unsupported /opt/keep\n\xff\xfe\n@hourly /opt/valid\n"
        store = Store(raw)
        result = store.list()
        self.assertEqual(len(result["jobs"]), 1)
        self.assertIn("CRON_TZ", result["warning"])
        self.assertIn("preserved", result["warning"])
        store.apply("save", job=job())
        self.assertTrue(store.raw.startswith(raw))

    def test_unknown_id_and_invalid_boolean_never_install(self):
        store = Store(b"@daily /opt/job\n")
        with self.assertRaises(scheduler.CronError):
            store.apply("delete", id="missing")
        with self.assertRaises(scheduler.CronError):
            store.apply("toggle", id=store.list()["jobs"][0]["id"], enabled=1)
        self.assertEqual(store.installs, [])

    def test_noop_toggle_does_not_install(self):
        store = Store(b"@daily /opt/job\n")
        store.apply("toggle", id=store.list()["jobs"][0]["id"], enabled=True)
        self.assertEqual(store.installs, [])

    def test_entrypoint_reads_base64_argument_and_emits_one_json_response(self):
        encoded = base64.b64encode(b'{"action":"list"}').decode()
        fake_pwd = types.SimpleNamespace(getpwuid=lambda _uid: types.SimpleNamespace(pw_name="deploy"))
        output = io.StringIO()
        with patch.object(scheduler.sys, "platform", "linux"), patch.object(scheduler.sys, "argv", ["warren-scheduler", encoded]), \
                patch.dict("sys.modules", {"pwd": fake_pwd}), patch.object(scheduler.os, "getuid", return_value=1000, create=True), \
                patch.object(scheduler, "server_timezone", return_value="Asia/Jakarta"), \
                patch.object(scheduler, "cli_read", return_value=b"@daily /opt/job\n") as reader, contextlib.redirect_stdout(output):
            scheduler.main()
        self.assertEqual(len(output.getvalue().splitlines()), 1)
        self.assertEqual(json.loads(output.getvalue())["jobs"][0]["command"], "/opt/job")
        reader.assert_called_once_with()

    def test_entrypoint_rejects_malformed_request_without_running_crontab(self):
        output = io.StringIO()
        with patch.object(scheduler.sys, "platform", "linux"), patch.object(scheduler.sys, "argv", ["warren-scheduler", "not-base64"]), \
                patch.object(scheduler, "cli_read") as reader, contextlib.redirect_stdout(output):
            scheduler.main()
        self.assertEqual(json.loads(output.getvalue())["error"], "invalid_request")
        reader.assert_not_called()

    def test_external_edit_after_install_is_returned_as_current_content(self):
        store = Store(b"@daily /opt/old\n")
        def changed_again(_raw):
            store.raw = b"@hourly /opt/external\n"
        store.editor.install = changed_again
        result = store.apply("save", job=job())
        self.assertIn("changed again", result["warning"])
        self.assertEqual(result["jobs"][0]["command"], "/opt/external")

    @unittest.skipUnless(os.name == "posix", "POSIX lock behavior is verified on Linux CI")
    def test_lock_rejects_directory_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory, "target")
            target.mkdir(mode=0o700)
            Path(directory, f"warren-scheduler-{os.getuid()}").symlink_to(target, target_is_directory=True)
            with self.assertRaises(scheduler.CronError):
                with scheduler.user_lock(directory):
                    self.fail("Unsafe lock was accepted")

    @unittest.skipUnless(os.name == "posix", "POSIX lock behavior is verified on Linux CI")
    def test_lock_rejects_symlink_or_hardlinked_lock_file(self):
        for link in ("symlink", "hardlink"):
            with self.subTest(link=link), tempfile.TemporaryDirectory() as directory:
                lock_directory = Path(directory, f"warren-scheduler-{os.getuid()}")
                lock_directory.mkdir(mode=0o700)
                target = Path(directory, "unchanged")
                target.write_bytes(b"unchanged")
                target.chmod(0o600)
                lock = lock_directory / "edit.lock"
                if link == "symlink":
                    lock.symlink_to(target)
                else:
                    os.link(target, lock)
                with self.assertRaises(scheduler.CronError):
                    with scheduler.user_lock(directory):
                        self.fail("Unsafe lock was accepted")
                self.assertEqual(target.read_bytes(), b"unchanged")

    @unittest.skipUnless(os.name == "posix", "POSIX lock behavior is verified on Linux CI")
    def test_lock_is_private_and_has_bounded_contention_wait(self):
        with tempfile.TemporaryDirectory() as directory:
            with scheduler.user_lock(directory):
                root = Path(directory, f"warren-scheduler-{os.getuid()}")
                self.assertEqual(root.stat().st_mode & 0o777, 0o700)
                self.assertEqual((root / "edit.lock").stat().st_mode & 0o777, 0o600)
                with self.assertRaises(scheduler.CronError) as error:
                    with scheduler.user_lock(directory, timeout=0.01):
                        self.fail("Concurrent lock was accepted")
                self.assertEqual(error.exception.code, "scheduler_busy")


if __name__ == "__main__":
    unittest.main()

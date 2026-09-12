import importlib.util
import os
from pathlib import Path
import re
import signal
import subprocess
import unittest
from unittest.mock import Mock, patch


DIRECTORY = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("start_zotero", DIRECTORY / "start-zotero.py")
startup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(startup)


class DesktopTests(unittest.TestCase):
    def test_browser_and_callback_are_packaged_inside_the_test_desktop(self):
        recipe = (DIRECTORY / "Dockerfile").read_text()
        self.assertIn("https://packages.mozilla.org/apt/pool/mozilla/${FIREFOX_DEB}", recipe)
        self.assertIn('${FIREFOX_SHA256_ARM64}  /tmp/firefox.deb', recipe)
        self.assertIn("update-desktop-database /usr/share/applications", recipe)
        defaults = (DIRECTORY / "mimeapps.list").read_text()
        self.assertIn("x-scheme-handler/https=firefox.desktop", defaults)
        self.assertIn("x-scheme-handler/zotero=zotero-test.desktop", defaults)
        callback = (DIRECTORY / "zotero-test.desktop").read_text()
        self.assertIn("Exec=/opt/zotero/zotero -url %U", callback)
        for filename in ("mimeapps.list", "zotero-test.desktop"):
            self.assertIn(f"!{filename}", (DIRECTORY / ".dockerignore").read_text())

    def test_archive_and_base_match_the_existing_verified_recipe(self):
        existing = (DIRECTORY.parents[2] / "apps/zotero/desktop/Dockerfile").read_text()
        recipe = (DIRECTORY / "Dockerfile").read_text()
        for pattern in (
            r"FROM ubuntu:[^\n]+",
            r"ARG ZOTERO_VERSION=[^\n]+",
            r"ARG ZOTERO_SHA256_ARM64=[^\n]+",
        ):
            self.assertEqual(re.search(pattern, existing)[0], re.search(pattern, recipe)[0])
        self.assertIn('test "${BUILDARCH}" = arm64', recipe)
        self.assertIn('test "${TARGETARCH}" = arm64', recipe)

    def test_invalid_geometry_fails_before_any_process_starts(self):
        desktop = startup.Desktop()
        with patch.dict(os.environ, {"ZOTERO_DESKTOP_GEOMETRY": "1600x1000 -localhost=0"}):
            with self.assertRaisesRegex(RuntimeError, "WIDTHxHEIGHT"):
                desktop.run()
        self.assertEqual(desktop.processes, [])

    def test_root_is_rejected_before_display_or_profile_changes(self):
        desktop = startup.Desktop()
        with patch.dict(os.environ, {"ZOTERO_DESKTOP_GEOMETRY": "1600x1000", "HOME": "/config"}):
            with patch.object(startup.os, "getuid", return_value=0):
                with self.assertRaisesRegex(RuntimeError, "UID 10001"):
                    desktop.run()
        self.assertEqual(desktop.processes, [])

    def test_display_failure_prevents_startup(self):
        desktop = startup.Desktop()
        server = Mock()
        server.poll.return_value = 1
        with self.assertRaisesRegex(RuntimeError, "exited before becoming ready"):
            desktop.wait_for_display(server)

    def test_stop_during_display_startup_returns_without_launching_apps(self):
        desktop = startup.Desktop()
        desktop.request_stop(signal.SIGTERM, None)
        self.assertFalse(desktop.wait_for_display(Mock()))

    def test_services_get_separate_process_groups(self):
        desktop = startup.Desktop()
        with patch.object(startup.subprocess, "Popen") as launch:
            process = desktop.start("example", ["example"])
        launch.assert_called_once_with(["example"], start_new_session=True)
        self.assertEqual(desktop.processes, [("example", process)])

    def test_shutdown_escalates_after_a_bounded_grace_period(self):
        desktop = startup.Desktop()
        process = Mock(pid=12345)
        process.wait.side_effect = [subprocess.TimeoutExpired("example", 8), 0]
        desktop.processes = [("example", process)]
        with patch.object(startup.os, "killpg") as kill_group:
            desktop.stop()
        self.assertEqual(kill_group.call_args_list, [
            unittest.mock.call(12345, signal.SIGTERM),
            unittest.mock.call(12345, signal.SIGKILL),
        ])
        self.assertLessEqual(process.wait.call_args_list[0].kwargs["timeout"], 8)


if __name__ == "__main__":
    unittest.main()

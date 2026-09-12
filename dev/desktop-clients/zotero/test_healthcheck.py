import contextlib
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import unittest
from unittest.mock import Mock, patch

import healthcheck


VERSION = b"RFB 003.008\n"
SERVER_INIT = struct.pack("!HH", 320, 240) + bytes(16) + struct.pack("!I", 4) + b"Test"
SUCCESS = VERSION + b"\x01\x01" + bytes(4) + SERVER_INIT


class FakeConnection:
    def __init__(self, incoming, chunk_size=1024):
        self.incoming = incoming
        self.chunk_size = chunk_size
        self.sent = bytearray()

    def settimeout(self, timeout):
        self.timeout = timeout

    def recv(self, size):
        size = min(size, self.chunk_size)
        result = self.incoming[:size]
        self.incoming = self.incoming[size:]
        return result

    def sendall(self, message):
        self.sent.extend(message)


class HandshakeTests(unittest.TestCase):
    def test_completes_shared_session_without_input_or_framebuffer_requests(self):
        connection = FakeConnection(SUCCESS, chunk_size=1)
        healthcheck.complete_handshake(connection, time.monotonic() + 2)
        self.assertEqual(connection.sent, VERSION + b"\x01\x01")
        self.assertEqual(connection.incoming, b"")

    def test_selects_none_from_the_offered_security_types(self):
        connection = FakeConnection(VERSION + b"\x02\x02\x01" + bytes(4) + SERVER_INIT)
        healthcheck.complete_handshake(connection, time.monotonic() + 2)
        self.assertEqual(connection.sent, VERSION + b"\x01\x01")

    def test_rejects_tigervnc_blacklist_response_despite_valid_rfb_prefix(self):
        reason = b"Too many security failures"
        response = b"RFB 003.003\n" + bytes(4) + struct.pack("!I", len(reason)) + reason
        connection = FakeConnection(response)
        with self.assertRaisesRegex(ValueError, "protocol or rejected"):
            healthcheck.complete_handshake(connection, time.monotonic() + 2)
        self.assertEqual(connection.sent, b"")

    def test_rejects_denied_or_unexpected_security(self):
        responses = [VERSION + b"\x00", VERSION + b"\x01\x02",
                     VERSION + b"\x01\x01\x00\x00\x00\x01"]
        for response in responses:
            with self.subTest(response=response):
                with self.assertRaises(ValueError):
                    healthcheck.complete_handshake(FakeConnection(response), time.monotonic() + 2)

    def test_rejects_every_truncated_handshake(self):
        for length in range(len(SUCCESS)):
            with self.subTest(length=length):
                with self.assertRaises(ValueError):
                    healthcheck.complete_handshake(FakeConnection(SUCCESS[:length]), time.monotonic() + 2)

    def test_rejects_empty_geometry_and_oversized_desktop_names(self):
        for width, height, length in [(0, 240, 0), (320, 0, 0), (320, 240, 4097)]:
            header = struct.pack("!HH", width, height) + bytes(16) + struct.pack("!I", length)
            with self.subTest(width=width, height=height, length=length):
                with self.assertRaisesRegex(ValueError, "initialization"):
                    healthcheck.complete_handshake(
                        FakeConnection(VERSION + b"\x01\x01" + bytes(4) + header), time.monotonic() + 2,
                    )

    def test_fragmented_reads_cannot_extend_the_handshake_deadline(self):
        connection = FakeConnection(VERSION, chunk_size=1)
        with patch.object(healthcheck.time, "monotonic", side_effect=[10, 11, 12]):
            with self.assertRaises(TimeoutError):
                healthcheck.read_exact(connection, 12, deadline=12)
        self.assertEqual(connection.incoming, VERSION[2:])

    def test_main_reports_handshake_rejection_and_transport_errors_as_unhealthy(self):
        response = Mock(status=200)
        failures = [ValueError("rejected"), TimeoutError("timeout"), OSError("closed")]
        for failure in failures:
            with self.subTest(failure=failure):
                with patch.object(healthcheck.urllib.request, "urlopen", return_value=contextlib.nullcontext(response)):
                    with patch.object(healthcheck.socket, "create_connection", return_value=contextlib.nullcontext(Mock())):
                        with patch.object(healthcheck, "complete_handshake", side_effect=failure):
                            self.assertEqual(healthcheck.main(), 1)

    def test_main_requires_http_and_the_complete_handshake_for_success(self):
        connection = FakeConnection(SUCCESS)
        with patch.object(healthcheck.urllib.request, "urlopen", return_value=contextlib.nullcontext(Mock(status=200))):
            with patch.object(healthcheck.socket, "create_connection", return_value=contextlib.nullcontext(connection)):
                self.assertEqual(healthcheck.main(), 0)
        self.assertEqual(connection.sent, VERSION + b"\x01\x01")
        self.assertEqual(connection.incoming, b"")

    def test_non_200_http_status_does_not_open_a_vnc_connection(self):
        with patch.object(healthcheck.urllib.request, "urlopen", return_value=contextlib.nullcontext(Mock(status=503))):
            with patch.object(healthcheck.socket, "create_connection") as connect:
                self.assertEqual(healthcheck.main(), 1)
                connect.assert_not_called()

    def test_http_failure_does_not_open_a_vnc_connection(self):
        with patch.object(healthcheck.urllib.request, "urlopen", side_effect=OSError("HTTP unavailable")):
            with patch.object(healthcheck.socket, "create_connection") as connect:
                self.assertEqual(healthcheck.main(), 1)
                connect.assert_not_called()


@unittest.skipUnless(shutil.which("Xtigervnc") and shutil.which("xdpyinfo"), "native TigerVNC required")
class NativeVncTests(unittest.TestCase):
    def setUp(self):
        # Run only in a disposable test container, never on a retained display.
        if os.environ.get("ZOTERO_HEALTHCHECK_NATIVE_TESTS") != "1" or not Path("/.dockerenv").exists():
            self.skipTest("native fixture requires explicit opt-in in a disposable Docker container")
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            self.port = reservation.getsockname()[1]
        self.log = tempfile.TemporaryFile(mode="w+")
        self.addCleanup(self.log.close)
        self.server = subprocess.Popen([
            "Xtigervnc", ":99", "-rfbport", str(self.port), "-SecurityTypes", "None",
            "-localhost=1", "-nolisten", "tcp", "-geometry", "320x240", "-depth", "24",
        ], stdout=self.log, stderr=self.log)
        self.addCleanup(self.stop_server)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            self.assertIsNone(self.server.poll(), "VNC fixture exited before readiness")
            try:
                result = subprocess.run(["xdpyinfo", "-display", ":99"],
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1)
            except subprocess.TimeoutExpired:
                continue
            if result.returncode == 0:
                return
            time.sleep(0.05)
        self.fail("VNC fixture did not become ready")

    def stop_server(self):
        self.server.terminate()
        try:
            self.server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.server.kill()
            self.server.wait(timeout=3)

    def connect(self):
        return socket.create_connection(("127.0.0.1", self.port), timeout=2)

    def test_banner_only_probe_reproduces_blacklisting_and_false_success(self):
        banners = []
        for _attempt in range(12):
            with self.connect() as connection:
                banner = healthcheck.read_exact(connection, 12, time.monotonic() + 2)
                self.assertTrue(banner.startswith(b"RFB "))
                banners.append(banner)
            time.sleep(0.02)
        self.assertIn(b"RFB 003.003\n", banners)
        with self.connect() as connection:
            with self.assertRaises(ValueError):
                healthcheck.complete_handshake(connection, time.monotonic() + 2)
        self.log.seek(0)
        self.assertIn("Connections: blacklisted: 127.0.0.1", self.log.read())

    def test_repeated_shared_probes_keep_viewer_connected_without_blacklisting(self):
        with self.connect() as viewer:
            healthcheck.complete_handshake(viewer, time.monotonic() + 2)
            for _attempt in range(30):
                with self.connect() as connection:
                    healthcheck.complete_handshake(connection, time.monotonic() + 2)
            # Request one raw pixel on the synthetic test display to prove the
            # retained viewer's original connection still works after all probes.
            viewer.sendall(struct.pack("!BBH", 2, 0, 1) + struct.pack("!i", 0))
            viewer.sendall(struct.pack("!BBHHHH", 3, 0, 0, 0, 1, 1))
            update = healthcheck.read_exact(viewer, 4, time.monotonic() + 2)
            self.assertEqual(update, b"\x00\x00\x00\x01")
            rectangle = healthcheck.read_exact(viewer, 12, time.monotonic() + 2)
            self.assertEqual(struct.unpack("!HHHHi", rectangle), (0, 0, 1, 1, 0))
            healthcheck.read_exact(viewer, 4, time.monotonic() + 2)
        self.log.seek(0)
        self.assertNotIn("blacklisted", self.log.read())


if __name__ == "__main__":
    unittest.main()

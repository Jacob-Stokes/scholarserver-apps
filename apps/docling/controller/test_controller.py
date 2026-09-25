import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from email.message import Message
from unittest import mock
from pathlib import Path


class ControllerTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        os.environ["SCHOLARSERVER_RUNTIME"] = str(root / "runtime")
        os.environ["SCHOLARSERVER_DOCUMENTS"] = str(root / "documents")
        (root / "documents").mkdir()
        spec = importlib.util.spec_from_file_location("docling_controller", Path(__file__).with_name("controller.py"))
        self.controller = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = self.controller
        spec.loader.exec_module(self.controller)
        self.controller.migrate()

    def tearDown(self):
        self.temporary.cleanup()

    def test_enqueue_is_hash_idempotent(self):
        (self.controller.DOCUMENTS / "paper.pdf").write_bytes(b"%PDF-1.4\nsmall fixture")
        first = self.controller.enqueue("paper.pdf", "ABCD1234", False)
        second = self.controller.enqueue("paper.pdf", None, False)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(first["sourceAttachmentKey"], "ABCD1234")

    def test_source_cannot_escape_mount(self):
        with self.assertRaisesRegex(ValueError, "relative"):
            self.controller.safe_source("../outside.pdf")

    def test_scan_skips_generated_outputs_and_honours_limit(self):
        for name in ("a.pdf", "b.pdf", "c.txt"):
            (self.controller.DOCUMENTS / name).write_bytes(b"fixture")
        generated = self.controller.DOCUMENTS / ".scholarserver" / "docling" / "x"
        generated.mkdir(parents=True)
        (generated / "ignored.pdf").write_bytes(b"fixture")
        self.assertEqual(self.controller.list_pdfs("", 1), ["a.pdf"])

    def test_folder_browser_is_bounded_to_visible_directories(self):
        (self.controller.DOCUMENTS / "Articles" / "Drafts").mkdir(parents=True)
        (self.controller.DOCUMENTS / "Books").mkdir()
        (self.controller.DOCUMENTS / ".scholarserver").mkdir()
        (self.controller.DOCUMENTS / "paper.pdf").write_bytes(b"fixture")
        listing = self.controller.browse_folders("")
        self.assertEqual(listing, {
            "path": "",
            "parent": None,
            "folders": [
                {"name": "Articles", "path": "Articles"},
                {"name": "Books", "path": "Books"},
            ],
        })
        self.assertEqual(self.controller.browse_folders("Articles")["folders"], [
            {"name": "Drafts", "path": "Articles/Drafts"},
        ])
        with self.assertRaisesRegex(ValueError, "stay inside"):
            self.controller.browse_folders("../outside")

    def test_writes_markdown_and_manifest(self):
        (self.controller.DOCUMENTS / "paper.pdf").write_bytes(b"%PDF fixture")
        job = self.controller.enqueue("paper.pdf", None, True)
        row = self.controller.find_job(job["id"])
        relative = self.controller.write_result(row, "# Converted", 1.25)
        self.assertEqual(relative, f".scholarserver/docling/{job['sourceSha256']}/document.md")
        self.assertEqual((self.controller.DOCUMENTS / relative).read_text(), "# Converted\n")
        manifest = json.loads((self.controller.DOCUMENTS / Path(relative).parent / "manifest.json").read_text())
        self.assertEqual(manifest["sourcePath"], "paper.pdf")

    def test_atomic_write_tolerates_object_storage_chmod(self):
        destination = self.controller.DOCUMENTS / "cloud-backed.md"
        with mock.patch.object(self.controller.os, "chmod", side_effect=PermissionError(1, "not supported")):
            self.controller.atomic_write(destination, "content")
        self.assertEqual(destination.read_text(), "content")

    def request(self, method, route, body=None, authorized=True):
        # Run the real handler methods with in-memory HTTP streams. Test
        # environments may disallow even loopback socket binding.
        handler = object.__new__(self.controller.AppHandler)
        handler.path = route
        handler.command = method
        handler.requestline = f"{method} {route} HTTP/1.1"
        handler.request_version = "HTTP/1.1"
        handler.headers = Message()
        handler.headers["Content-Type"] = "application/json"
        if authorized:
            handler.headers["X-Requested-With"] = "ScholarServer"
        content = b"" if body is None else json.dumps(body).encode()
        handler.headers["Content-Length"] = str(len(content))
        handler.rfile = io.BytesIO(content)
        handler.wfile = io.BytesIO()
        if method == "GET":
            handler.do_GET()
        elif method == "POST":
            handler.do_POST()
        else:
            raise ValueError("unsupported method")
        response = handler.wfile.getvalue()
        head, payload = response.split(b"\r\n\r\n", 1)
        return int(head.split(b" ", 2)[1]), json.loads(payload)

    def test_configuration_handler_save_duplicate_receipt_and_stale_edit(self):
        status, section = self.request("GET", "/api/configuration/defaults")
        self.assertEqual(status, 200)
        self.assertEqual(section["values"], {"defaultOcr": False})
        self.assertEqual(section["version"], 1)
        body = {"requestId": "request-12345678", "expectedRevision": section["revision"], "values": {"defaultOcr": True}}
        status, evaluated = self.request("POST", "/api/configuration/defaults/evaluate", {"values": {"defaultOcr": True}})
        self.assertEqual(status, 200)
        self.assertEqual(evaluated["values"], {"defaultOcr": False})
        status, result = self.request("POST", "/api/configuration/defaults/actions/save-defaults", body)
        self.assertEqual(status, 200)
        self.assertEqual(result, {"requestId": "request-12345678", "actionId": "save-defaults", "status": "succeeded"})
        self.assertEqual(self.controller.setting("default_ocr"), "true")
        self.assertEqual(self.request("POST", "/api/configuration/defaults/actions/save-defaults", body), (200, result))
        self.assertEqual(self.request("GET", "/api/configuration/defaults/operations/request-12345678"), (200, result))
        stale = {**body, "requestId": "request-87654321", "values": {"defaultOcr": False}}
        self.assertEqual(self.request("POST", "/api/configuration/defaults/actions/save-defaults", stale)[0], 409)
        self.assertEqual(self.controller.setting("default_ocr"), "true")

    def test_configuration_handler_rejects_bad_input_before_receipt_and_enforces_scope(self):
        section = self.controller.configuration_section("defaults")
        body = {"requestId": "request-12345678", "expectedRevision": section["revision"], "values": {"defaultOcr": "secret-value"}}
        status, result = self.request("POST", "/api/configuration/defaults/actions/save-defaults", body)
        self.assertEqual(status, 400)
        self.assertEqual(result, {"requestId": "request-12345678", "actionId": "save-defaults", "status": "rejected-before-change"})
        self.assertNotIn("secret-value", json.dumps(result))
        self.assertEqual(self.request("GET", "/api/configuration/defaults/operations/request-12345678")[0], 404)
        good = {**body, "requestId": "request-87654321", "values": {"defaultOcr": True}}
        self.assertEqual(self.request("POST", "/api/configuration/defaults/actions/save-defaults", good, authorized=False)[0], 403)
        self.assertEqual(self.request("POST", "/api/configuration/defaults/actions/save-defaults", good)[0], 200)
        self.assertEqual(self.request("POST", "/api/configuration/queue/actions/pause", {**good, "values": {}})[0], 409)

    def test_configuration_queue_action_serializes_and_reports_state(self):
        with mock.patch.object(self.controller, "engine_health", return_value="available"):
            section = self.controller.configuration_section("queue")
            body = {"requestId": "request-12345678", "expectedRevision": section["revision"], "values": {}}
            self.assertEqual(self.request("POST", "/api/configuration/queue/actions/pause", body)[0], 200)
            paused = self.controller.configuration_section("queue")
            self.assertEqual(paused["summary"][0]["value"], "Paused")
            self.assertEqual(paused["actions"][0]["id"], "resume")
            self.assertEqual(self.request("POST", "/api/configuration/queue/actions/pause", {**body, "requestId": "request-87654321"})[0], 409)


if __name__ == "__main__":
    unittest.main()

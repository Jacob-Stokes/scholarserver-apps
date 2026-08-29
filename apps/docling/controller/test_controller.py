import importlib.util
import json
import os
import sys
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()

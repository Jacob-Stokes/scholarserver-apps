"""Failure-path checks for the opt-in probe, without Docker or network access."""

import json
import unittest
from unittest.mock import patch

from native_ingestion import ingest, synthetic_pdf, verify_original


class NativeIngestionTests(unittest.TestCase):
    def test_pinned_native_task_response_is_paginated_and_lowercase(self):
        task = "a60908f3-cea8-47ec-a3a0-6bc979d0dd4c"
        completed = {
            "results": [
                {
                    "task_id": task,
                    "status": "success",
                    "result_data": {"document_id": 3},
                }
            ]
        }
        with patch(
            "native_ingestion.native_request",
            side_effect=[json.dumps(task).encode(), json.dumps(completed).encode()],
        ) as request:
            with patch("native_ingestion.verify_original"):
                document_id, _ = ingest("http://127.0.0.1", "synthetic-token")
                self.assertEqual(document_id, 3)
                self.assertEqual(request.call_count, 2)

    def test_fixture_cross_reference_points_to_each_object(self):
        pdf = synthetic_pdf()
        position = int(pdf.split(b"startxref\n")[1].splitlines()[0])
        self.assertTrue(pdf[position:].startswith(b"xref\n"))
        entries = pdf[position:].splitlines()[3:8]
        for number, entry in enumerate(entries, 1):
            offset = int(entry[:10])
            self.assertTrue(pdf[offset:].startswith(f"{number} 0 obj".encode()))

    def test_lost_upload_response_does_not_repeat_the_write(self):
        with patch(
            "native_ingestion.native_request", side_effect=TimeoutError
        ) as request:
            with self.assertRaises(TimeoutError):
                ingest("http://127.0.0.1", "synthetic-token")
            self.assertEqual(request.call_count, 1)

    def test_invalid_task_identifier_does_not_poll_arbitrary_path(self):
        with patch(
            "native_ingestion.native_request", return_value=b'"../users/"'
        ) as request:
            with self.assertRaises(ValueError):
                ingest("http://127.0.0.1", "synthetic-token")
            self.assertEqual(request.call_count, 1)

    def test_recovery_rejects_changed_original_even_with_matching_text(self):
        metadata = json.dumps({"content": "synthetic ingestion marker"}).encode()
        with patch(
            "native_ingestion.native_request", side_effect=[metadata, b"changed"]
        ):
            with self.assertRaises(AssertionError):
                verify_original(
                    "http://127.0.0.1", "synthetic-token", 1, synthetic_pdf()
                )


if __name__ == "__main__":
    unittest.main()

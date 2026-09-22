"""Disposable native API ingestion checks; never exposed as an MCP write tool."""

import hashlib
import json
import secrets
import time
import urllib.request


def synthetic_pdf():
    """A tiny single-page text fixture, without external files or personal data."""
    content = b"BT /F1 18 Tf 60 740 Td (ScholarServer synthetic ingestion marker) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "
        + str(len(content)).encode()
        + b" >>\nstream\n"
        + content
        + b"\nendstream",
    ]
    result = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, value in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend(f"{index} 0 obj\n".encode() + value + b"\nendobj\n")
    xref = len(result)
    result.extend(b"xref\n0 6\n0000000000 65535 f \n")
    for offset in offsets[1:]:
        result.extend(f"{offset:010d} 00000 n \n".encode())
    result.extend(
        f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(result)


def native_request(address, token, path, body=None, content_type=None):
    headers = {"Authorization": f"Token {token}"}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(
        address + "/api/" + path, data=body, headers=headers
    )
    # A failed or timed-out POST must never be automatically repeated.
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(2_097_153)
        assert len(data) <= 2_097_152, "Native response exceeded probe limit"
        return data


def ingest(address, token):
    document = synthetic_pdf()
    boundary = "scholarserver-" + secrets.token_hex(16)
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nsynthetic-upload\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="document"; filename="synthetic.pdf"\r\n'
            "Content-Type: application/pdf\r\n\r\n"
        ).encode()
        + document
        + f"\r\n--{boundary}--\r\n".encode()
    )
    task = json.loads(
        native_request(
            address,
            token,
            "documents/post_document/",
            body,
            f"multipart/form-data; boundary={boundary}",
        )
    )
    import uuid

    task = str(uuid.UUID(task))
    deadline = time.monotonic() + 240
    next_progress = 0
    while time.monotonic() < deadline:
        tasks = json.loads(native_request(address, token, "tasks/?task_id=" + task))
        if isinstance(tasks, dict):
            tasks = tasks["results"]
        assert isinstance(tasks, list), "Unexpected native task response"
        for item in tasks:
            assert item["task_id"] == task
            if item["status"] in ("failure", "revoked"):
                raise RuntimeError(
                    "Synthetic native ingestion failed; no automatic resubmission"
                )
            if item["status"] == "success":
                document_id = int(item["result_data"]["document_id"])
                verify_original(address, token, document_id, document)
                print(
                    "PASS native PDF upload, processing, extracted text and exact original bytes",
                    flush=True,
                )
                return document_id, document
        if time.monotonic() >= next_progress:
            print("Waiting for native document processing", flush=True)
            next_progress = time.monotonic() + 20
        time.sleep(2)
    raise RuntimeError("Ingestion outcome is unknown; probe will not resubmit")


def verify_original(address, token, document_id, original):
    metadata = json.loads(native_request(address, token, f"documents/{document_id}/"))
    assert "synthetic ingestion marker" in metadata["content"]
    downloaded = native_request(
        address, token, f"documents/{document_id}/download/?original=true"
    )
    assert hashlib.sha256(downloaded).digest() == hashlib.sha256(original).digest()

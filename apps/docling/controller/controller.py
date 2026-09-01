#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import errno
import json
import mimetypes
import os
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterator


RUNTIME = Path(os.environ.get("SCHOLARSERVER_RUNTIME", "/runtime"))
DOCUMENTS = Path(os.environ.get("SCHOLARSERVER_DOCUMENTS", "/documents"))
DOCLING_URL = os.environ.get("SCHOLARSERVER_DOCLING_URL", "http://docling:5001").rstrip("/")
DATABASE = RUNTIME / "jobs.sqlite"
STATUS = RUNTIME / "status.json"
REQUESTS = RUNTIME / "requests"
RESPONSES = RUNTIME / "responses"
OUTPUT_ROOT = DOCUMENTS / ".scholarserver" / "docling"
UI_ROOT = Path(os.environ.get("SCHOLARSERVER_UI_ROOT", "/app/ui"))
HTTP_PORT = int(os.environ.get("SCHOLARSERVER_UI_PORT", "8080"))
MAX_SOURCE_BYTES = 250 * 1024 * 1024
MAX_ATTEMPTS = 3
ENGINE_TIMEOUT_SECONDS = 25 * 60


@dataclass(frozen=True)
class Source:
    relative_path: str
    path: Path
    size: int
    sha256: str


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def atomic_write(path: Path, content: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp")
    temporary.write_text(content, encoding="utf-8")
    try:
        os.chmod(temporary, mode)
    except OSError as error:
        # Object-storage FUSE mounts such as rclone determine permissions at
        # mount time and commonly reject chmod even though writes and atomic
        # renames work normally.
        if error.errno not in {errno.EPERM, errno.EACCES, errno.ENOTSUP, errno.EOPNOTSUPP}:
            raise
    os.replace(temporary, path)


def atomic_json(path: Path, value: Any, mode: int = 0o600) -> None:
    atomic_write(path, json.dumps(value, indent=2, sort_keys=True) + "\n", mode)


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    database = sqlite3.connect(DATABASE, timeout=30)
    try:
        database.row_factory = sqlite3.Row
        database.execute("PRAGMA journal_mode=WAL")
        database.execute("PRAGMA foreign_keys=ON")
        with database:
            yield database
    finally:
        database.close()


def migrate() -> None:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    REQUESTS.mkdir(parents=True, exist_ok=True)
    RESPONSES.mkdir(parents=True, exist_ok=True)
    with connection() as database:
        database.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY,
              source_path TEXT NOT NULL,
              source_size INTEGER NOT NULL,
              source_sha256 TEXT NOT NULL,
              source_attachment_key TEXT,
              profile TEXT NOT NULL,
              state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed')),
              attempts INTEGER NOT NULL DEFAULT 0,
              engine_task_id TEXT,
              output_path TEXT,
              error TEXT,
              created_at TEXT NOT NULL,
              started_at TEXT,
              finished_at TEXT,
              updated_at TEXT NOT NULL,
              UNIQUE(source_sha256, profile)
            );
            CREATE INDEX IF NOT EXISTS jobs_state_created ON jobs(state, created_at);
            """
        )
        database.execute(
            "UPDATE jobs SET state='queued', engine_task_id=NULL, error='recovered after restart', updated_at=? WHERE state='running'",
            (now(),),
        )
        database.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('paused','false')")
        database.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('default_ocr','false')")


def setting(key: str, default: str = "") -> str:
    with connection() as database:
        row = database.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return str(row["value"]) if row else default


def set_setting(key: str, value: str) -> None:
    with connection() as database:
        database.execute(
            "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def safe_source(relative: str) -> Source:
    if not isinstance(relative, str) or not relative.strip() or "\x00" in relative:
        raise ValueError("Choose a PDF inside the attached Research documents location")
    candidate_text = relative.strip().replace("\\", "/")
    candidate_path = Path(candidate_text)
    if candidate_path.is_absolute() or any(part in ("", ".", "..") for part in candidate_path.parts):
        raise ValueError("The PDF path must be relative and cannot leave Research documents")
    if candidate_path.suffix.lower() != ".pdf":
        raise ValueError("Docling currently accepts PDF files in this ScholarServer profile")
    root = DOCUMENTS.resolve(strict=True)
    candidate = (root / candidate_path).resolve(strict=True)
    if candidate == root or root not in candidate.parents:
        raise ValueError("The PDF path leaves Research documents")
    metadata = candidate.stat()
    if not candidate.is_file() or candidate.is_symlink():
        raise ValueError("The selected PDF is not a regular file")
    if metadata.st_size <= 0 or metadata.st_size > MAX_SOURCE_BYTES:
        raise ValueError("The PDF must be between 1 byte and 250 MiB")
    digest = hashlib.sha256()
    with candidate.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return Source(candidate_text, candidate, metadata.st_size, digest.hexdigest())


def public_job(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "sourcePath": row["source_path"],
        "sourceBytes": row["source_size"],
        "sourceSha256": row["source_sha256"],
        "sourceAttachmentKey": row["source_attachment_key"],
        "profile": row["profile"],
        "state": row["state"],
        "attempts": row["attempts"],
        "outputPath": row["output_path"],
        "error": row["error"],
        "createdAt": row["created_at"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
        "updatedAt": row["updated_at"],
    }


def find_job(job_id: str) -> sqlite3.Row | None:
    with connection() as database:
        return database.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()


def enqueue(relative_path: str, source_attachment_key: str | None = None, ocr: bool = True) -> dict[str, Any]:
    source = safe_source(relative_path)
    attachment_key = (source_attachment_key or "").strip().upper() or None
    if attachment_key is not None and (len(attachment_key) != 8 or not attachment_key.isalnum()):
        raise ValueError("A Zotero attachment key must contain eight letters or numbers")
    profile = "standard-ocr" if ocr else "standard-text"
    job_id = secrets.token_hex(16)
    timestamp = now()
    with connection() as database:
        database.execute(
            """INSERT OR IGNORE INTO jobs(
                 id, source_path, source_size, source_sha256, source_attachment_key,
                 profile, state, created_at, updated_at
               ) VALUES(?,?,?,?,?,?,'queued',?,?)""",
            (job_id, source.relative_path, source.size, source.sha256, attachment_key, profile, timestamp, timestamp),
        )
        row = database.execute(
            "SELECT * FROM jobs WHERE source_sha256=? AND profile=?",
            (source.sha256, profile),
        ).fetchone()
        if row and attachment_key and not row["source_attachment_key"]:
            database.execute("UPDATE jobs SET source_attachment_key=?, updated_at=? WHERE id=?", (attachment_key, timestamp, row["id"]))
            row = database.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone()
    return public_job(row) or {}


def list_pdfs(folder: str, limit: int) -> list[str]:
    folder_text = folder.strip().replace("\\", "/") if isinstance(folder, str) else ""
    relative = Path(folder_text or ".")
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("The scan folder must stay inside Research documents")
    root = DOCUMENTS.resolve(strict=True)
    target = (root / relative).resolve(strict=True)
    if target != root and root not in target.parents:
        raise ValueError("The scan folder leaves Research documents")
    if not target.is_dir():
        raise ValueError("The scan folder does not exist")
    safe_limit = max(1, min(int(limit), 500))
    found: list[str] = []
    for candidate in sorted(target.rglob("*"), key=lambda item: str(item).lower()):
        if len(found) >= safe_limit:
            break
        if ".scholarserver" in candidate.parts or candidate.suffix.lower() != ".pdf" or not candidate.is_file():
            continue
        found.append(candidate.relative_to(root).as_posix())
    return found


def browse_folders(folder: str) -> dict[str, Any]:
    folder_text = folder.strip().replace("\\", "/") if isinstance(folder, str) else ""
    if "\x00" in folder_text or folder_text.startswith("/"):
        raise ValueError("The folder must stay inside Research documents")
    parts = [part for part in folder_text.split("/") if part]
    if any(part in (".", "..") for part in parts):
        raise ValueError("The folder must stay inside Research documents")
    root = DOCUMENTS.resolve(strict=True)
    unresolved = root
    for part in parts:
        unresolved /= part
        if unresolved.is_symlink():
            raise ValueError("Linked folders cannot be browsed")
    target = unresolved.resolve(strict=True)
    if target != root and root not in target.parents:
        raise ValueError("The folder leaves Research documents")
    if not target.is_dir():
        raise ValueError("That folder does not exist")
    folders: list[dict[str, str]] = []
    for candidate in sorted(target.iterdir(), key=lambda item: item.name.casefold()):
        if candidate.name.startswith(".") or candidate.is_symlink():
            continue
        try:
            resolved = candidate.resolve(strict=True)
            if resolved.is_dir() and root in resolved.parents:
                relative = resolved.relative_to(root).as_posix()
                folders.append({"name": candidate.name, "path": relative})
        except OSError:
            continue
        if len(folders) >= 250:
            break
    canonical = "/".join(parts)
    return {
        "path": canonical,
        "parent": "/".join(parts[:-1]) if parts else None,
        "folders": folders,
    }


def discover_pdfs(folder: str, limit: int) -> list[dict[str, Any]]:
    return [
        {"path": relative, "bytes": (DOCUMENTS / relative).stat().st_size}
        for relative in list_pdfs(folder, limit)
    ]


def engine_request(path: str, method: str = "GET", data: bytes | None = None, headers: dict[str, str] | None = None, timeout: float = 30) -> Any:
    request = urllib.request.Request(f"{DOCLING_URL}{path}", data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        detail = error.read(500).decode("utf-8", "replace")
        raise RuntimeError(f"Docling returned HTTP {error.code}: {detail}") from error


def multipart(source: Source, ocr: bool) -> tuple[bytes, str]:
    boundary = f"scholarserver-{secrets.token_hex(16)}"
    chunks: list[bytes] = []

    def field(name: str, value: str) -> None:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(), b"\r\n",
        ])

    chunks.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="files"; filename="{source.path.name}"\r\n'.encode(),
        f"Content-Type: {mimetypes.guess_type(source.path.name)[0] or 'application/pdf'}\r\n\r\n".encode(),
        source.path.read_bytes(), b"\r\n",
    ])
    field("to_formats", "md")
    field("do_ocr", "true" if ocr else "false")
    field("force_ocr", "false")
    field("table_mode", "fast")
    field("do_table_structure", "true")
    field("include_images", "false")
    field("include_page_images", "false")
    field("do_code_enrichment", "false")
    field("do_formula_enrichment", "false")
    field("document_timeout", "1200")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), boundary


def convert(source: Source, profile: str, progress: callable) -> tuple[str, str, float]:
    payload, boundary = multipart(source, profile == "standard-ocr")
    submitted = engine_request(
        "/v1/convert/file/async", "POST", payload,
        {"Content-Type": f"multipart/form-data; boundary={boundary}", "Content-Length": str(len(payload))},
        60,
    )
    task_id = str(submitted.get("task_id", "")) if isinstance(submitted, dict) else ""
    if not task_id:
        raise RuntimeError("Docling did not return a task identifier")
    progress(task_id)
    deadline = time.monotonic() + ENGINE_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        status = engine_request(f"/v1/status/poll/{urllib.parse.quote(task_id)}?wait=5", timeout=15)
        state = status.get("task_status") if isinstance(status, dict) else None
        if state in ("success", "partial_success"):
            result = engine_request(f"/v1/result/{urllib.parse.quote(task_id)}", timeout=60)
            document = result.get("document", {}) if isinstance(result, dict) else {}
            markdown = document.get("md_content") if isinstance(document, dict) else None
            if not isinstance(markdown, str) or not markdown.strip():
                raise RuntimeError("Docling completed without returning Markdown")
            return task_id, markdown, float(result.get("processing_time", 0))
        if state == "failure":
            message = status.get("error_message") if isinstance(status, dict) else None
            raise RuntimeError(str(message or "Docling conversion failed"))
        time.sleep(1)
    raise TimeoutError("Docling did not finish within 25 minutes")


def write_result(row: sqlite3.Row, markdown: str, processing_time: float) -> str:
    directory = OUTPUT_ROOT / row["source_sha256"]
    directory.mkdir(parents=True, exist_ok=True)
    relative_output = directory.relative_to(DOCUMENTS).as_posix() + "/document.md"
    atomic_write(directory / "document.md", markdown.rstrip() + "\n", 0o640)
    atomic_json(directory / "manifest.json", {
        "schemaVersion": 1,
        "generator": "ScholarServer Docling",
        "sourcePath": row["source_path"],
        "sourceBytes": row["source_size"],
        "sourceSha256": row["source_sha256"],
        "sourceAttachmentKey": row["source_attachment_key"],
        "profile": row["profile"],
        "processingSeconds": processing_time,
        "createdAt": now(),
        "markdownPath": relative_output,
    }, 0o640)
    return relative_output


def next_job() -> sqlite3.Row | None:
    with connection() as database:
        database.execute("BEGIN IMMEDIATE")
        row = database.execute(
            "SELECT * FROM jobs WHERE state='queued' AND attempts < ? ORDER BY created_at LIMIT 1",
            (MAX_ATTEMPTS,),
        ).fetchone()
        if row:
            timestamp = now()
            database.execute(
                "UPDATE jobs SET state='running', attempts=attempts+1, started_at=?, updated_at=?, error=NULL WHERE id=?",
                (timestamp, timestamp, row["id"]),
            )
            row = database.execute("SELECT * FROM jobs WHERE id=?", (row["id"],)).fetchone()
        database.commit()
        return row


def mark_task(job_id: str, task_id: str) -> None:
    with connection() as database:
        database.execute("UPDATE jobs SET engine_task_id=?, updated_at=? WHERE id=?", (task_id, now(), job_id))


def complete_job(job_id: str, output_path: str) -> None:
    timestamp = now()
    with connection() as database:
        database.execute(
            "UPDATE jobs SET state='succeeded', output_path=?, finished_at=?, updated_at=?, error=NULL WHERE id=?",
            (output_path, timestamp, timestamp, job_id),
        )


def fail_job(row: sqlite3.Row, error: Exception) -> None:
    attempts = int(row["attempts"])
    retryable = attempts < MAX_ATTEMPTS
    message = str(error)[:1000] or error.__class__.__name__
    timestamp = now()
    with connection() as database:
        database.execute(
            "UPDATE jobs SET state=?, error=?, finished_at=?, updated_at=? WHERE id=?",
            ("queued" if retryable else "failed", message, None if retryable else timestamp, timestamp, row["id"]),
        )


def worker() -> None:
    while True:
        if setting("paused", "false") == "true":
            time.sleep(1)
            continue
        row = next_job()
        if row is None:
            time.sleep(1)
            continue
        try:
            source = safe_source(row["source_path"])
            if source.sha256 != row["source_sha256"]:
                raise RuntimeError("The source PDF changed after it was queued; queue it again as a new document")
            _, markdown, processing_time = convert(source, row["profile"], lambda task_id: mark_task(row["id"], task_id))
            output_path = write_result(row, markdown, processing_time)
            complete_job(row["id"], output_path)
        except Exception as error:
            fail_job(row, error)
        write_status()


def engine_health() -> str:
    try:
        value = engine_request("/health", timeout=2)
        return "available" if isinstance(value, dict) and value.get("status") == "ok" else "unavailable"
    except Exception:
        return "unavailable"


def status_value() -> dict[str, Any]:
    with connection() as database:
        counts = {row["state"]: row["count"] for row in database.execute("SELECT state, count(*) AS count FROM jobs GROUP BY state")}
        recent = [public_job(row) for row in database.execute("SELECT * FROM jobs ORDER BY updated_at DESC LIMIT 20")]
    return {
        "state": "paused" if setting("paused") == "true" else "ready",
        "engine": engine_health(),
        "workerConcurrency": 1,
        "counts": {key: int(counts.get(key, 0)) for key in ("queued", "running", "succeeded", "failed")},
        "jobs": recent,
        "outputFolder": ".scholarserver/docling",
        "updatedAt": now(),
    }


def write_status() -> dict[str, Any]:
    value = status_value()
    atomic_json(STATUS, value, 0o644)
    return value


def action(request: dict[str, Any]) -> Any:
    action_id = request.get("action")
    input_value = request.get("input") if isinstance(request.get("input"), dict) else {}
    if action_id == "status":
        return write_status()
    if action_id == "enqueue":
        return enqueue(
            input_value.get("sourcePath", ""),
            input_value.get("sourceAttachmentKey"),
            input_value.get("ocr", True) is True,
        )
    if action_id == "scan":
        paths = list_pdfs(input_value.get("folder", ""), int(input_value.get("limit", 25)))
        jobs = [enqueue(item, None, input_value.get("ocr", True) is True) for item in paths]
        return {"discovered": len(paths), "jobs": jobs}
    if action_id == "discover":
        return {"files": discover_pdfs(input_value.get("folder", ""), int(input_value.get("limit", 100)))}
    if action_id == "browse-folders":
        return browse_folders(input_value.get("path", ""))
    if action_id == "job-status":
        job_id = str(input_value.get("jobId", "")).strip().lower()
        row = find_job(job_id)
        if not row:
            raise ValueError("That Docling job does not exist")
        return public_job(row)
    if action_id == "retry":
        job_id = str(input_value.get("jobId", "")).strip().lower()
        with connection() as database:
            row = database.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if not row:
                raise ValueError("That Docling job does not exist")
            if row["state"] == "running":
                raise ValueError("A running job cannot be retried")
            database.execute("UPDATE jobs SET state='queued', attempts=0, error=NULL, finished_at=NULL, updated_at=? WHERE id=?", (now(), job_id))
        return public_job(find_job(job_id))
    if action_id in ("pause", "resume"):
        set_setting("paused", "true" if action_id == "pause" else "false")
        return write_status()
    raise ValueError("Unsupported Docling action")


class AppHandler(BaseHTTPRequestHandler):
    server_version = "ScholarServer-Docling/0.2"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        return

    def send_json(self, status: int, value: Any) -> None:
        body = json.dumps(value, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json_body(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid request length") from error
        if length < 0 or length > 1024 * 1024:
            raise ValueError("Request body is too large")
        value = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(value, dict):
            raise ValueError("Request body must be an object")
        return value

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path)
        try:
            if path.path == "/health":
                self.send_json(200, {"status": "ok"})
                return
            if path.path == "/api/status":
                self.send_json(200, write_status())
                return
            if path.path == "/api/settings":
                self.send_json(200, {"defaultOcr": setting("default_ocr", "false") == "true"})
                return
            if path.path == "/api/files":
                query = urllib.parse.parse_qs(path.query)
                limit = int(query.get("limit", ["100"])[0])
                self.send_json(200, {"files": discover_pdfs("", limit)})
                return
            self.send_static(path.path)
        except Exception as error:
            self.send_json(400, {"error": (str(error) or "Docling request failed")[:1000]})

    def do_PUT(self) -> None:
        try:
            if urllib.parse.urlsplit(self.path).path != "/api/settings":
                self.send_json(404, {"error": "Not found"})
                return
            body = self.json_body()
            if set(body) != {"defaultOcr"} or not isinstance(body["defaultOcr"], bool):
                raise ValueError("defaultOcr must be a boolean")
            set_setting("default_ocr", "true" if body["defaultOcr"] else "false")
            self.send_json(200, {"defaultOcr": body["defaultOcr"]})
        except Exception as error:
            self.send_json(400, {"error": (str(error) or "Docling request failed")[:1000]})

    def do_POST(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        try:
            body = self.json_body()
            if path == "/api/jobs":
                allowed = {"sourcePath", "sourceAttachmentKey", "ocr"}
                if set(body) - allowed or not isinstance(body.get("sourcePath"), str) or not isinstance(body.get("ocr"), bool):
                    raise ValueError("A PDF path and OCR choice are required")
                self.send_json(200, enqueue(body["sourcePath"], body.get("sourceAttachmentKey"), body["ocr"]))
                write_status()
                return
            if path == "/api/jobs/backfill":
                if set(body) != {"limit", "ocr"} or not isinstance(body["limit"], int) or not isinstance(body["ocr"], bool):
                    raise ValueError("A numeric limit and OCR choice are required")
                paths = list_pdfs("", body["limit"])
                jobs = [enqueue(item, None, body["ocr"]) for item in paths]
                unique = {job["id"]: job for job in jobs}.values()
                self.send_json(200, {
                    "discovered": len(paths),
                    "queued": sum(job["state"] in ("queued", "running") for job in unique),
                    "existing": sum(job["state"] == "succeeded" for job in unique),
                })
                write_status()
                return
            if path in ("/api/queue/pause", "/api/queue/resume"):
                if body:
                    raise ValueError("Queue control does not accept input")
                set_setting("paused", "true" if path.endswith("pause") else "false")
                self.send_json(200, write_status())
                return
            if path.startswith("/api/jobs/") and path.endswith("/retry"):
                if body:
                    raise ValueError("Retry does not accept input")
                job_id = path.removeprefix("/api/jobs/").removesuffix("/retry").strip("/").lower()
                if len(job_id) != 32 or any(character not in "0123456789abcdef" for character in job_id):
                    raise ValueError("Invalid job identifier")
                with connection() as database:
                    row = database.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
                    if not row:
                        raise ValueError("That Docling job does not exist")
                    if row["state"] == "running":
                        raise ValueError("A running job cannot be retried")
                    database.execute("UPDATE jobs SET state='queued', attempts=0, error=NULL, finished_at=NULL, updated_at=? WHERE id=?", (now(), job_id))
                self.send_json(200, public_job(find_job(job_id)))
                write_status()
                return
            self.send_json(404, {"error": "Not found"})
        except Exception as error:
            self.send_json(400, {"error": (str(error) or "Docling request failed")[:1000]})

    def send_static(self, requested: str) -> None:
        relative = requested.lstrip("/")
        candidate = (UI_ROOT / relative).resolve()
        root = UI_ROOT.resolve()
        if candidate != root and root not in candidate.parents:
            self.send_json(404, {"error": "Not found"})
            return
        if not candidate.is_file():
            candidate = root / "index.html"
        if not candidate.is_file():
            self.send_json(503, {"error": "Docling interface is unavailable"})
            return
        body = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def serve_ui() -> None:
    ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), AppHandler).serve_forever()


def process_request(path: Path) -> None:
    response_path = RESPONSES / path.name
    try:
        request = json.loads(path.read_text(encoding="utf-8"))
        path.unlink(missing_ok=True)
        response = {"ok": True, "result": action(request)}
    except Exception as error:
        path.unlink(missing_ok=True)
        response = {"ok": False, "error": (str(error) or "Docling action failed")[:1000]}
    atomic_json(response_path, response)


def main() -> None:
    migrate()
    write_status()
    threading.Thread(target=worker, name="docling-worker", daemon=True).start()
    threading.Thread(target=serve_ui, name="docling-ui", daemon=True).start()
    while True:
        for request_path in sorted(REQUESTS.glob("*.json")):
            if len(request_path.name) <= 80 and all(character in "abcdefghijklmnopqrstuvwxyz0123456789-." for character in request_path.name):
                process_request(request_path)
        if int(time.monotonic()) % 10 == 0:
            write_status()
        time.sleep(0.25)


if __name__ == "__main__":
    main()

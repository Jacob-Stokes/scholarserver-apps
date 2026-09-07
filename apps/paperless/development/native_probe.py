"""Opt-in native acceptance on disposable data, never a production installer.

Run from an isolated checkout on a native Docker host. Resources are scoped to a
fresh Compose project and removed in finally; pulled images are retained for an
operator to remove after checking whether other containers use them.
"""

import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


PAPERLESS = "ghcr.io/paperless-ngx/paperless-ngx@sha256:aa810a36942c63d4ee70d00eda7236cd3d6acfb7eb3f7987fb568ed14df8817a"
POSTGRES = (
    "postgres@sha256:54451ecb8ab38c24c3ec123f2fd501303a3a1856a5c66e98cecf2460d5e1e9d7"
)
VALKEY = "valkey/valkey@sha256:e1095c6c76ee982cb2d1e07edbb7fb2a53606630a1d810d5a47c9f646b708bf5"


def run(args, data=None):
    result = subprocess.run(
        args, input=data, text=True, capture_output=True, timeout=300
    )
    if result.returncode:
        # Do not echo commands/bodies or native logs that could contain secrets.
        if "manage.py" in args:
            # The fixture runs only in our newly created synthetic database.
            # Report the exception class, not its possibly sensitive message.
            import re

            classes = re.findall(
                r"^([A-Za-z_][\w.]*(?:Error|Exception)):.*$",
                result.stderr,
                re.MULTILINE,
            )
            print(
                "Fixture failure class: " + (classes[-1] if classes else "unknown"),
                flush=True,
            )
        raise RuntimeError(
            f"Native command failed ({args[0]}, exit {result.returncode})"
        )
    return result.stdout


def http(url, token=None, body=None, session=None):
    headers = {"Accept": "application/json, text/event-stream"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if session:
        headers["mcp-session-id"] = session
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url, data=None if body is None else json.dumps(body).encode(), headers=headers
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, response.headers, response.read(1048576).decode()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read(1048576).decode()


def rpc_payload(text):
    if text.startswith("event:") or text.startswith("data:"):
        return json.loads(
            next(line[6:] for line in text.splitlines() if line.startswith("data: "))
        )
    return json.loads(text)


def wait_for_native(address, command):
    deadline = time.monotonic() + 240
    next_progress = 0
    while time.monotonic() < deadline:
        container = run(command + ["ps", "-aq", "paperless"]).strip()
        state = run(
            ["docker", "inspect", "--format", "{{.State.Status}}", container]
        ).strip()
        if state == "exited":
            raise RuntimeError(
                "Native Paperless exited during startup; inspect only this disposable project"
            )
        try:
            if http(address)[0] == 200:
                return
        except (OSError, TimeoutError):
            pass
        if time.monotonic() >= next_progress:
            print("Waiting for native migrations/readiness", flush=True)
            next_progress = time.monotonic() + 20
        time.sleep(2)
    raise RuntimeError("Native Paperless did not become ready within four minutes")


def published_address(command, service, port):
    binding = run(command + ["port", service, str(port)]).strip()
    return "http://127.0.0.1:" + binding.rsplit(":", 1)[1]


def main():
    if os.getuid() not in (0, 1000):
        raise RuntimeError(
            "Probe requires root or uid 1000 to prepare private mounted files"
        )
    project = "ss-paperless-probe-" + secrets.token_hex(4)
    # Docker copies the image's owned directories into new named volumes. Runtime
    # credentials are mounted files, not inspectable Compose environment values.
    with tempfile.TemporaryDirectory(prefix="ss-paperless-probe-") as temporary:
        root = Path(temporary)
        # Host users cannot traverse this directory. Docker bind-mounts the
        # individual files/subdirectory without exposing the parent to services.
        os.chmod(root, 0o700)
        runtime = root / "runtime"
        runtime.mkdir(mode=0o755)
        for name in ("db-password", "secret-key"):
            (runtime / name).write_text(secrets.token_hex(32))
            (runtime / name).chmod(0o444)
        bearer = secrets.token_hex(32)
        (runtime / "service-token").write_text(bearer)
        (runtime / "service-token").chmod(0o600)
        if os.getuid() == 0:
            os.chown(runtime / "service-token", 1000, 1000)
        common = {
            "networks": ["isolated"],
            "security_opt": ["no-new-privileges:true"],
            "cap_drop": ["ALL"],
        }
        services = {
            "db": {
                **common,
                "image": POSTGRES,
                "user": "70:70",
                "environment": {
                    "POSTGRES_DB": "paperless",
                    "POSTGRES_USER": "paperless",
                    "POSTGRES_PASSWORD_FILE": "/secrets/db-password",
                },
                "volumes": [
                    "database:/var/lib/postgresql",
                    f"{runtime}/db-password:/secrets/db-password:ro",
                ],
                "tmpfs": ["/var/run/postgresql:uid=70,gid=70"],
                "mem_limit": "512m",
            },
            "broker": {
                **common,
                "image": VALKEY,
                "user": "999:999",
                "volumes": ["broker:/data"],
                "command": ["valkey-server", "--save", "", "--appendonly", "no"],
                "mem_limit": "128m",
            },
            "paperless": {
                **common,
                "image": PAPERLESS,
                "user": "1000:1000",
                "read_only": True,
                "ports": ["127.0.0.1::8000"],
                "mem_limit": "3g",
                "cpus": 2,
                # Upstream s6 stages its own init executable under /run.
                "tmpfs": [
                    "/run:exec,uid=1000,gid=1000",
                    "/tmp:uid=1000,gid=1000",
                    "/var/cache/fontconfig:uid=1000,gid=1000",
                ],
                "environment": {
                    "PAPERLESS_DBHOST": "db",
                    "PAPERLESS_DBENGINE": "postgresql",
                    "PAPERLESS_DBPASS_FILE": "/secrets/db-password",
                    "PAPERLESS_SECRET_KEY_FILE": "/secrets/secret-key",
                    "PAPERLESS_REDIS": "redis://broker:6379",
                    "PAPERLESS_TASK_WORKERS": "1",
                    "PAPERLESS_THREADS_PER_WORKER": "1",
                    "PAPERLESS_OCR_LANGUAGE": "eng",
                },
                "volumes": [
                    f"{slot}:/usr/src/paperless/{slot}"
                    for slot in ("data", "media", "consume", "export")
                ]
                + [
                    f"{runtime}/db-password:/secrets/db-password:ro",
                    f"{runtime}/secret-key:/secrets/secret-key:ro",
                ],
            },
            "mcp": {
                **common,
                "image": "scholarserver-paperless-native:20260907",
                "user": "1000:1000",
                "read_only": True,
                "volumes": [f"{runtime}:/runtime:ro"],
                "ports": ["127.0.0.1::7016"],
                "mem_limit": "256m",
            },
        }
        # Docker 29 does not publish ports from an internal-only network. Only
        # the two HTTP services join this test-only bridge; DB/broker stay private.
        services["paperless"]["networks"] = ["isolated", "probe_access"]
        services["mcp"]["networks"] = ["isolated", "probe_access"]
        compose = {
            "services": services,
            "networks": {"isolated": {"internal": True}, "probe_access": {}},
            "volumes": {
                name: {}
                for name in ("database", "broker", "data", "media", "consume", "export")
            },
        }
        file = root / "compose.json"
        file.write_text(json.dumps(compose))
        command = ["docker", "compose", "-p", project, "-f", str(file)]
        print(f"Disposable project: {project}", flush=True)
        try:
            run(command + ["up", "-d", "db", "broker", "paperless"])
            address = (
                "http://127.0.0.1:"
                + run(command + ["port", "paperless", "8000"]).strip().rsplit(":", 1)[1]
            )
            wait_for_native(address, command)
            print("PASS native non-root/read-only startup", flush=True)
            seed = Path(__file__).with_name("native_seed.py").read_text()
            result = run(
                command
                + [
                    "exec",
                    "-T",
                    "paperless",
                    "/command/with-contenv",
                    "python3",
                    "manage.py",
                    "shell",
                    "--no-imports",
                ],
                seed,
            )
            credentials = json.loads(
                next(
                    line[7:]
                    for line in result.splitlines()
                    if line.startswith("PROBE: ")
                )
            )
            # ORM fixtures intentionally bypass the consumer's indexing signal.
            # Use upstream's own indexer; this is still not an OCR/upload test.
            run(
                command
                + [
                    "exec",
                    "-T",
                    "paperless",
                    "/command/with-contenv",
                    "python3",
                    "manage.py",
                    "document_index",
                    "reindex",
                    "--heap-size-mb",
                    "64",
                ]
            )
            (runtime / "paperless-token").write_text(credentials["token"])
            (runtime / "paperless-token").chmod(0o600)
            if os.getuid() == 0:
                os.chown(runtime / "paperless-token", 1000, 1000)
            run(command + ["up", "-d", "mcp"])
            endpoint = (
                "http://127.0.0.1:"
                + run(command + ["port", "mcp", "7016"]).strip().rsplit(":", 1)[1]
                + "/mcp"
            )

            def check_mcp():
                initialize = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {},
                        "clientInfo": {"name": "native-probe", "version": "1"},
                    },
                }
                for _ in range(30):
                    try:
                        status, headers, text = http(endpoint, bearer, initialize)
                        if status == 200:
                            break
                    except OSError:
                        pass
                    time.sleep(1)
                else:
                    container = run(command + ["ps", "-aq", "mcp"]).strip()
                    print(
                        "MCP state: "
                        + run(
                            [
                                "docker",
                                "inspect",
                                "--format",
                                "{{.State.Status}}",
                                container,
                            ]
                        ).strip(),
                        flush=True,
                    )
                    raise RuntimeError("MCP did not become ready")
                session = headers.get("mcp-session-id")
                assert http(endpoint, body=initialize)[0] == 401
                for document, visible in [
                    (credentials["visible"], True),
                    (credentials["hidden"], False),
                ]:
                    request = {
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "tools/call",
                        "params": {
                            "name": "paperless_get_document_text",
                            "arguments": {"id": document},
                        },
                    }
                    status, _, text = http(endpoint, bearer, request, session)
                    assert status == 200
                    payload = rpc_payload(text)["result"]
                    if visible:
                        assert (
                            not payload.get("isError")
                            and "synthetic-visible-marker" in text
                        )
                    else:
                        assert (
                            payload.get("isError")
                            and "synthetic-hidden-marker" not in text
                        )
                request = {
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "paperless_search_documents",
                        "arguments": {"query": "synthetic", "limit": 10},
                    },
                }
                status, _, text = http(endpoint, bearer, request, session)
                assert status == 200 and not rpc_payload(text)["result"].get("isError")
                assert (
                    "synthetic-visible" in text
                ), "Visible fixture missing from native search"
                assert (
                    "synthetic-hidden" not in text
                ), "Native search leaked another account's fixture"

            check_mcp()
            print(
                "PASS authenticated real MCP reads/search and two-account document ACL exclusion",
                flush=True,
            )
            run(command + ["restart", "paperless", "mcp"])
            # Docker may allocate a new ephemeral host port after restart.
            address = published_address(command, "paperless", 8000)
            endpoint = published_address(command, "mcp", 7016) + "/mcp"
            wait_for_native(address, command)
            check_mcp()
            print(
                "PASS same-volume restart retains documents, token and ACLs", flush=True
            )
        finally:
            run(command + ["down", "--volumes", "--remove-orphans"])
            assert not run(
                [
                    "docker",
                    "ps",
                    "-aq",
                    "--filter",
                    f"label=com.docker.compose.project={project}",
                ]
            ).strip()
            assert not run(
                [
                    "docker",
                    "volume",
                    "ls",
                    "-q",
                    "--filter",
                    f"label=com.docker.compose.project={project}",
                ]
            ).strip()
            print(
                "PASS disposable containers and synthetic data volumes removed",
                flush=True,
            )


if __name__ == "__main__":
    main()

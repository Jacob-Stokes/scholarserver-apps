"""Cold recovery into fresh disposable volumes, not the Manager backup workflow."""

import json
import time


def restore_copy(command, restore_command, root, run):
    # No writers remain while the database, index and originals are captured.
    run(command + ["stop", "paperless", "mcp"])
    database = run(
        command
        + [
            "exec",
            "-T",
            "db",
            "pg_dump",
            "-U",
            "paperless",
            "--no-owner",
            "--no-acl",
            "paperless",
        ]
    )
    original_container = run(command + ["ps", "-aq", "paperless"]).strip()
    source = json.loads(run(["docker", "inspect", original_container]))[0]
    for slot in ("data", "media", "consume"):
        run(
            [
                "docker",
                "cp",
                "-a",
                f"{original_container}:/usr/src/paperless/{slot}",
                str(root / slot),
            ]
        )

    # Preserve the source volumes, but release our stopped containers/networks.
    # Shared development hosts may have no spare Docker address pools.
    run(command + ["down"])
    run(restore_command + ["up", "-d", "db", "broker"])
    deadline = time.monotonic() + 60
    while True:
        try:
            # PostgreSQL's temporary initialization server listens only on the
            # Unix socket. TCP readiness means database creation has finished.
            run(
                restore_command
                + [
                    "exec",
                    "-T",
                    "db",
                    "pg_isready",
                    "-h",
                    "127.0.0.1",
                    "-U",
                    "paperless",
                ]
            )
            break
        except RuntimeError:
            if time.monotonic() >= deadline:
                raise RuntimeError(
                    "The disposable recovery database did not become ready"
                ) from None
            time.sleep(1)
    run(
        restore_command
        + [
            "exec",
            "-T",
            "db",
            "psql",
            "-U",
            "paperless",
            "-v",
            "ON_ERROR_STOP=1",
            "paperless",
        ],
        database,
    )
    run(restore_command + ["create", "paperless", "mcp"])
    restored_container = run(restore_command + ["ps", "-aq", "paperless"]).strip()
    for slot in ("data", "media", "consume"):
        run(
            [
                "docker",
                "cp",
                "-a",
                str(root / slot) + "/.",
                f"{restored_container}:/usr/src/paperless/{slot}",
            ]
        )

    # Positive proof that this is not a restart using the source volumes.
    restored = json.loads(run(["docker", "inspect", restored_container]))[0]
    source_volumes = {
        mount["Name"] for mount in source["Mounts"] if mount["Type"] == "volume"
    }
    restored_volumes = {
        mount["Name"] for mount in restored["Mounts"] if mount["Type"] == "volume"
    }
    assert (
        source_volumes
        and restored_volumes
        and source_volumes.isdisjoint(restored_volumes)
    )
    run(restore_command + ["start", "paperless", "mcp"])

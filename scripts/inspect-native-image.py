#!/usr/bin/env python3
"""Read portable image identity from a one-image Docker archive."""

import hashlib
import json
import re
import subprocess
import sys
import tarfile
import tempfile


SHA256 = re.compile(r"^sha256:[a-f0-9]{64}$")


def fail(message):
    raise ValueError(message)


def config_name_digest(config_name):
    basename = config_name.rsplit("/", 1)[-1]
    if basename.endswith(".json"):
        basename = basename[:-5]
    digest = f"sha256:{basename}"
    if not SHA256.fullmatch(digest):
        fail(f"Image archive has an invalid config path: {config_name}")
    return digest


def read_identity(archive):
    manifest_member = archive.extractfile("manifest.json")
    if manifest_member is None:
        fail("Image archive has no manifest.json")
    manifest = json.load(manifest_member)
    if not isinstance(manifest, list) or len(manifest) != 1:
        fail("Image archive must contain exactly one image manifest")
    entry = manifest[0]
    config_name = entry.get("Config")
    layers = entry.get("Layers")
    if not isinstance(config_name, str) or not isinstance(layers, list) or not layers:
        fail("Image archive manifest is missing its config or layers")

    config_member = archive.extractfile(config_name)
    if config_member is None:
        fail(f"Image archive is missing config object {config_name}")
    config_bytes = config_member.read()
    config_digest = f"sha256:{hashlib.sha256(config_bytes).hexdigest()}"
    if config_digest != config_name_digest(config_name):
        fail(f"Image config content does not match its archive digest: {config_name}")
    config = json.loads(config_bytes)
    architecture = config.get("architecture")
    if architecture not in {"amd64", "arm64"}:
        fail(f"Image config has unsupported architecture: {architecture}")
    rootfs_diff_ids = config.get("rootfs", {}).get("diff_ids")
    if not isinstance(rootfs_diff_ids, list) or not rootfs_diff_ids:
        fail("Image config has no RootFS diff IDs")
    if any(not isinstance(value, str) or not SHA256.fullmatch(value) for value in rootfs_diff_ids):
        fail("Image config has an invalid RootFS diff ID")
    if len(rootfs_diff_ids) != len(layers):
        fail(
            f"Image archive layer count {len(layers)} does not match "
            f"RootFS diff ID count {len(rootfs_diff_ids)}"
        )
    return {
        "configDigest": config_digest,
        "architecture": architecture,
        "rootfsDiffIds": rootfs_diff_ids,
    }


def inspect_image(image):
    with tempfile.TemporaryFile() as saved:
        subprocess.run(["docker", "image", "save", image], stdout=saved, check=True)
        saved.seek(0)
        with tarfile.open(fileobj=saved) as archive:
            return read_identity(archive)


def main():
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/inspect-native-image.py IMAGE", file=sys.stderr)
        return 2
    try:
        identity = inspect_image(sys.argv[1])
    except (json.JSONDecodeError, KeyError, OSError, subprocess.CalledProcessError, tarfile.TarError, ValueError) as error:
        print(f"Native image identity failed: {error}", file=sys.stderr)
        return 1
    print(
        "\t".join(
            [
                identity["configDigest"],
                identity["architecture"],
                ",".join(identity["rootfsDiffIds"]),
            ]
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

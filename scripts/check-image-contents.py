"""Reject known proprietary Headless content in any Docker image layer.

Layer scanning deliberately ignores whiteouts: later deletion is not removal
from the distributed artifact. This checks known content, not all licensing.
"""

import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile

HEADLESS_CLI_SHA256 = "c6307dc72c00bcf6f22093fb3e0eb91fdc417fc9dd05884ff2c36e5a19cd0196"


def inspect_layer(stream):
    magic = stream.read(4)
    stream.seek(0)
    if magic != b"\x28\xb5\x2f\xfd":
        inspect_tar_layer(stream)
        return
    if not shutil.which("zstd"):
        raise ValueError("A Zstandard image layer requires the zstd tool; no content verdict is available")
    # New containerd-backed Docker exports may retain upstream Zstandard layers.
    # Decode the entire layer, then apply exactly the same content checks.
    with tempfile.TemporaryFile() as compressed, tempfile.TemporaryFile() as decoded:
        shutil.copyfileobj(stream, compressed)
        compressed.seek(0)
        subprocess.run(["zstd", "--decompress", "--stdout", "--quiet"],
                       stdin=compressed, stdout=decoded, check=True)
        decoded.seek(0)
        inspect_tar_layer(decoded)


def inspect_tar_layer(stream):
    with tarfile.open(fileobj=stream, mode="r|*") as layer:
        for member in layer:
            if "obsidian-headless" in member.name.lower():
                raise ValueError(f"Prohibited Headless path in image layer: {member.name}")
            if not member.isfile():
                continue
            if member.size > 2 * 1024 * 1024:
                continue
            content = layer.extractfile(member).read()
            if hashlib.sha256(content).hexdigest() == HEADLESS_CLI_SHA256:
                raise ValueError(f"Prohibited Headless client bytes in layer: {member.name}")
            if member.name.endswith("package.json"):
                try:
                    metadata = json.loads(content)
                except (ValueError, UnicodeDecodeError):
                    continue
                if isinstance(metadata, dict) and metadata.get("name") == "obsidian-headless":
                    raise ValueError(f"Prohibited Headless npm package in layer: {member.name}")


def audit(image):
    # Docker's manifest lists both classic layer.tar paths and the newer OCI
    # blob paths. Follow every declared layer, never infer layers by extension.
    with tempfile.TemporaryFile() as saved:
        subprocess.run(["docker", "image", "save", image], stdout=saved, check=True)
        saved.seek(0)
        with tarfile.open(fileobj=saved) as archive:
            manifest = json.load(archive.extractfile("manifest.json"))
            names = {name for entry in manifest for name in entry["Layers"]}
            if not names:
                raise ValueError("Image export contained no inspectable layers")
            for name in names:
                inspect_layer(archive.extractfile(name))
            layers = len(names)
    print(f"Checked {layers} layers: no known official Headless package/client in {image}")


if __name__ == "__main__":
    audit(sys.argv[1])

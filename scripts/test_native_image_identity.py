import hashlib
import io
import json
import pathlib
import tarfile
import unittest
from importlib.util import module_from_spec, spec_from_file_location


MODULE_PATH = pathlib.Path(__file__).with_name("inspect-native-image.py")
SPEC = spec_from_file_location("inspect_native_image", MODULE_PATH)
MODULE = module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def archive_for(config, config_name=None):
    config_bytes = json.dumps(config, separators=(",", ":")).encode()
    digest = hashlib.sha256(config_bytes).hexdigest()
    config_name = config_name or f"blobs/sha256/{digest}"
    manifest = json.dumps([{"Config": config_name, "RepoTags": ["fixture:latest"], "Layers": ["layer.tar"]}]).encode()
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as archive:
        for name, contents in [("manifest.json", manifest), (config_name, config_bytes), ("layer.tar", b"layer")]:
            member = tarfile.TarInfo(name)
            member.size = len(contents)
            archive.addfile(member, io.BytesIO(contents))
    stream.seek(0)
    return stream, f"sha256:{digest}"


class NativeImageIdentityTest(unittest.TestCase):
    def test_reads_config_digest_architecture_and_rootfs(self):
        diff_id = f"sha256:{'a' * 64}"
        stream, digest = archive_for({"architecture": "arm64", "rootfs": {"type": "layers", "diff_ids": [diff_id]}})
        with tarfile.open(fileobj=stream) as archive:
            identity = MODULE.read_identity(archive)
        self.assertEqual(identity["configDigest"], digest)
        self.assertEqual(identity["architecture"], "arm64")
        self.assertEqual(identity["rootfsDiffIds"], [diff_id])

    def test_rejects_config_bytes_that_do_not_match_archive_name(self):
        stream, _ = archive_for(
            {"architecture": "amd64", "rootfs": {"type": "layers", "diff_ids": [f"sha256:{'b' * 64}"]}},
            f"{'c' * 64}.json",
        )
        with tarfile.open(fileobj=stream) as archive:
            with self.assertRaisesRegex(ValueError, "does not match"):
                MODULE.read_identity(archive)


if __name__ == "__main__":
    unittest.main()

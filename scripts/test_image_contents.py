import importlib.util
import io
from pathlib import Path
import tarfile
import unittest

spec = importlib.util.spec_from_file_location("image_contents", Path(__file__).with_name("check-image-contents.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def layer(files):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w") as archive:
        for name, content in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(content)
            archive.addfile(entry, io.BytesIO(content))
    output.seek(0)
    return output


class ImageContentTests(unittest.TestCase):
    def test_metadata_and_open_source_dependencies_are_allowed(self):
        audit.inspect_layer(layer({"app/official-client.mjs": b"download metadata only",
                                   "app/node_modules/commander/package.json": b'{"name":"commander"}'}))

    def test_removed_client_is_still_present_in_earlier_layer(self):
        with self.assertRaises(ValueError):
            audit.inspect_layer(layer({"usr/lib/node_modules/obsidian-headless/cli.js": b"synthetic"}))
        # A whiteout is not a reason to forgive an earlier layer.
        with self.assertRaises(ValueError):
            audit.inspect_layer(layer({"usr/lib/node_modules/.wh.obsidian-headless": b""}))

    def test_renamed_package_is_identified_by_metadata(self):
        with self.assertRaises(ValueError):
            audit.inspect_layer(layer({"app/renamed/package.json": b'{"name":"obsidian-headless"}'}))


if __name__ == "__main__":
    unittest.main()

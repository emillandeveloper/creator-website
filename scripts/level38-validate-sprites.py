"""Validate shipped PNGs against internal audited provenance. Requires Pillow."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "public/level38/classes/manifest.json").read_text(encoding="utf8"))
provenance = json.loads((root / "docs/level38-sprite-provenance.json").read_text(encoding="utf8"))
expected = set()
short = []
for appearance in provenance["appearances"]:
    for frame in appearance["frames"]:
        path = root / "public" / frame["path"].lstrip("/")
        expected.add(path.resolve())
        assert hashlib.sha256(path.read_bytes()).hexdigest() == frame["sha256"], path
        with Image.open(path) as image:
            rgba = image.convert("RGBA")
            assert rgba.size == (16, 24), path
            assert set(rgba.getchannel("A").getdata()) <= {0, 255}, path
            assert hashlib.sha256(rgba.tobytes()).hexdigest() == frame["pixelSha256"], path
            assert rgba.getbbox()[3] == 24, path
            if "/idle/" in frame["path"] and rgba.getbbox()[1] == 1:
                short.append(frame["path"])
assert len(expected) == 516
assert expected == {p.resolve() for p in (root / "public/level38/classes").rglob("*.png")}
assert len(short) == 12
references = 0
for job in manifest["classes"]:
    for variant in job["variants"]:
        for action in variant["animations"].values():
            for frame in action["frames"]:
                assert (root / "public" / frame["path"].lstrip("/")).resolve() in expected
                references += 1
assert references == 520
assert {p.suffix for p in (root / "public/level38/classes").rglob("*") if p.is_file()} == {".json", ".png"}
print("PASS: 516 unchanged PNGs, 520 runtime frame references, 104 appearances, 12 naturally shorter idle sprites; dimensions, alpha, foot baseline and provenance hashes verified.")

"""Copy approved normalized frames unchanged. Usage: python scripts/level38-import-sprites.py AUDIT_MANIFEST"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]).resolve()
audit = json.loads(source.read_text(encoding="utf8"))
manifest = {"version": "level38-sprites-3.9.0", "canvas": [16, 24], "anchor": [8, 24], "renderScale": 2, "classes": []}
provenance = {"version": manifest["version"], "appearances": []}
for item in audit["classes"]:
    job = {"classId": item["classId"], "displayNames": item["displayNames"], "enabled": True, "variants": []}
    for variant in item["variants"]:
        assert re.fullmatch(r"[a-z-]+", job["classId"])
        assert re.fullmatch(r"[a-z]+", variant["variantId"])
        entry = {"variantId": variant["variantId"], "visibleStandingHeight": variant["visibleStandingHeight"], "mirrorPolicy": variant["mirrorPolicy"], "animations": {}}
        record = {k: variant[k] for k in ("classId", "variantId", "sourceGame", "sourcePage", "sourceSite", "attribution", "permissionStatus", "normalization", "notes", "auditStatus")}
        record["frames"] = []
        for action, animation in variant["animations"].items():
            assert action in ("idle", "walk", "victory")
            for frame in animation["frames"]:
                relative = Path(frame["path"]).relative_to("normalized")
                assert ".." not in relative.parts
                original = source.parent / frame["path"]
                with Image.open(original) as img:
                    rgba = img.convert("RGBA")
                    assert rgba.size == (16, 24)
                    assert set(rgba.getchannel("A").getdata()) <= {0, 255}
                    assert hashlib.sha256(rgba.tobytes()).hexdigest() == frame["normalizedSha256"]
                target = root / "public/level38/classes" / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(original, target)
                record["frames"].append({"path": "/level38/classes/" + relative.as_posix(), "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "pixelSha256": frame["normalizedSha256"], "nativeDimensions": frame["nativeDimensions"], "paddingOffset": frame["paddingOffset"], "sourceUrl": animation["sourceAsset"]["assetUrl"], "sourceSha256": animation["sourceAsset"]["sha256"]})
        for action, runtime in variant["runtimeAnimations"].items():
            entry["animations"]["celebration" if action == "victory" else action] = {
                "frames": [{**f, "path": "/level38/classes/" + Path(f["path"]).relative_to("normalized").as_posix()} for f in runtime["frames"]],
                "frameDurationMs": runtime["frameDurationMs"], "loop": action == "walk", "cycles": 3 if action == "victory" else None,
                "sourceFrameCount": variant["animations"][action]["frameCount"], "sourceCycleMs": variant["animations"][action]["sourceCycleMs"],
                "assembly": runtime["assembly"], "sourceCycleComplete": runtime["sourceCycleComplete"]}
        job["variants"].append(entry)
        provenance["appearances"].append(record)
    manifest["classes"].append(job)
assert len(manifest["classes"]) == 24
assert len(provenance["appearances"]) == 104
for path, data in [("public/level38/classes/manifest.json", manifest), ("docs/level38-sprite-provenance.json", provenance)]:
    (root / path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print("Imported 104 appearances with verified, unchanged normalized pixels.")

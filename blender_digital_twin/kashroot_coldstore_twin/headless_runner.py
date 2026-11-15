"""Headless twin runner (Phase 9): spec JSON -> GLB + metadata, no Blender.

Runs under plain Python (the pipeline used on this machine) **and** under
``blender -b -P`` (where the same run can additionally build the .blend
scene via ``geometry_builder`` when ``--blend`` is passed).

CLI::

    python -m kashroot_coldstore_twin.headless_runner \
        --spec specs/default_facility.json \
        --out-dir public/models \
        [--glb kashroot_coldstore_twin.glb] \
        [--meta kashroot_coldstore_metadata.json] \
        [--quiet]

Steps: load spec -> validate (abort on errors; print warnings) ->
build model -> export GLB + metadata -> self-verify the GLB -> report.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, Optional

from .capacity_engine import build_model, capacity_summary
from .glb_exporter import export_glb, verify_glb
from .properties import TwinSpec
from .validation import validate_spec


def run(spec: TwinSpec, out_glb: str, out_meta: Optional[str] = None) -> Dict[str, Any]:
    """Validate, export and verify. Raises on validation errors / verify failures."""
    result = validate_spec(spec)
    errors = [i.message for i in result.errors]
    warnings = [i.message for i in result.warnings]
    if errors:
        raise ValueError("Spec validation failed:\n  - " + "\n  - ".join(errors))
    model = build_model(spec)
    stats = export_glb(spec, out_glb, out_meta)
    stats["validation_warnings"] = warnings
    stats["totals"] = model["totals"]
    if os.environ.get("KRT_DEBUG"):
        stats["summary"] = capacity_summary(spec)
    got = verify_glb(out_glb)
    stats["verify"] = got
    if got["instanced_nodes"] < 1:
        raise RuntimeError("verify_glb: no instanced crate nodes found in the GLB")
    return stats


def main(argv: Optional[list] = None) -> int:
    ap = argparse.ArgumentParser(description="KashRoot cold-store twin: spec -> GLB + metadata")
    ap.add_argument("--spec", required=True, help="Path to the facility spec JSON")
    ap.add_argument("--out-dir", required=True, help="Directory for the .glb and metadata.json")
    ap.add_argument("--glb", default="kashroot_coldstore_twin.glb")
    ap.add_argument("--meta", default="kashroot_coldstore_metadata.json")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    spec = TwinSpec.from_json_file(args.spec)
    os.makedirs(args.out_dir, exist_ok=True)
    out_glb = os.path.join(args.out_dir, args.glb)
    out_meta = os.path.join(args.out_dir, args.meta)
    stats = run(spec, out_glb, out_meta)
    if not args.quiet:
        t = stats.get("totals", {})
        print("GLB  : %s (%d bytes, sha256 %s...)" % (out_glb, stats["bytes"], str(stats.get("sha256"))[:12]))
        print("META : %s" % out_meta)
        print("GLB  : nodes=%d meshes=%d accessors=%d materials=%d instanced=%d" % (
            stats["nodes"], stats["meshes"], stats["accessors"], stats["materials"], stats["instanced_nodes"]))
        print("CAP  : chambers=%s crates=%s booked=%s usable=%.1f t occupied=%.1f t remaining=%.1f t (%.1f%%)" % (
            t.get("chambers_count"), t.get("total_crate_count"), t.get("booked_crate_count"),
            (t.get("actual_usable_capacity_kg") or 0) / 1000.0,
            (t.get("occupied_capacity_kg") or 0) / 1000.0,
            (t.get("remaining_capacity_kg") or 0) / 1000.0,
            t.get("occupancy_pct", 0.0)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""KashRoot digital-twin generator + exporter entry point (Phase 9).

Generates the reference facility from ``specs/default_facility.json``
and writes the web deliverables directly into ``kashroot-web/public/models``:

  * ``kashroot_coldstore_twin.glb``          — real glTF 2.0 binary
  * ``kashroot_coldstore_metadata.json``     — exact capacity + layout metadata

Works without Blender (pure-Python headless GLB writer). When an owner
updates facility dimensions in the Cold Storage portal, the web side
calls this with a generated spec (or hits the TS mirror in
``kashroot-web/src/lib/twin`` for instant preview numbers).

Usage::

    python blender_digital_twin/generate_and_export.py
    python blender_digital_twin/generate_and_export.py --spec path.json --out-dir path/
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Optional

_HERE = os.path.dirname(os.path.abspath(__file__))
_PKG_PARENT = os.path.dirname(_HERE)  # .../kashroot-web
if _PKG_PARENT not in sys.path:
    sys.path.insert(0, _PKG_PARENT)

DEFAULT_SPEC = os.path.join(_HERE, "specs", "default_facility.json")
DEFAULT_OUT = os.path.join(os.path.dirname(_HERE), "public", "models")


def generate(spec_path: Optional[str] = None, out_dir: Optional[str] = None, quiet: bool = False) -> dict:
    from kashroot_coldstore_twin.headless_runner import run
    from kashroot_coldstore_twin.properties import TwinSpec

    spec_path = spec_path or DEFAULT_SPEC
    out_dir = out_dir or DEFAULT_OUT
    spec = TwinSpec.from_json_file(spec_path)
    os.makedirs(out_dir, exist_ok=True)
    stats = run(
        spec,
        os.path.join(out_dir, "kashroot_coldstore_twin.glb"),
        os.path.join(out_dir, "kashroot_coldstore_metadata.json"),
    )
    if not quiet:
        t = stats.get("totals", {})
        print("[twin] GLB : public/models/kashroot_coldstore_twin.glb (%d bytes, %d nodes, %d instanced)" % (
            stats["bytes"], stats["nodes"], stats["instanced_nodes"]))
        print("[twin] META: public/models/kashroot_coldstore_metadata.json")
        print("[twin] CAP : chambers=%s crates=%s booked=%s usable=%.1f t occupied=%.1f t remaining=%.1f t (%.1f%%)" % (
            t.get("chambers_count"), t.get("total_crate_count"), t.get("booked_crate_count"),
            (t.get("actual_usable_capacity_kg") or 0) / 1000.0,
            (t.get("occupied_capacity_kg") or 0) / 1000.0,
            (t.get("remaining_capacity_kg") or 0) / 1000.0,
            t.get("occupancy_pct", 0.0)))
    return stats


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate the KashRoot cold-store twin GLB + metadata")
    ap.add_argument("--spec", default=DEFAULT_SPEC)
    ap.add_argument("--out-dir", default=DEFAULT_OUT)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    generate(args.spec, args.out_dir, args.quiet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

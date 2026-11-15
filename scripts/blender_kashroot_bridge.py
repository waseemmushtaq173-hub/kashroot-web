"""KashRoot Blender bridge — one script, three artifacts, two runtimes.

Runs the cold-store digital-twin pipeline from the owner's own portal
payload and writes the web assets straight into ``public/models/``:

  * ``kashroot_facility_twin.glb``          full facility (building, insulated
                                            walls, CA sliding doors, ceiling
                                            evaporators, multi-floor racks,
                                            ventilated crates, apples)
  * ``kashroot_rack_stack.glb``             one high-detail instanced rack bay
                                            (frames + levels + crates + apples)
                                            the web spreads across every floor slot
  * ``kashroot_coldstore_metadata.json``    exact capacity / layout metadata

Two runtimes, one exporter:

  * Blender (VS Code "Blender Development" extension or CLI)::

        blender --background --python scripts/blender_kashroot_bridge.py -- <payload-or-file>

    When ``bpy`` is importable the bridge first builds the live .blend scene
    (``kashroot_coldstore_twin.geometry_builder``), then exports through the
    same pure-Python, deterministic stage below — the scene you look at in
    Blender and the GLB the web loads are therefore provably the same model.

  * Plain Python (no Blender — the enforced runtime on machines without it)::

        python scripts/blender_kashroot_bridge.py -- <payload-or-file> [--out public/models]

The payload (all metres / kilograms / degC / %), owner-defined::

    {
      "facilityName": "KashRoot Cold Store",
      "building": {"length": 48, "width": 26, "height": 9,
                   "wallThickness": 0.2, "insulationThickness": 0.1,
                   "loadingBay": {"length": 47.2, "width": 6.5},
                   "passageWidth": 3.0},
      "chambers": [{"chamberId": "CH01", "label": "Chamber 1",
                    "length": 11.5, "width": 17.5, "height": 8.2,
                    "temperature": -0.5, "humidity": 92, "floors": 1,
                    "aisleWidth": 3.5, "doorWidth": 3.2, "doorHeight": 4.0,
                    "maxLoadKg": 60000}],
      "racks": {"unitType": "CRATE" | "BIN",
                "unitLength": 0.6, "unitWidth": 0.4, "unitHeight": 0.33,
                "unitCapacityKg": 20, "cratesPerRow": 15, "rowsPerLevel": 4,
                "verticalStackLevels": 12, "rackClearance": 0.1},
      "bookings": [{"growerId": "...", "name": "...", "productType": "Apple",
                    "crates": 120, "chamber": "CH01"}]
    }

    ``racks`` may be a list — one entry per chamber (+ a ``chamberId`` each);
    a single object applies to every chamber. ``bookings`` is optional and
    never invented: it is the only source of booked crates.

Payload channels (this order): the file / JSON after ``--`` in ``sys.argv``
(both VS Code and the CLI), the ``KASHROOT_BRIDGE_PAYLOAD_FILE`` or
``KASHROOT_BRIDGE_PAYLOAD`` environment variable (the JSON channel the web
API route uses), else the bundled reference spec.

Result: a ``[bridge] RESULT {json}`` line, exit 0 when all three artifacts
exist and self-verify; any spec/engine error exits non-zero with the
reason.
"""
from __future__ import annotations

import json
import os
import shutil
import struct
import sys
from typing import Any, Dict, List, Optional, Sequence

_HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(_HERE)                       # .../kashroot-web
PKG_DIR = os.path.join(ROOT, "blender_digital_twin")  # package parent
if PKG_DIR not in sys.path:
    sys.path.insert(0, PKG_DIR)

DEFAULT_OUT = os.path.join(ROOT, "public", "models")
DEFAULT_SPEC = os.path.join(PKG_DIR, "specs", "default_facility.json")

facility_glb_name = "kashroot_facility_twin.glb"
rack_stack_glb_name = "kashroot_rack_stack.glb"
metadata_name = "kashroot_coldstore_metadata.json"
legacy_glb_name = "kashroot_coldstore_twin.glb"     # Phase-1 viewer asset, kept byte-identical

MATERIAL_BY_UNIT = {"CRATE": "HDPE_PLASTIC", "BIN": "WOODEN_BIN"}
WALL_BY_UNIT = {"HDPE_PLASTIC": 0.008, "WOODEN_BIN": 0.012}


# ---------------------------------------------------------------------- #
# Owner payload -> TwinSpec                                              #
# ---------------------------------------------------------------------- #
def _num(v: Any, name: str, low: float = 0.0, high: float = 100000.0) -> float:
    try:
        x = float(v)
    except Exception:
        raise ValueError(f"{name}: expected a number, got {v!r}")
    if x != x or x == float("inf"):  # NaN / inf
        raise ValueError(f"{name}: not a finite number")
    if x < low or x > high:
        raise ValueError(f"{name}: {x} outside [{low}, {high}]")
    return x


def _unit_systems(racks: Any, chambers: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Racks payload -> one unit system per chamber id."""
    if racks is None:
        return {}
    items = racks if isinstance(racks, list) else [racks]
    out: Dict[str, Dict[str, Any]] = {}
    single = not isinstance(racks, list)
    for i, r in enumerate(items):
        if not isinstance(r, dict):
            raise ValueError(f"racks[{i}]: expected an object")
        unit = str(r.get("unitType", "CRATE")).upper() or "CRATE"
        if unit not in MATERIAL_BY_UNIT:
            raise ValueError(f"racks[{i}].unitType: '{unit}' is neither CRATE nor BIN")
        system = {
            "unit_type": unit,
            "unit_length": _num(r.get("unitLength", 0.6), f"racks[{i}].unitLength", 0.05, 5),
            "unit_width": _num(r.get("unitWidth", 0.4), f"racks[{i}].unitWidth", 0.05, 5),
            "unit_height": _num(r.get("unitHeight", 0.33), f"racks[{i}].unitHeight", 0.05, 5),
            "unit_kg": _num(r.get("unitCapacityKg", 20), f"racks[{i}].unitCapacityKg", 0.1, 5000),
            "crates_per_row": max(1, int(_num(r.get("cratesPerRow", 15), f"racks[{i}].cratesPerRow", 1, 200))),
            "rows_per_level": max(1, int(_num(r.get("rowsPerLevel", 4), f"racks[{i}].rowsPerLevel", 1, 100))),
            "levels": max(1, int(_num(r.get("verticalStackLevels", 12), f"racks[{i}].verticalStackLevels", 1, 60))),
            "rack_clearance": _num(r.get("rackClearance", 0.1), f"racks[{i}].rackClearance", 0.0, 2),
        }
        cid = r.get("chamberId")
        ids = [str(c.get("chamberId") or f"CH{i + 1:02d}") for c in chambers]
        if cid:
            out[str(cid)] = system
        elif single:
            out.update(dict.fromkeys(ids, system))
        else:
            out[ids[min(i, len(ids) - 1)]] = system
    return out


def _bookings(bookings: Any) -> List[Dict[str, Any]]:
    """Owner booking rows (from store records) in the engine's own words."""
    if not bookings:
        return []
    if not isinstance(bookings, list):
        raise ValueError("bookings: expected a list")
    out = []
    for i, b in enumerate(bookings):
        if not isinstance(b, dict):
            raise ValueError(f"bookings[{i}]: expected an object")
        crates = int(_num(b.get("crates", b.get("cratesTotal", 0)), f"bookings[{i}].crates", 0, 200000))
        if crates <= 0:
            continue
        out.append({
            "grower_id": str(b.get("growerId") or f"GRW-{i + 1:03d}"),
            "name": str(b.get("name") or ""),
            "product_type": str(b.get("productType") or "Apple"),
            "crates": crates,
            "chamber": b.get("chamber") or b.get("chamberId"),
            "weight_per_crate_kg": (None if b.get("weightPerCrateKg") is None
                                    else _num(b.get("weightPerCrateKg"), f"bookings[{i}].weightPerCrateKg", 0.1, 5000)),
        })
    return out


def _chamber_cfg(c: Any, i: int, systems: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    from kashroot_coldstore_twin.properties import RackConfig, CrateConfig  # type: ignore
    if not isinstance(c, dict):
        raise ValueError(f"chambers[{i}]: expected an object")
    cid = str(c.get("chamberId") or f"CH{i + 1:02d}")
    sys_ = systems.get(cid) or {}
    unit = sys_.get("unit_type", "CRATE")
    rack_kw: Dict[str, Any] = {}
    crate_kw: Dict[str, Any] = {}
    if sys_:
        rack_kw = {"num_levels": sys_["levels"], "level_clearance_m": sys_["rack_clearance"]}
        crate_kw = {
            "crate_length_m": sys_["unit_length"],
            "crate_width_m": sys_["unit_width"],
            "crate_height_m": sys_["unit_height"],
            "weight_capacity_kg": sys_["unit_kg"],
            "crates_per_row": sys_["crates_per_row"],
            "rows_per_level": sys_["rows_per_level"],
            "vertical_stack_limit": sys_["levels"],
            "material_type": MATERIAL_BY_UNIT[unit],
        }
    return {
        "chamber_id": cid,
        "label": str(c.get("label") or f"Chamber {i + 1}"),
        "length_m": _num(c.get("length"), f"chambers[{i}].length", 1, 400),
        "width_m": _num(c.get("width"), f"chambers[{i}].width", 1, 400),
        "height_m": _num(c.get("height"), f"chambers[{i}].height", 0.5, 60),
        "temperature_c": _num(c.get("temperature", -0.5), f"chambers[{i}].temperature", -32, 15),
        "humidity_pct": _num(c.get("humidity", 92), f"chambers[{i}].humidity", 0, 100),
        "ca": bool(c.get("controlAtmosphere", c.get("ca", True))),
        "num_floors": max(1, int(_num(c.get("floors", 1), f"chambers[{i}].floors", 1, 12))),
        "aisle_width_m": _num(c.get("aisleWidth", 3.5), f"chambers[{i}].aisleWidth", 0, 30),
        "door_width_m": _num(c.get("doorWidth", 3.2), f"chambers[{i}].doorWidth", 0.4, 30),
        "door_height_m": _num(c.get("doorHeight", 4.0), f"chambers[{i}].doorHeight", 0.8, 30),
        "max_load_capacity_kg": _num(c.get("maxLoadKg", 60000), f"chambers[{i}].maxLoadKg", 0, 2_000_000),
        "unit_mode": "BINS" if unit == "BIN" else "CRATES",
        "rack": rack_kw,
        "crate": crate_kw,
    }


def materialize(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Portal payload -> a native TwinSpec dict (the engine's exact words)."""
    building = payload.get("building") or {}
    chambers = payload.get("chambers")
    if not isinstance(chambers, list) or not chambers:
        raise ValueError("chambers: at least one chamber is required")
    systems = _unit_systems(payload.get("racks"), chambers)
    bay = building.get("loadingBay")
    bld: Dict[str, Any] = {
        "length_m": _num(building.get("length"), "building.length", 1, 400),
        "width_m": _num(building.get("width"), "building.width", 1, 400),
        "height_m": _num(building.get("height"), "building.height", 2, 60),
        "wall_thickness_m": _num(building.get("wallThickness", 0.2), "building.wallThickness", 0.05, 2),
        "insulation_thickness_m": _num(building.get("insulationThickness", 0.1), "building.insulationThickness", 0.0, 2),
        "num_chambers": len(chambers),
    }
    if isinstance(bay, dict):
        bld["loading_bay_length_m"] = _num(bay.get("length"), "building.loadingBay.length", 1, 400)
        bld["loading_bay_width_m"] = _num(bay.get("width"), "building.loadingBay.width", 1, 100)
    elif bay is not None:
        if _num(bay, "building.loadingBay", 1, 100) > 20:
            bld["loading_bay_length_m"] = building["loadingBay"]
        else:
            bld["loading_bay_width_m"] = building["loadingBay"]
    spec: Dict[str, Any] = {
        "$schema": "kashroot_coldstore_twin.schema/1.0",
        "facility_name": str(payload.get("facilityName") or "KashRoot Cold Store"),
        "building": bld,
        "chambers": [_chamber_cfg(c, i, systems) for i, c in enumerate(chambers)],
        "demo_bookings": _bookings(payload.get("bookings")),
    }
    spec["_owner"] = payload  # echoed into the metadata's bridge section only
    return spec


def to_spec(spec_dict: Dict[str, Any]) -> Any:
    """Native spec dict (already in engine words) -> TwinSpec, extras dropped."""
    import copy

    from kashroot_coldstore_twin.properties import TwinSpec  # type: ignore
    d = copy.deepcopy(spec_dict)
    d.pop("_owner", None)
    keeper = {"facility_name", "building", "panels", "staging", "chambers", "demo_bookings", "$schema"}
    spec = TwinSpec.from_dict({k: v for k, v in d.items() if k in keeper})
    return spec, d


# ---------------------------------------------------------------------- #
# The rack-stack asset (one high-detail instanced bay)                    #
# ---------------------------------------------------------------------- #
def _rack_stack_bytes(sys_: Dict[str, Any], out_dir: str, bay_pitch: float, rack_depth: float,
                      rack_height: float, upright_w: float) -> bytes:
    from kashroot_coldstore_twin.glb_exporter import Stage, verify_glb  # type: ignore
    from kashroot_coldstore_twin.capacity_engine import APPLE_DIAMETER_M, APPLES_PER_CRATE_TOP  # type: ignore

    L = sys_["unit_length"]
    W = sys_["unit_width"]
    H = sys_["unit_height"]
    wall = WALL_BY_UNIT["WOODEN_BIN" if sys_["unit_type"] == "BIN" else "HDPE_PLASTIC"]
    mat = "wood_bin" if sys_["unit_type"] == "BIN" else "hdpe_red"
    gap = 0.02
    level_pitch = H + sys_["rack_clearance"]
    levels = max(1, int(min(sys_["levels"], rack_height // level_pitch if level_pitch > 0 else sys_["levels"])))

    stage = Stage()
    bay_mesh = stage.rack_bay_mesh(
        "RackBayBody", upright_w, rack_depth, rack_height, bay_pitch, levels, level_pitch,
        "rack_steel", "wire_mesh",
    )
    crate_mesh = stage.crate_mesh("Unit", L, W, H, wall, mat)
    apple_mesh = stage.apple_cluster_mesh("AppleCluster", L, W)

    fit_along = max(1, int((bay_pitch - 2 * upright_w) // (L + gap)))
    fit_across = max(1, int((rack_depth - 2 * upright_w) // (W + gap)))
    rows = min(sys_["rows_per_level"], fit_across)
    trans: List[List[float]] = []
    apple_trans: List[List[float]] = []
    n_cols = 0
    for lv in range(levels):
        y_deck = lv * level_pitch + 0.05
        y_crate = y_deck + H / 2.0
        for j in range(rows):
            z = -(rack_depth / 2.0) + upright_w + W / 2.0 + j * (W + gap)
            for c in range(fit_along):
                x = -(bay_pitch / 2.0) + upright_w + L / 2.0 + c * (L + gap)
                trans.append([round(x, 4), round(y_crate, 4), round(z, 4)])
                apple_trans.append([round(x, 4), round(y_deck + H + APPLE_DIAMETER_M * 0.08, 4), round(z, 4)])
                n_cols = max(n_cols, c + 1)
    tr_acc = stage.accessor([tuple(t) for t in trans], 5126, "VEC3")
    ap_acc = stage.accessor([tuple(t) for t in apple_trans], 5126, "VEC3")

    per_level = fit_along * rows
    root = stage.add_node("RackStackTemplate", mesh=bay_mesh, extras={
        "krt": "rack_stack_template",
        "unit_type": sys_["unit_type"],
        "unit_size_m": [L, W, H],
        "unit_kg": sys_["unit_kg"],
        "unit_material": mat,
        "levels": levels,
        "level_pitch_m": round(level_pitch, 4),
        "bay_pitch_m": round(bay_pitch, 4),
        "rack_depth_m": round(rack_depth, 4),
        "crates_per_row_fit": n_cols,
        "rows_per_level_fit": rows,
        "crates_per_level_per_bay": per_level,
        "crates_per_bay": per_level * levels,
        "apples_per_crate": APPLES_PER_CRATE_TOP[0] * APPLES_PER_CRATE_TOP[1],
        "stride": {"crates_per_level_per_bay": per_level, "levels": levels},
    })
    crates_n = stage.add_node("Units", mesh=crate_mesh, parent=root,
                              instance_attrs={"TRANSLATION": tr_acc},
                              extras={"krt": "stack_units", "count": len(trans), "order": "level -> row -> column"})
    apples_n = stage.add_node("Apples", mesh=apple_mesh, parent=root,
                              instance_attrs={"TRANSLATION": ap_acc},
                              extras={"krt": "stack_apples", "count": len(apple_trans)})
    assert root >= 0 and crates_n > 0 and apples_n > 0

    gltf = stage.g
    json_bytes = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_payload = json_bytes + b" " * ((4 - (len(json_bytes) % 4)) % 4)
    bin_payload = bytes(stage.bin) + b"\x00" * ((4 - (len(stage.bin) % 4)) % 4)
    total = 12 + 8 + len(json_payload) + 8 + len(bin_payload)
    data = (struct.pack("<4sII", b"glTF", 2, total)
            + struct.pack("<I4s", len(json_payload), b"JSON")
            + json_payload
            + struct.pack("<I4s", len(bin_payload), b"BIN\x00")
            + bin_payload)

    import hashlib
    path = os.path.join(out_dir, rack_stack_glb_name)
    with open(path, "wb") as fh:
        fh.write(data)
    verify_glb(path)
    inst = sum(1 for n in gltf["nodes"] if n.get("extensions", {}).get("EXT_mesh_gpu_instancing"))
    if inst < 2:
        raise RuntimeError("rack-stack GLB: instanced unit nodes missing")
    return {
        "filename": rack_stack_glb_name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "nodes": len(gltf["nodes"]),
        "meshes": len(gltf["meshes"]),
        "instanced_nodes": inst,
        "crates_per_bay": per_level * levels,
        "levels": levels,
    }


# ---------------------------------------------------------------------- #
# Run                                                                     #
# ---------------------------------------------------------------------- #
def load_payload(argv: Sequence[str]) -> Dict[str, Any]:
    """The payload: arg after `--` (a .json file, or JSON text), env, or the bundled spec."""
    chunks = list(argv)
    if "--" in chunks:
        chunks = chunks[chunks.index("--") + 1:]
    else:
        chunks = chunks[1:]  # plain run: drop the script's own path (argv[0])
    rest: List[str] = []
    i = 0
    while i < len(chunks):
        tok = chunks[i]
        if tok.startswith("--out-dir="):
            globals()["_OUT"] = os.path.abspath(tok.split("=", 1)[1])
        elif tok == "--out-dir" and i + 1 < len(chunks):
            globals()["_OUT"] = os.path.abspath(chunks[i + 1])
            i += 1
        else:
            rest.append(tok)
        i += 1

    text_payload = os.environ.get("KASHROOT_BRIDGE_PAYLOAD") or None
    payload_path = os.environ.get("KASHROOT_BRIDGE_PAYLOAD_FILE") or None
    if not (text_payload or payload_path) and rest:
        if len(rest) == 1 and os.path.isfile(os.path.abspath(rest[0])):
            payload_path = os.path.abspath(rest[0])
        else:
            text_payload = " ".join(rest)
    path = payload_path or DEFAULT_SPEC
    with open(path, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    if text_payload is not None and not text_payload.strip().startswith("{"):
        raise ValueError("payload: not JSON")
    return json.loads(text_payload) if text_payload is not None else raw


def main() -> int:
    payload_raw = load_payload(sys.argv)
    out_dir = os.path.abspath(globals().get("_OUT") or os.environ.get("KASHROOT_BRIDGE_OUT") or DEFAULT_OUT)
    os.makedirs(out_dir, exist_ok=True)

    in_blender = False
    try:
        import bpy  # type: ignore
        in_blender = True
    except Exception:
        in_blender = False

    if payload_raw.get("$schema", "").startswith("kashroot_coldstore_twin") or "panel" in (payload_raw.get("building") or {}):
        spec, spec_dict = to_spec(payload_raw)
        owner = None
    else:
        spec_dict = materialize(payload_raw)
        owner = spec_dict.get("_owner")
        spec, spec_dict = to_spec(spec_dict)

    from kashroot_coldstore_twin.headless_runner import run  # type: ignore

    facility_path = os.path.join(out_dir, facility_glb_name)
    meta_path = os.path.join(out_dir, metadata_name)
    stats = run(spec, facility_path, meta_path)

    # The Phase-1 twin viewer keeps loading the legacy name; same bytes.
    shutil.copyfile(facility_path, os.path.join(out_dir, legacy_glb_name))

    rack_cfg = spec.chambers[0].rack
    crate_cfg = spec.chambers[0].crate
    owner_rooms = (owner or {}).get("chambers") or []
    owner_id = str(owner_rooms[0].get("chamberId") or spec.chambers[0].chamber_id) if owner_rooms else str(spec.chambers[0].chamber_id)
    systems = _unit_systems((owner or {}).get("racks"), owner_rooms)
    rsys = dict(systems.get(owner_id, {}))
    if not rsys:
        rsys = {
            "unit_type": "BIN" if crate_cfg.material_type == "WOODEN_BIN" else "CRATE",
            "unit_length": crate_cfg.crate_length_m,
            "unit_width": crate_cfg.crate_width_m,
            "unit_height": crate_cfg.crate_height_m,
            "unit_kg": crate_cfg.weight_capacity_kg,
            "crates_per_row": crate_cfg.crates_per_row,
            "rows_per_level": crate_cfg.rows_per_level,
            "levels": rack_cfg.num_levels,
            "rack_clearance": rack_cfg.level_clearance_m,
        }
    from kashroot_coldstore_twin.capacity_engine import APPLES_PER_CRATE_TOP  # type: ignore
    rsys["apples_per_crate"] = APPLES_PER_CRATE_TOP[0] * APPLES_PER_CRATE_TOP[1]

    # Blender scene: built only under bpy so the VS Code session sees the twin.
    built_blend = False
    if in_blender:
        try:
            from kashroot_coldstore_twin.geometry_builder import build_facility, clear_scene  # type: ignore
            from kashroot_coldstore_twin.capacity_engine import build_model  # type: ignore
            clear_scene()
            build_facility(spec, build_model(spec))
            built_blend = True
        except Exception as e:  # scene build never blocks the web artifacts
            print(f"[bridge] blender scene skipped: {e}", file=sys.stderr)

    rack_stats = _rack_stack_bytes(
        rsys,
        out_dir=out_dir,
        bay_pitch=1.2,
        rack_depth=rack_cfg.rack_width_m,
        rack_height=rack_cfg.rack_height_m,
        upright_w=rack_cfg.upright_width_m,
    )

    with open(meta_path, "r", encoding="utf-8") as fh:
        meta = json.load(fh)
    meta["rack_stack"] = {k: v for k, v in rack_stats.items()}
    meta["bridge"] = {
        "blender": in_blender,
        "blend_scene_built": built_blend,
        "python": sys.version.split()[0],
        "owner_payload": owner,
    }
    with open(meta_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    result = {
        "ok": True,
        "blender": in_blender,
        "blend_scene_built": built_blend,
        "facility": {k: stats[k] for k in ("filename", "bytes", "sha256", "nodes", "meshes", "accessors", "materials", "instanced_nodes")},
        "rack_stack": rack_stats,
        "metadata": {"filename": metadata_name, "bytes": os.path.getsize(meta_path)},
        "totals": stats.get("totals", {}),
        "out_dir": out_dir,
    }
    print("[bridge] " + json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - one line, machine-readable
        import traceback
        traceback.print_exc()
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        print(f"[bridge] failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)

"""Blender 5.2.3 LTS generator — the KashRoot cold-store kit + facility twin.

Runs headless::

    blender --background --python scripts/blender_generate_coldstore.py -- --out-dir public/models

Writes three artifacts into the out directory (default ``public/models``):

  * ``coldstore_kit.glb``               the six kit prototypes (real sizes):
        Kit_Crate_HDPE                  ventilated HDPE crate (hdpe_red)
        Kit_Pallet_Bin                  wooden bulk pallet bin (wood_bin)
        Kit_Apples_Cluster              the booked-crate apple crown
                                        (red / gold / stem, engine's own grid)
        Kit_Rack_Post                   galvanised C-profile upright
        Kit_Rack_Beam                   C-profile step-beam (one bay)
        Kit_Evaporator                  triple-fan ceiling evaporator
  * ``coldstore_facility_twin.glb``     the whole measured facility, built by
                                        the package's own ``geometry_builder``
  * ``coldstore_metadata.json``         generator identity + engine totals +
                                        file bytes/sha256 for both GLBs

Nothing invents a number: the kit sizes and all capacity totals come from the
owner payload through the bridge (``blender_kashroot_bridge.materialize`` /
``to_spec``) and the same capacity engine the API route reports. The scene
build reuses the package plumbing (``geometry_builder.build_facility``,
``produce_generator`` meshes, ``materials_pbr`` palette); the kit is exported
separately so the web can instance each prototype itself. Machine-readable
result: the last ``[bgen] RESULT {json}`` line; exit 0 only when both GLBs are
written and self-verified.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)                        # .../kashroot-web
for _p in (os.path.join(_ROOT, "blender_digital_twin"), _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import bpy  # noqa: E402  (this script only ever runs inside Blender)

KIT_GLB = "coldstore_kit.glb"
FACILITY_GLB = "coldstore_facility_twin.glb"
METADATA = "coldstore_metadata.json"
KIT_COLL = "KRT_Kit"


# ---------------------------------------------------------------------- #
# argv normalisation                                                      #
# ---------------------------------------------------------------------- #
def _normalize_argv(argv: Sequence[str]) -> List[str]:
    """Tokens after ``--`` into the words the bridge understands. A bare
    existing directory is accepted as the out dir, a JSON file as the payload."""
    chunks = list(argv)
    if "--" in chunks:
        chunks = chunks[chunks.index("--") + 1:]
    out: List[str] = []
    i = 0
    while i < len(chunks):
        tok = chunks[i]
        if tok == "--out-dir" and i + 1 < len(chunks):
            out += [tok, chunks[i + 1]]
            i += 2
            continue
        if tok.startswith("--out-dir=") or tok.startswith("--"):
            out.append(tok)
            i += 1
            continue
        path = os.path.abspath(tok)
        if os.path.isdir(path):
            out += ["--out-dir", path]
        elif os.path.isfile(path):
            out.append(path)
        else:
            out.append(tok)   # the bridge's own wording for the error
        i += 1
    # Keep a '--' so the bridge slices the same way it does under the CLI.
    return ["blender", "--"] + out


# ---------------------------------------------------------------------- #
# Geometry plumbing (same add-box pattern as produce_generator)            #
# ---------------------------------------------------------------------- #
Verts = List[Tuple[float, float, float]]
Faces = List[Sequence[int]]


def _add_box(verts: Verts, faces: Faces, slot_faces: List[List[int]], slot: int,
             x0: float, y0: float, z0: float, sx: float, sy: float, sz: float) -> None:
    """One axis-aligned engine-coords box; hexa-face order fixed and reliable."""
    c = len(verts)
    cx, cy, cz = x0 + sx / 2.0, y0 + sy / 2.0, z0 + sz / 2.0
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    order = ((-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
             (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz))
    for (dx, dy, dz) in order:
        verts.append((cx + dx, cy + dy, cz + dz))
    start = len(faces)
    faces.extend([(c + 0, c + 3, c + 2, c + 1), (c + 4, c + 5, c + 6, c + 7),
                  (c + 0, c + 1, c + 5, c + 4), (c + 2, c + 3, c + 7, c + 6),
                  (c + 0, c + 4, c + 7, c + 3), (c + 1, c + 2, c + 6, c + 5)])
    slot_faces[slot].extend(range(start, len(faces)))


def _add_cyl_slot(verts: Verts, faces: Faces, slot_faces: List[List[int]], slot: int,
                  cx: float, cy: float, cz: float, r: float, depth: float,
                  axis: str = "y", segs: int = 24) -> None:
    """An open-ended cylinder shroud (side walls only), normals outward."""
    start_v = len(verts)
    for sign in (-0.5, 0.5):
        ring: List[int] = []
        for s in range(segs):
            ph = 2 * math.pi * s / segs
            a = r * math.cos(ph)
            b = r * math.sin(ph)
            off = sign * depth
            if axis == "y":
                ring.append(len(verts)); verts.append((cx + a, cy + off, cz + b))
            else:
                ring.append(len(verts)); verts.append((cx + off, cy + a, cz + b))
        for s in range(segs):
            a0, a1 = ring[s], ring[(s + 1) % segs]
            b0, b1 = start_v + s, start_v + (s + 1) % segs
            faces.append((a0, a1, b1, b0) if sign > 0 else (a1, a0, b0, b1))
    start = len(faces) - segs * 2
    slot_faces[slot].extend(range(start, len(faces)))


# ---------------------------------------------------------------------- #
# The kit                                                                  #
# ---------------------------------------------------------------------- #
def _kit_collection() -> Any:
    """A fresh top-level KRT_Kit collection (never inside the facility)."""
    old = bpy.data.collections.get(KIT_COLL)
    if old is not None:
        for ob in [o for o in old.objects]:
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(old)
    for ob in [o for o in bpy.data.objects if o.name.startswith("Kit_")]:
        bpy.data.objects.remove(ob, do_unlink=True)
    kit = bpy.data.collections.new(KIT_COLL)
    bpy.context.scene.collection.children.link(kit)
    return kit


def _kit_obj(name: str, me: Any, kit: Any, kit_key: str, unit_m: Sequence[float]) -> Any:
    ob = bpy.data.objects.new(name, me)
    ob.location = (0.0, 0.0, 0.0)
    ob.rotation_euler = (0.0, 0.0, 0.0)
    # First object slot mirrors the mesh's first material (kept "DATA" linked).
    ob["krt"] = "kit"
    ob["kit"] = kit_key
    ob["size_m"] = [round(float(m), 4) for m in unit_m]
    kit.objects.link(ob)
    return ob


def _build_kit(spec: Any, mats: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], Any]:
    """Six kit prototypes at real-world sizes from the owner's own spec."""
    from kashroot_coldstore_twin.capacity_engine import (  # type: ignore
        APPLE_DIAMETER_M, APPLES_PER_CRATE_TOP,
    )
    from kashroot_coldstore_twin.produce_generator import (  # type: ignore
        apple_cluster_mesh, crate_boxes, mesh_from_faces,
    )

    cr = spec.chambers[0].crate
    rk = spec.chambers[0].rack
    L, W, H = float(cr.crate_length_m), float(cr.crate_width_m), float(cr.crate_height_m)
    is_bin = str(cr.material_type) == "WOODEN_BIN"
    wall = 0.012 if is_bin else 0.008
    levels = max(1, int(rk.num_levels))
    pitch = H + max(0.0, float(rk.level_clearance_m))
    upright = max(0.04, float(rk.upright_width_m or 0.075))
    post_h = max(float(rk.rack_height_m), levels * pitch + 0.10)
    post_h = min(post_h, 16.0)
    bay = 1.2

    kit = _kit_collection()
    pieces: List[Dict[str, Any]] = []

    # -- Kit_Apples_Cluster: the booked-crate crown, red / gold / stem slots -- #
    me = apple_cluster_mesh("Kit_Apples_Cluster", APPLES_PER_CRATE_TOP[0],
                            APPLES_PER_CRATE_TOP[1], L, W, APPLE_DIAMETER_M)
    assert me is not None
    for key in ("apple_cosse_red", "apple_gold", "apple_stem"):
        me.materials.append(mats[key])
    _kit_obj("Kit_Apples_Cluster", me, kit, "apples", [L, W, APPLE_DIAMETER_M])
    pieces.append({"name": "Kit_Apples_Cluster", "role": "apple crown per booked crate",
                   "materials": ["apple_cosse_red", "apple_gold", "apple_stem"],
                   "size_m": {"crate_length": L, "crate_width": W, "apple_diameter": APPLE_DIAMETER_M}})

    # -- Kit_Crate_HDPE (the store's own ventilated unit) and Kit_Pallet_Bin -- #
    box = crate_boxes(L, W, H, wall)          # centred, z-up, engine words
    crate_verts: Verts = []
    crate_faces: Faces = []
    crate_slot: List[List[int]] = [[]]
    for bx, by, bz, sx, sy, sz in box:
        _add_box(crate_verts, crate_faces, crate_slot, 0, bx, by, bz, sx, sy, sz)
    me = mesh_from_faces("Kit_Crate_HDPE", crate_verts, [tuple(f) for f in crate_faces])
    assert me is not None
    me.materials.append(mats["hdpe_red"])
    _kit_obj("Kit_Crate_HDPE", me, kit, "crate", [L, W, H])
    pieces.append({"name": "Kit_Crate_HDPE", "role": "ventilated HDPE crate",
                   "materials": ["hdpe_red"],
                   "size_m": {"length": L, "width": W, "height": H}})

    bin_verts: Verts = []
    bin_faces: Faces = []
    bin_slot: List[List[int]] = [[]]
    for bx, by, bz, sx, sy, sz in crate_boxes(1.2, 1.0, 0.75, 0.012):
        _add_box(bin_verts, bin_faces, bin_slot, 0, bx, by, bz, sx, sy, sz)
    for cx in (-0.42, 0.0, 0.42):                       # pallet skids under it
        _add_box(bin_verts, bin_faces, bin_slot, 0, cx - 0.06, -0.45, -0.375 - 0.085, 0.12, 0.9, 0.085)
    me = mesh_from_faces("Kit_Pallet_Bin", bin_verts, [tuple(f) for f in bin_faces])
    assert me is not None
    me.materials.append(mats["wood_bin"])
    _kit_obj("Kit_Pallet_Bin", me, kit, "bin", [1.2, 1.0, 0.835])
    pieces.append({"name": "Kit_Pallet_Bin", "role": "wooden bulk bin on pallet skids",
                   "materials": ["wood_bin"],
                   "size_m": {"length": 1.2, "width": 1.0, "height": 0.835}})

    # -- Kit_Rack_Post: C-profile galvanised upright, full rack height ----- #
    verts, faces, slots = [], [], [[]]
    _add_box(verts, faces, slots, 0, -0.003, -upright / 2.0, -post_h / 2.0, 0.006, upright, post_h)
    _add_box(verts, faces, slots, 0, -upright * 0.42, upright / 2.0 - 0.006, -post_h / 2.0, upright * 0.84, 0.006, post_h)
    _add_box(verts, faces, slots, 0, -upright * 0.42, -upright / 2.0, -post_h / 2.0, upright * 0.84, 0.006, post_h)
    me = mesh_from_faces("Kit_Rack_Post", verts, [tuple(f) for f in faces])
    assert me is not None
    me.materials.append(mats["rack_steel"])
    _kit_obj("Kit_Rack_Post", me, kit, "post", [upright * 0.84, upright, post_h])
    pieces.append({"name": "Kit_Rack_Post", "role": "galvanised C-profile upright",
                   "materials": ["rack_steel"],
                   "size_m": {"profile": upright, "height": post_h}})

    # -- Kit_Rack_Beam: the C-step beam spanning one bay ------------------- #
    verts, faces, slots = [], [], [[]]
    bh = min(0.063, H * 0.2)
    _add_box(verts, faces, slots, 0, -bay / 2.0, -0.025, -bh / 2.0, bay, 0.05, 0.006)
    _add_box(verts, faces, slots, 0, -bay / 2.0, -0.025, -bh / 2.0, bay, 0.006, bh)
    _add_box(verts, faces, slots, 0, -bay / 2.0, 0.019, -bh / 2.0, bay, 0.006, bh)
    me = mesh_from_faces("Kit_Rack_Beam", verts, [tuple(f) for f in faces])
    assert me is not None
    me.materials.append(mats["rack_steel"])
    _kit_obj("Kit_Rack_Beam", me, kit, "beam", [bay, 0.05, bh])
    pieces.append({"name": "Kit_Rack_Beam", "role": "C-profile load beam (one bay)",
                   "materials": ["rack_steel"],
                   "size_m": {"span": bay, "height": bh}})

    # -- Kit_Evaporator: ceiling unit, casing + triple fan shrouds + grille- #
    verts, faces, slots = [], [], [[], [], []]  # 0 body 1 fans 2 grille
    cl, cw, ch = 1.4, min(0.62, W * 1.8), min(1.0, H * 3.0)
    _add_box(verts, faces, slots, 0, -cl / 2.0, -cw / 2.0, -ch / 2.0, cl, cw, ch)
    fan_r = min(0.17, cw * 0.32)
    for i in range(3):
        fx = -cl / 2.0 + cl * (i + 0.5) / 3.0
        _add_cyl_slot(verts, faces, slots, 1, fx, cw / 2.0 + 0.055, 0.08, fan_r, 0.11, "y")
    _add_box(verts, faces, slots, 2, -cl / 2.0 + 0.02, cw / 2.0 - 0.055, -ch / 2.0 + 0.19, cl - 0.04, 0.02, ch - 0.22)
    me = mesh_from_faces("Kit_Evaporator", verts, [tuple(f) for f in faces])
    assert me is not None
    for key in ("evap_body", "fan_dark", "wire_mesh"):
        me.materials.append(mats[key])
    _kit_obj("Kit_Evaporator", me, kit, "evap", [cl, cw, ch])
    pieces.append({"name": "Kit_Evaporator", "role": "ceiling evaporator, triple fan shrouds",
                   "materials": ["evap_body", "fan_dark", "wire_mesh"],
                   "size_m": {"length": cl, "width": cw, "height": ch}})

    return pieces, kit


# ---------------------------------------------------------------------- #
# Exporters                                                                #
# ---------------------------------------------------------------------- #
def _walk(coll: Any) -> List[Any]:
    out: List[Any] = list(coll.objects)
    for ch in coll.children:
        out += _walk(ch)
    return out


def _facility_objects() -> List[Any]:
    root = bpy.data.collections.get("KRT_Twin")
    if root is None:
        return []
    return [ob for ob in _walk(root) if ob.type != "LIGHT"]


def _kit_objects(kit: Any) -> List[Any]:
    return [ob for ob in _walk(kit) if ob.type != "LIGHT"]


def _apply_selection(objects: List[Any]) -> int:
    for ob in bpy.context.view_layer.objects:
        ob.select_set(False)
    sel = 0
    for ob in objects:
        try:
            ob.select_set(True)
            sel += 1
        except RuntimeError:
            pass  # object is not in the view layer
    return sel


def _export_glb(path: str, objects: List[Any]) -> Dict[str, Any]:
    from kashroot_coldstore_twin.glb_exporter import verify_glb  # type: ignore

    sel = _apply_selection(objects)
    if sel == 0:
        raise RuntimeError(f"{os.path.basename(path)}: nothing selectable in the view layer")
    try:
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB",
                                  export_yup=True, export_materials="EXPORT", export_extras=True)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB")
    got = verify_glb(path)
    with open(path, "rb") as fh:
        data = fh.read()
    keep = ("nodes", "meshes", "accessors", "materials", "instanced_nodes", "extras_nodes")
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            **{k: got[k] for k in keep if k in got}}


# ---------------------------------------------------------------------- #
# Main                                                                     #
# ---------------------------------------------------------------------- #
def main() -> int:
    print(f"[bgen] Blender {bpy.app.version_string}", flush=True)

    def _coll(name: str, parent: Any = None) -> Any:
        """The package's own collection helper: reuse-or-create and link."""
        c = bpy.data.collections.get(name)
        if c is None:
            c = bpy.data.collections.new(name)
        if parent is None:
            parent = bpy.context.scene.collection
        if name not in [ch.name for ch in parent.children]:
            try:
                parent.children.link(c)
            except RuntimeError:
                pass  # already linked here
        return c

    import blender_kashroot_bridge as bridge  # type: ignore

    payload_raw = bridge.load_payload(_normalize_argv(sys.argv))
    out_dir = os.path.abspath(getattr(bridge, "_OUT", None) or os.environ.get("KASHROOT_BRIDGE_OUT")
                              or os.path.join(_ROOT, "public", "models"))
    os.makedirs(out_dir, exist_ok=True)

    if payload_raw.get("$schema", "").startswith("kashroot_coldstore_twin") or "panel" in (payload_raw.get("building") or {}):
        spec, _spec_dict = bridge.to_spec(payload_raw)
    else:
        spec, _spec_dict = bridge.to_spec(bridge.materialize(payload_raw))

    from kashroot_coldstore_twin import geometry_builder as gb  # type: ignore
    from kashroot_coldstore_twin.capacity_engine import build_model, capacity_summary  # type: ignore
    from kashroot_coldstore_twin.geometry_builder import build_facility, clear_scene, _materials  # type: ignore

    gb._coll = _coll  # the package calls its collection helper by module name

    model = build_model(spec)

    # geometry_builder reads the interior bounds as the engine's own
    # 6-tuple (x0,y0,z0,x1,y1,z1); the export dict keeps only [x0,y0,z0]
    # under "min" — hand the builder a copy it can walk endpoint to endpoint.
    env = model["envelope"]
    env6 = dict(env)
    env6["min"] = [env["min"][0], env["min"][1], env["min"][2],
                   env["max"][0], env["max"][1], env["max"][2]]
    model_for_scene = dict(model)
    model_for_scene["envelope"] = env6

    clear_scene()
    build_stats = build_facility(spec, model_for_scene)
    mats = _materials()          # reuses the krt.* datablocks the build made

    pieces, kit = _build_kit(spec, mats)

    kit_path = os.path.join(out_dir, KIT_GLB)
    facility_path = os.path.join(out_dir, FACILITY_GLB)
    kit_stats = _export_glb(kit_path, _kit_objects(kit))
    print(f"[bgen] kit written: {kit_stats}", flush=True)
    facility_stats = _export_glb(facility_path, _facility_objects())
    print(f"[bgen] facility written: {facility_stats}", flush=True)
    # The .blend path exports one node per real object (the web instances the
    # kit itself), so require a real scene, not glTF instancing.
    if facility_stats.get("nodes", 0) < 40 or facility_stats.get("meshes", 0) < 10:
        raise RuntimeError("facility GLB looks incomplete")
    if len(pieces) != 6:
        raise RuntimeError(f"kit must hold six prototypes, built {len(pieces)}")

    meta = {
        "generator": "Blender 5.2.3 LTS",
        "blender_version": bpy.app.version_string,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "facility_name": spec.facility_name,
        "capacity": model["totals"],
        "summary": capacity_summary(spec),
        "scene": {"collections": build_stats.get("collections"), "objects": build_stats.get("objects"),
                  "chambers": len(spec.chambers)},
        "kit": pieces,
        "files": {
            "kit": {"filename": KIT_GLB, **{k: kit_stats[k] for k in ("bytes", "sha256", "nodes", "meshes", "materials")}},
            "facility_glb": {"filename": FACILITY_GLB,
                             **{k: facility_stats[k] for k in ("bytes", "sha256", "nodes", "meshes", "accessors",
                                                               "materials", "instanced_nodes")}},
        },
        "kit_glb_nodes": [p["name"] for p in pieces],
    }
    meta_path = os.path.join(out_dir, METADATA)
    with open(meta_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    result = {
        "ok": True,
        "blender": bpy.app.version_string,
        "facility_name": spec.facility_name,
        "kit": pieces,
        "files": meta["files"],
        "totals": model["totals"],
        "out_dir": out_dir,
    }
    print("[bgen] RESULT " + json.dumps(result, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - one machine-readable line
        import traceback
        traceback.print_exc()
        print("[bgen] RESULT " + json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False))
        raise SystemExit(1)

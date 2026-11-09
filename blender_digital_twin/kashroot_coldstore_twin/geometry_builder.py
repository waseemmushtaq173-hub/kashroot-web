"""Procedural geometry for the KashRoot cold-store twin (Phase 6, bpy-only).

Runs **inside Blender only** and builds the facility in *engine
coordinates* (X = building length, Y = depth toward the doors at -Y,
Z up) straight from the capacity engine's spatial model — the same data
the headless GLB exporter bakes into nodes, so a Blender render matches
the web twin cell for cell.

Public API::

    build_facility(spec)  -> stats dict (collections / objects / produce)
    clear_scene()         -> remove everything this builder created

Collections created under the root collection ``KRT_Twin``:

* ``KRT_Site``  floor slab, expansion joints, exterior walls, columns,
                roof slabs + ridge + gutters, interior partitions
* ``KRT_CHxx``  per chamber: CA door assembly, evaporators + fans,
                LED strips + area lights, pipes, pallet racking,
                crates (one shared mesh; booked crates get an
                object-level amber tint) and the apple layer of every
                booked crate
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:  # Blender is optional; module is *used* only inside Blender.
    import bpy  # type: ignore
except Exception:  # pragma: no cover - executed only when bpy is missing
    bpy = None

from . import produce_generator
from .capacity_engine import APPLE_DIAMETER_M, APPLES_PER_CRATE_TOP, build_model
from .materials_pbr import PALETTE, build_bpy_material
from .properties import TwinSpec

ROOT_COLL = "KRT_Twin"
UNIT_CUBE = "krt.unitcube"


# ---------------------------------------------------------------------- #
# Datablock plumbing                                                      #
# ---------------------------------------------------------------------- #
def _require_bpy() -> Any:
    if bpy is None:  # pragma: no cover - Blender only
        raise RuntimeError("geometry_builder must run inside Blender (import bpy failed).")
    return bpy


def _materials() -> Dict[str, Any]:  # pragma: no cover - bpy only
    """Build (or reuse) the whole PBR palette once."""
    cache: Dict[str, Any] = {}
    for key in sorted(PALETTE):
        build_bpy_material(key, PALETTE[key], bpy, cache)  # type: ignore[arg-type]
    return cache


def _unit_cube() -> Any:  # pragma: no cover - bpy only
    me = bpy.data.meshes.get(UNIT_CUBE)
    if me is None:
        me = bpy.data.meshes.new(UNIT_CUBE)
        verts = [(-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5),
                 (-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5)]
        faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (0, 4, 7, 3), (1, 2, 6, 5)]
        me.from_pydata(verts, [], faces)
        me.update()
    return me


def _add_obj(name: str, mesh: Any, coll: Any, loc: Sequence[float] = (0.0, 0.0, 0.0),
             rot: Sequence[float] = (0.0, 0.0, 0.0), scale: Sequence[float] = (1.0, 1.0, 1.0),
             mat: str = "", mats: Optional[Dict[str, Any]] = None,
             props: Optional[Dict[str, Any]] = None) -> Any:  # pragma: no cover - bpy only
    """Object from a mesh datablock; `mat` overrides (link=OBJECT) the first slot."""
    obj = bpy.data.objects.new(name, mesh)
    obj.location = tuple(loc)
    obj.rotation_euler = tuple(rot)
    obj.scale = tuple(scale)
    if mat and mats and obj.material_slots:
        slot = obj.material_slots[0]
        slot.link = "OBJECT"
        slot.material = mats[mat]
    for (k, v) in (props or {}).items():
        obj[k] = v
    coll.objects.link(obj)
    return obj


def _box(name: str, size: Sequence[float], center: Sequence[float], coll: Any,
         mat: str, mats: Dict[str, Any], props: Optional[Dict[str, Any]] = None) -> Any:  # pragma: no cover - bpy only
    """One axis-aligned box, scaled from the shared unit cube."""
    return _add_obj(name, _unit_cube(), coll, loc=center, scale=tuple(size), mat=mat, mats=mats, props=props)


def _cyl(name: str, radius: float, length: float, coll: Any, mat: str, mats: Dict[str, Any],
         segs: int = 12, axis: str = "Z", loc: Sequence[float] = (0.0, 0.0, 0.0),
         props: Optional[Dict[str, Any]] = None) -> Any:  # pragma: no cover - bpy only
    """Capped cylinder whose local axis is the given engine axis ('X'|'Y'|'Z')."""
    assert axis in ("X", "Y", "Z")
    key = f"krt.cyl.{round(radius, 4)}.{round(length, 3)}.{segs}.{axis}"
    me = bpy.data.meshes.get(key)
    if me is None:
        verts: List[Tuple[float, float, float]] = []

        def pt(s: int, half: float) -> Tuple[float, float, float]:
            ph = 2 * math.pi * s / segs
            c, s2 = radius * math.cos(ph), radius * math.sin(ph)
            t = half * length / 2.0
            return {"X": (t, c, s2), "Y": (c, t, s2), "Z": (c, s2, t)}[axis]

        for half in (-1.0, 1.0):
            for s in range(segs):
                verts.append(pt(s, half))
        faces: List[Tuple[int, ...]] = []
        for s in range(segs):
            sn = (s + 1) % segs
            faces.append((s, segs + s, segs + sn, sn))
        for half, base in ((-1.0, 0), (1.0, segs)):
            c0 = len(verts)
            cap_center = {"X": (half * length / 2.0, 0.0, 0.0),
                          "Y": (0.0, half * length / 2.0, 0.0),
                          "Z": (0.0, 0.0, half * length / 2.0)}[axis]
            verts.append(cap_center)
            for s in range(segs):
                a3, b3 = base + s, base + (s + 1) % segs
                faces.append((c0, a3, b3) if half < 0 else (c0, b3, a3))
        me = produce_generator.mesh_from_faces(key, verts, faces) or bpy.data.meshes.new(key)
    return _add_obj(name, me, coll, loc=loc, mat=mat, mats=mats, props=props)


def _wedge(name: str, x0: float, x1: float, y0: float, y1: float, z_eave: float,
           z_ridge: float, thick: float, coll: Any, mat: str, mats: Dict[str, Any]) -> Any:  # pragma: no cover - bpy only
    """Roof half: a sloped slab from eave (y0) up to ridge (y1), with thickness."""
    verts = [
        (x0, y0, z_eave), (x1, y0, z_eave), (x1, y1, z_ridge), (x0, y1, z_ridge),
        (x0, y0, z_eave - thick), (x1, y0, z_eave - thick), (x1, y1, z_ridge - thick), (x0, y1, z_ridge - thick),
    ]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (0, 4, 7, 3), (1, 2, 6, 5)]
    me = produce_generator.mesh_from_faces(f"krt.roofhalf.{round(x1 - x0, 2)}.{round(y1 - y0, 2)}", verts, faces)
    return _add_obj(name, me, coll, mat=mat, mats=mats, props={"krt_kind": "roof"})


def _clear_collection(coll: Any) -> None:  # pragma: no cover - bpy only
    for obj in list(coll.objects):
        coll.objects.unlink(obj)
        bpy.data.objects.remove(obj, do_unlink=True)
    for ch in list(coll.children):
        _clear_collection(ch)
        coll.children.unlink(ch)
        bpy.data.collections.remove(ch)


def clear_scene() -> None:  # pragma: no cover - bpy only
    """Remove every KRT_ collection / object this builder has created."""
    _require_bpy()
    root = bpy.data.collections.get(ROOT_COLL)
    if root is not None:
        _clear_collection(root)
        bpy.context.scene.collection.children.unlink(root)
        bpy.data.collections.remove(root)
    for probe in ("objects", "meshes", "lights", "materials"):
        bucket = getattr(bpy.data, probe, None)
        if bucket is None:
            continue
        for d in [d for d in bucket if str(getattr(d, "name", "")).startswith(("KRT_", "krt."))]:
            try:
                bucket.remove(d, do_unlink=True)
            except Exception:
                pass


# ---------------------------------------------------------------------- #
# Facility build                                                          #
# ---------------------------------------------------------------------- #
def build_facility(spec: TwinSpec, model: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:  # pragma: no cover - bpy only
    """Build the complete facility from the capacity engine's model."""
    _require_bpy()
    model = model or build_model(spec)
    mats = _materials()
    env = model["envelope"]
    interior, outer_min, outer_max = env["min"], env["outer_min"], env["outer_max"]
    b, p = spec.building, spec.panels
    t_ext = b.wall_thickness_m + 2 * b.insulation_thickness_m
    L, W, H = b.length_m, b.width_m, b.height_m

    root = _coll(ROOT_COLL)
    _clear_collection(root)
    site = _coll("KRT_Site", root)
    stats: Dict[str, Any] = {"collections": 2, "lights": 0}

    cx, cy = (outer_min[0] + outer_max[0]) / 2.0, (outer_min[1] + outer_max[1]) / 2.0
    wall_h = outer_max[2]

    # ---- floor slab + expansion joints ---- #
    _box("KRT_Floor", [L + 2 * t_ext, W + 2 * t_ext, p.slab_thickness_m],
         (cx, cy, (outer_min[2] + outer_max[2]) / 2.0), site, "concrete_floor", mats, {"krt_kind": "floor"})
    for i, jx in enumerate(env.get("joints_x", [])):
        _box(f"KRT_Joint_{i}", [p.expansion_joint_width_m, W, 0.012],
             (jx, cy, outer_max[2] + 0.006), site, "concrete_joint", mats)

    # ---- exterior walls (segments + door headers on the front) ---- #
    fy = outer_min[1] + t_ext / 2.0
    gaps: List[Tuple[str, float, float, float]] = []
    for tag in ("entrance", "exit"):
        e = env[tag]
        gaps.append((tag, max(outer_min[0], e["x"] - e["width"] / 2.0),
                     min(outer_max[0], e["x"] + e["width"] / 2.0), e["height"]))
    gaps.sort(key=lambda g: g[1])
    spans: List[Tuple[float, float]] = []
    cur = interior[0]
    for (tag, gx0, gx1, _dh) in gaps:
        if gx0 > cur + 1e-6:
            spans.append((cur, gx0))
        cur = gx1
    if interior[3] > cur + 1e-6:
        spans.append((cur, interior[3]))
    for i, (sx0, sx1) in enumerate(spans):
        _box(f"KRT_Wall_Front_{i}", [sx1 - sx0, t_ext, wall_h], ((sx0 + sx1) / 2.0, fy, wall_h / 2.0),
             site, "puf_panel_out", mats, {"krt_kind": "wall"})
    for (tag, gx0, gx1, dh) in gaps:
        _box(f"KRT_Wall_{tag}_header", [gx1 - gx0, t_ext, max(0.02, wall_h - dh)],
             ((gx0 + gx1) / 2.0, fy, (dh + wall_h) / 2.0), site, "puf_panel_out", mats, {"krt_kind": "wall_header"})
    _box("KRT_Wall_Back", [L + 2 * t_ext, t_ext, wall_h], (cx, outer_max[1] - t_ext / 2.0, wall_h / 2.0),
         site, "puf_panel_out", mats, {"krt_kind": "wall"})
    for side, sx in (("West", outer_min[0]), ("East", outer_max[0])):
        _box(f"KRT_Wall_{side}", [t_ext, W + 2 * t_ext, wall_h],
             (sx + (t_ext / 2.0 if side == "West" else -t_ext / 2.0), cy, wall_h / 2.0),
             site, "puf_panel_out", mats, {"krt_kind": "wall"})

    # ---- corridor columns ---- #
    for i, col in enumerate(env.get("columns", [])):
        mid_y = (col["y1"] + col["y2"]) / 2.0
        _box(f"KRT_Column_{i}", [col["size"], col["size"], wall_h], (col["x"], mid_y, wall_h / 2.0),
             site, "galvanised_steel", mats, {"krt_kind": "column"})
        _box(f"KRT_Column_{i}_foot", [col["size"] * 1.7, col["size"] * 1.7, 0.06], (col["x"], mid_y, 0.03),
             site, "galvanised_steel", mats)

    # ---- pitched roof + ridge + gutters ---- #
    rise = (outer_max[1] - outer_min[1]) / 2.0 * env["roof"]["pitch_ratio"]
    y_mid = (outer_min[1] + outer_max[1]) / 2.0
    for side, (ya, yb) in (("Front", (outer_min[1] - 0.25, y_mid)), ("Back", (outer_max[1] + 0.25, y_mid))):
        _wedge(f"KRT_Roof_{side}", outer_min[0] - 0.25, outer_max[0] + 0.25, ya, yb,
               wall_h, wall_h + rise, 0.09, site, "roof_steel", mats)
    _box("KRT_Ridge", [L + 2 * t_ext, 0.26, 0.10], (cx, y_mid, wall_h + rise + 0.06),
         site, "roof_steel", mats, {"krt_kind": "roof"})
    for gy in (outer_min[1] - 0.37, outer_max[1] + 0.37):
        _box("KRT_Gutter_%.1f" % gy, [L + 2 * t_ext, 0.14, 0.12], (cx, gy, wall_h - 0.06),
             site, "galvanised_steel", mats, {"krt_kind": "gutter"})

    # ---- corridor + inter-chamber partitions ---- #
    t_part = p.partition_thickness_m
    cz0, cz1 = env["chamber_zone"]
    z_l, z_h = interior[2], interior[5]
    _box("KRT_Partition_Corridor", [interior[3] - interior[0], t_part, z_h - z_l],
         (cx, cz0 - t_part / 2.0, (z_l + z_h) / 2.0), site, "partition_panel", mats, {"krt_kind": "partition"})
    rects = [ch["rect"] for ch in model["chambers"]]
    for i in range(len(rects) - 1):
        px = (rects[i][3] + rects[i + 1][0]) / 2.0
        _box(f"KRT_Partition_{i}", [t_part, cz1 - cz0, z_h - z_l],
             (px, (cz0 + cz1) / 2.0, (z_l + z_h) / 2.0), site, "partition_panel", mats, {"krt_kind": "partition"})

    # ---- chambers ---- #
    for ch in model["chambers"]:
        chcoll = _coll(f"KRT_{ch['id']}", root)
        stats["collections"] += 1
        _build_chamber(chcoll, ch, model["_objects"].get(ch["id"]), spec, mats, stats)  # type: ignore[index]

    bpy.context.view_layer.update()
    stats["objects"] = sum(1 for _ in root.all_objects)
    return stats


def _build_chamber(chcoll: Any, ch: Dict[str, Any], cham: Optional[Any], spec: TwinSpec,
                   mats: Dict[str, Any], stats: Dict[str, Any]) -> None:  # pragma: no cover - bpy only
    """One refrigerated chamber: door, machinery, racks, crates, produce."""
    cid = ch["id"]
    cfg = next((c for c in spec.chambers if c.chamber_id == cid), spec.chambers[0])
    rack, crate = cfg.rack, cfg.crate
    rect = ch["rect"]

    # ---- door assembly (slab, rail, gasket, porthole, handle) ---- #
    door = ch["door"]
    d_w, d_h = door["width"], door["height"]
    slab_cx, slab_cy = door["x0"] + d_w / 2.0, rect[1] - 0.05
    sill = rect[2]
    _box(f"KRT_Door_{cid}_Slab", [d_w + 0.24, 0.1, d_h], (slab_cx, slab_cy, sill + d_h / 2.0),
         chcoll, "ca_door", mats, {"krt_kind": "ca_door", "chamber_id": cid})
    _box(f"KRT_Door_{cid}_Rail", [d_w * 2.4 + 0.5, 0.14, 0.14], (slab_cx + d_w * 0.6, slab_cy, sill + d_h + 0.1),
         chcoll, "door_track", mats)
    _box(f"KRT_Door_{cid}_Gasket", [d_w + 0.2, 0.13, 0.06], (slab_cx, slab_cy, sill + d_h - 0.05),
         chcoll, "gasket", mats)
    _cyl(f"KRT_Door_{cid}_Port", 0.14, 0.02, chcoll, "glass_port", mats, 16, axis="Y",
         loc=(slab_cx, slab_cy - 0.07, sill + d_h / 2.0),
         props={"krt_kind": "viewing_port", "chamber_id": cid})
    _box(f"KRT_Door_{cid}_Handle", [0.05, 0.06, 0.64], (slab_cx + d_w * 0.6, slab_cy - 0.08, sill + 1.1),
         chcoll, "door_track", mats)

    # ---- evaporators + fans ---- #
    for i, ev in enumerate(ch["evaporators"]):
        _box(f"KRT_Evap_{cid}_{i + 1}", ev["size"], tuple(ev["center"]),
             chcoll, "evap_body", mats, {"krt_kind": "evap", "chamber_id": cid})
        for fi in range(3):
            _cyl(f"KRT_Fan_{cid}_{i + 1}_{fi}", ev["size"][2] * 0.26, 0.02, chcoll, "fan_dark", mats, 12, axis="Y",
                 loc=(ev["center"][0] + (fi - 1) * ev["size"][0] * 0.26,
                      ev["center"][1] - ev["size"][1] / 2.0 - 0.02, ev["center"][2]),
                 props={"krt_kind": "fan", "chamber_id": cid})

    # ---- LED strips (emissive boxes) + area lights ---- #
    for i, li in enumerate(ch["lights"]):
        _box(f"KRT_LED_{cid}_{i}", li["size"], tuple(li["center"]),
             chcoll, "led_light", mats, {"krt_kind": "light", "chamber_id": cid})
        light = bpy.data.lights.new(f"KRT_Lamp_{cid}_{i}", "AREA")
        light.shape = "RECTANGLE"
        light.size = max(0.05, float(li["size"][0]))
        light.size_y = max(0.05, float(li["size"][1]))
        light.energy = 48.0  # visual fixture, not capacity data
        light.color = (1.0, 0.98, 0.92)
        lamp = bpy.data.objects.new(light.name, light)
        lamp.location = (li["center"][0], li["center"][1], li["center"][2] - 0.02)
        lamp["krt_kind"] = "light"
        lamp["chamber_id"] = cid
        chcoll.objects.link(lamp)
        stats["lights"] += 1

    # ---- refrigerant pipes (header + evaporator drops) ---- #
    for i, pp in enumerate(ch["pipes"]):
        a, bpt = pp["from"], pp["to"]
        dx, dy = abs(bpt[0] - a[0]), abs(bpt[1] - a[1])
        length = round(max(dx, dy), 3)
        if length < 0.01:
            continue
        _cyl(f"KRT_Pipe_{cid}_{i}", pp["radius"], length, chcoll, "pipe_steel", mats, 8,
             axis="X" if dx >= dy else "Y",
             loc=((a[0] + bpt[0]) / 2.0, (a[1] + bpt[1]) / 2.0, a[2]),
             props={"krt_kind": "pipe", "chamber_id": cid})

    # ---- pallet racking ---- #
    levels, upright_w = ch["levels_per_chamber"], rack.upright_width_m
    payload_pitch = crate.crate_height_m + rack.level_clearance_m
    beam_h = 0.05
    for rk in ch["racks"]:
        bay_pitch = rack.rack_length_m / max(1, rk["bays"])
        for bi in range(rk["bays"]):
            bx0 = rk["origin"][0] + bi * bay_pitch
            by0, fz0 = rk["origin"][1], rk["origin"][2]
            for (ux, uy) in ((bx0, by0), (bx0, by0 + rack.rack_width_m - upright_w),
                             (bx0 + bay_pitch - upright_w, by0),
                             (bx0 + bay_pitch - upright_w, by0 + rack.rack_width_m - upright_w)):
                _box(f"KRT_R{rk['index']}_B{bi + 1}_U{round(ux, 2)}_{round(uy, 2)}",
                     [upright_w, upright_w, rack.rack_height_m],
                     (ux + upright_w / 2.0, uy + upright_w / 2.0, fz0 + rack.rack_height_m / 2.0),
                     chcoll, "rack_steel", mats,
                     {"krt_kind": "rack_upright", "rack_row": rk["index"], "bay": bi + 1})
            step = (rack.rack_width_m - 2 * upright_w) / 6.0
            for lv in range(1, levels + 1):
                base_z = rect[2] + (lv - 1) * payload_pitch + spec.panels.crate_stack_slack_m
                deck_z = base_z - beam_h / 2.0
                for c in range(7):
                    _box(f"KRT_B_R{rk['index']}_B{bi + 1}_L{lv}_C{c}", [bay_pitch, 0.012, beam_h],
                         (bx0 + bay_pitch / 2.0, by0 + upright_w + c * step, deck_z),
                         chcoll, "rack_steel", mats,
                         {"krt_kind": "rack_beam", "rack_row": rk["index"], "level": lv})
                for c in range(11):
                    _box(f"KRT_W_R{rk['index']}_B{bi + 1}_L{lv}_W{c}",
                         [0.012, rack.rack_width_m - 2 * upright_w, beam_h],
                         (bx0 + (c + 1) * bay_pitch / 12.0, by0 + rack.rack_width_m / 2.0, deck_z),
                         chcoll, "wire_mesh", mats,
                         {"krt_kind": "deck_wire", "rack_row": rk["index"], "level": lv})

    # ---- crates + booked produce ---- #
    cells = list(cham.crates) if cham is not None else []
    crate_mat_key = "wood_bin" if crate.material_type == "WOODEN_BIN" else "hdpe_red"
    crate_me = produce_generator.crate_mesh(
        f"krt.crate.{cid}", crate.crate_length_m, crate.crate_width_m, crate.crate_height_m)
    if crate_me is not None:
        crate_me.materials.clear()
        crate_me.materials.append(mats[crate_mat_key])
    for cell in cells:
        booked = cell.booking_status == "booked"
        _add_obj(
            f"KRT_Crate_{cell.cell_id}", crate_me, chcoll,
            loc=(cell.pos[0], cell.pos[1], cell.pos[2] + crate.crate_height_m / 2.0),
            mat="hdpe_amber" if (booked and crate_mat_key == "hdpe_red") else crate_mat_key,
            mats=mats,
            props={
                "krt_kind": "crate", "krt_cell_id": cell.cell_id, "krt_chamber": cid,
                "krt_level": cell.level, "krt_row": cell.row, "krt_subrow": cell.subrow,
                "krt_col": cell.col, "krt_grower": cell.grower_id or "",
                "krt_status": cell.booking_status, "krt_product": cell.product_type or "",
                "krt_kg_cap": cell.weight_capacity_kg, "krt_kg_occupied": cell.occupied_weight_kg,
                "krt_kg_available": cell.available_weight_kg,
            })
    if not any(c.booking_status == "booked" for c in cells):
        return
    apple_me = produce_generator.apple_cluster_mesh(
        f"krt.apples.{cid}",
        APPLES_PER_CRATE_TOP[0], APPLES_PER_CRATE_TOP[1],
        crate.crate_length_m, crate.crate_width_m, APPLE_DIAMETER_M)
    if apple_me is None:
        return
    apple_me.materials.clear()
    for key in ("apple_cosse_red", "apple_gold", "apple_stem"):
        apple_me.materials.append(mats[key])
    for cell in cells:
        if cell.booking_status != "booked":
            continue
        _add_obj(
            f"KRT_Apples_{cell.cell_id}", apple_me, chcoll,
            loc=(cell.pos[0], cell.pos[1], cell.pos[2] + crate.crate_height_m + APPLE_DIAMETER_M * 0.08),
            props={"krt_kind": "apples", "krt_chamber": cid, "krt_grower": cell.grower_id or ""})

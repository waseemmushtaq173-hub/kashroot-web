"""Produce & crate geometry for the KashRoot twin (Phase 7, bpy-only).

The headless GLB exporter bakes the very same shapes into glTF buffers
(``glb_exporter.crate_mesh`` / apple ``body_bases`` + ``apple_off``); this
module rebuilds them as real Blender meshes natively in **engine
coordinates** (X = rack length, Y = rack depth, Z up) — no transforms.

* ``crate_boxes``  — the ventilated HDPE crate as merged boxes
* ``apple_body``   — one apple: banded sphere, calyx dimple, pole cap,
  optional stem prism (all constants identical to the GLB exporter)
* ``apple_cluster``— the crate-top layer grid (4 x 3 by default) split
  into two checkerboard shades + stems, so materials match `material_index`
* ``mesh_from_faces`` — tiny helper producing bpy mesh datablocks

Every function works without touching the scene; the geometry builder
links the produced datablocks into collections.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:  # Blender is optional; module is *used* only inside Blender.
    import bpy  # type: ignore
except Exception:  # pragma: no cover - executed only when bpy is missing
    bpy = None

Tri = Tuple[float, float, float]
Box = List[float]           # x0, y0, z0, sx, sy, sz  (engine coords)


# ---------------------------------------------------------------------- #
# Crate (same proportions as glb_exporter.crate_mesh)                      #
# ---------------------------------------------------------------------- #
def crate_boxes(L: float, W: float, H: float, wall: float = 0.008) -> List[Box]:
    """Ventilated HDPE crate centred on its origin: x spans L, y spans W
    (rack depth), z spans H (up)."""
    boxes: List[Box] = []

    def bx(x0: float, y0: float, z0: float, sx: float, sy: float, sz: float) -> None:
        boxes.append([x0 - L / 2.0, y0 - W / 2.0, z0 - H / 2.0, sx, sy, sz])

    post_w = 0.05
    for (px, py) in ((0.0, 0.0), (L - post_w, 0.0), (0.0, W - post_w), (L - post_w, W - post_w)):
        bx(px, py, 0.0, post_w, post_w, H)
    long_span = L - 2 * post_w
    slots, strip, margin = 5, 0.03, 0.055
    slot_w = (long_span - 2 * margin - (slots + 1) * strip) / slots
    rail_h = H * 0.16
    slot_h = H - 2 * rail_h
    for yv in (0.0, W - wall):
        bx(post_w, yv, 0.0, long_span, wall, rail_h)
        bx(post_w, yv, H - rail_h, long_span, wall, rail_h)
        x_edge = post_w + margin
        for s in range(slots):
            bx(x_edge, yv, rail_h, slot_w, wall, slot_h)
            x_edge += slot_w + strip
            if s < slots - 1:
                bx(x_edge, yv, rail_h, strip, wall, slot_h)
                x_edge += strip
    short_span = W - 2 * post_w
    slotss, strips, margin2 = 2, 0.03, 0.04
    slot_w2 = (short_span - 2 * margin2 - (slotss + 1) * strips) / slotss
    for xv in (0.0, L - wall):
        bx(xv, post_w, 0.0, wall, short_span, rail_h)
        bx(xv, post_w, H - rail_h, wall, short_span, rail_h)
        y_edge = post_w + margin2
        for s in range(slotss):
            bx(xv, y_edge, rail_h, wall, slot_w2, slot_h)
            y_edge += slot_w2 + strips
            if s < slotss - 1:
                bx(xv, y_edge, rail_h, wall, strips, slot_h)
                y_edge += strips
    base = 0.014
    bx(post_w, 0.0, 0.0, L - 2 * post_w, wall, base)
    bx(post_w, W - wall, 0.0, L - 2 * post_w, wall, base)
    n_strips = 5
    span = (L - 2 * post_w) / (2 * n_strips + 1)
    for s in range(n_strips):
        bx(post_w + (1 + 2 * s) * span, wall, 0.0, span, W - 2 * wall, base)
    return boxes


def crate_mesh(name: str, L: float, W: float, H: float, wall: float = 0.008) -> Optional[Any]:  # pragma: no cover - bpy only
    """bpy mesh datablock of the ventilated crate (engine coords)."""
    boxes = crate_boxes(L, W, H, wall)
    verts: List[Tri] = []
    faces: List[Tuple[int, int, int, int]] = []

    def add_box(b: Sequence[float]) -> None:
        x0, y0, z0, sx, sy, sz = b
        c = len(verts)
        cx, cy, cz = x0 + sx / 2.0, y0 + sy / 2.0, z0 + sz / 2.0
        sx, sy, sz = sx / 2.0, sy / 2.0, sz / 2.0
        order = ((-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz))
        for (dx, dy, dz) in order:
            verts.append((cx + dx, cy + dy, cz + dz))
        faces.extend([(c + 0, c + 3, c + 2, c + 1), (c + 4, c + 5, c + 6, c + 7), (c + 0, c + 1, c + 5, c + 4),
                      (c + 2, c + 3, c + 7, c + 6), (c + 0, c + 4, c + 7, c + 3), (c + 1, c + 2, c + 6, c + 5)])

    for b in boxes:
        add_box(b)
    return mesh_from_faces(name, verts, [tuple(f) for f in faces])


# ---------------------------------------------------------------------- #
# Apple + crate-top cluster (same math as the GLB exporter)                #
# ---------------------------------------------------------------------- #
def apple_body(segs: int, bands: int, R: float, dimple: bool) -> Tuple[List[Tri], List[Tuple[int, int, int]]]:
    """One apple: sphere bands with a calyx dimple and a pole cap.
    Local vertical axis +Z (engine 'up'); returns (verts, triangle faces)."""
    verts: List[Tri] = []
    idx: List[Tuple[int, int, int]] = []
    rings: List[List[Tri]] = []
    for bnd in range(1, bands + 1):
        th = math.pi * bnd / bands
        f = 1.0
        if dimple and th < 0.55:
            f -= 0.5 * (1.0 - th / 0.55)
        if th > 2.6:
            f *= 0.9
        ring = []
        for s in range(segs):
            ph = 2 * math.pi * s / segs
            rr = R * math.sin(th) * f
            zv = R * math.cos(th)
            ring.append((rr * math.cos(ph), rr * math.sin(ph), zv))
        rings.append(ring)
        verts += ring
    for r_i in range(len(rings) - 1):
        for s in range(segs):
            a = segs * r_i + s
            b2 = segs * r_i + (s + 1) % segs
            c2 = segs * (r_i + 1) + s
            d2 = segs * (r_i + 1) + (s + 1) % segs
            idx += [(a, b2, d2), (a, d2, c2)]
    cap_c = len(verts)
    verts.append((0.0, 0.0, R * (0.80 if dimple else 0.97)))
    for s in range(segs):
        idx.append((cap_c, (s + 1) % segs, s))
    return verts, idx


def apple_cluster(gx_n: int, gz_n: int, crate_l: float, crate_w: float, R: float) -> List[Tuple[int, Any, List[Tri], List[Tuple[int, int, int]]]]:
    """The checkerboard apple layer of one booked crate's top; returns
    [(material_index, shade_name, verts, faces), ...] so a single bpy mesh
    can carry all three materials (red, gold, stems).

    Local frame identical to the GLB cluster: origin sits right above the
    crate top centre; x spans the crate length, y the crate depth.
    """
    step_l = (crate_l - 0.1) / gx_n
    step_w = (crate_w - 0.1) / gz_n

    def apple_off(gx: int, gz: int) -> Tuple[float, float]:
        return -crate_l / 2.0 + 0.05 + (gx + 0.5) * step_l, -crate_w / 2.0 + 0.05 + (gz + 0.5) * step_w

    caps = {True: apple_body(16, 9, R, True), False: apple_body(16, 9, R, False)}
    out: List[Tuple[int, Any, List[Tri], List[Tuple[int, int, int]]]] = []
    for shade in (0, 1):
        pts: List[Tri] = []
        idx: List[Tuple[int, int, int]] = []
        offset = 0
        for gx in range(gx_n):
            for gz in range(gz_n):
                if (gx + gz) % 2 != shade:
                    continue
                vv, ii = caps[shade == 0]
                ox, oy = apple_off(gx, gz)
                pts += [(v[0] + ox, v[1] + oy, v[2]) for v in vv]
                idx += [(a + offset, b2 + offset, c2 + offset) for (a, b2, c2) in ii]
                offset += len(vv)
        out.append((shade, {0: "red", 1: "gold"}[shade], pts, idx))
    # stems (one short prism per apple, engine +Z)
    pts: List[Tri] = []
    idx: List[Tuple[int, int, int]] = []
    rr, ttl = 0.004, 0.05
    for gx in range(gx_n):
        for gz in range(gz_n):
            ox, oy = apple_off(gx, gz)
            cx, cy = ox + 0.006, oy + 0.004
            z0 = R - 0.008
            cnt = len(pts)
            for zv in (z0, z0 + ttl):
                for s in range(6):
                    ph = 2 * math.pi * s / 6
                    pts.append((cx + rr * math.cos(ph), cy + rr * math.sin(ph), zv))
            for s in range(6):
                a, b2 = cnt + s, cnt + (s + 1) % 6
                c2, d2 = cnt + 6 + s, cnt + 6 + (s + 1) % 6
                idx += [(a, b2, d2), (a, d2, c2)]
    out.append((2, "stem", pts, idx))
    return out


def apple_cluster_mesh(name: str, gx_n: int, gz_n: int, crate_l: float, crate_w: float, apple_diameter: float) -> Optional[Any]:  # pragma: no cover - bpy only
    """One bpy mesh holding the whole booked-crate apple layer with three
    material slots: 0 = red skin, 1 = golden skin, 2 = stems."""
    R = apple_diameter * 0.5 * 1.08
    parts = apple_cluster(gx_n, gz_n, crate_l, crate_w, R)
    verts: List[Tri] = []
    faces: List[Tuple[int, int, int]] = []
    slot_faces: List[List[int]] = [[] for _ in range(3)]  # material slots: red / gold / stems
    for slot, _shade, pts, idx in parts:
        offset = len(verts)
        verts += pts
        for (a, b2, c2) in idx:
            slot_faces[slot].append(len(faces))
            faces.append((a + offset, b2 + offset, c2 + offset))
    me = mesh_from_faces(name, verts, faces)
    if me is not None:
        for fi, face in enumerate(me.polygons):
            for slot, idxs in enumerate(slot_faces):
                if fi in idxs:
                    face.material_index = slot
                    break
    return me


# ---------------------------------------------------------------------- #
# Mesh plumbing                                                           #
# ---------------------------------------------------------------------- #
def mesh_from_faces(name: str, verts: Sequence[Sequence[float]], faces: Sequence[Sequence[int]]) -> Optional[Any]:  # pragma: no cover - bpy only
    """bpy mesh datablock from raw verts/faces (normals recalculated outwards)."""
    if bpy is None:
        return None
    me = bpy.data.meshes.get(name)
    if me is not None:
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    try:
        import bmesh as _bmesh

        bm = _bmesh.new()
        bm.from_mesh(me)
        _bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    except Exception:
        pass
    me.update()
    for poly in me.polygons:
        poly.use_smooth = True
    return me

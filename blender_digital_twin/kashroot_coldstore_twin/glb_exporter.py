"""Headless glTF-2.0 (.glb) exporter + capacity metadata writer (Phase 9).

Writes a **real glTF 2.0 binary** from the layout model of
``capacity_engine.build_model`` — no Blender required, stdlib only.

Coordinates: the engine works Z-up (X = long side of the building, Y =
depth with the doors facing -Y, Z = up). The GLB orbs glTF's Y-up, so
every position is mapped once, centrally: ``(x, y, z) -> (x, z, -y)``
(right-handed, handedness preserved). All mesh geometry (crates, rack
bays, apple clusters, fan discs, sloped roof slabs) is authored directly
in glTF axes, so nothing needs per-vertex conversion at export time.

Highlights:

  * instanced storage via ``EXT_mesh_gpu_instancing``: every chamber's
    crates are one mesh + one node with a TRANSLATION accessor, so even
    ~9,000 crates render as a handful of draw calls in the web viewer;
  * named hierarchy per contract: ``Building`` > ``Chamber_CH01`` >
    ``Floor_L1`` > rack bays, plus the instanced ``Crates_CH01`` pallet
    layer and ``Apples_CH01`` produce clusters on booked crates;
  * ``extras`` on nodes (the web equivalent of ``obj["crate_id"]``
    Blender custom properties) carry per-instance metadata — instance id
    i of ``Crates_<CH>`` is engine cell i, so the viewer resolves any
    crate to chamber/level/row/column/grower with pure arithmetic;
  * PBR materials from ``materials_pbr.PALETTE`` as
    ``pbrMetallicRoughness`` structures with names ``krt.<key>``.

``verify_glb`` re-parses the binary afterwards so the pipeline can never
publish a broken asset.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import struct
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .capacity_engine import APPLE_DIAMETER_M, APPLES_PER_CRATE_TOP, build_model
from .materials_pbr import PALETTE, crate_material, gltf_factors
from .properties import TwinSpec

MATERIALS_ORDER = [
    "galvanised_steel", "rack_steel", "wire_mesh", "puf_panel_out", "puf_panel_in", "partition_panel",
    "concrete_floor", "concrete_joint", "roof_steel", "ca_door", "door_track", "gasket", "glass_port",
    "evap_body", "fan_dark", "pipe_steel", "led_light", "hdpe_red", "hdpe_amber", "hdpe_green",
    "wood_bin", "apple_cosse_red", "apple_gold", "apple_stem",
    "safety_yellow", "rubber_black", "corridor_marking",
]

_CHUNK_JSON = b"JSON"
_CHUNK_BIN = b"BIN\x00"


def G3(x: float, y: float, z: float) -> List[float]:
    """Engine coords (Z-up) -> glTF coords (Y-up): the one mapping."""
    return [x, z, -y]


def GDIR(x: float, y: float, z: float) -> List[float]:
    """Direction vector through the same mapping."""
    return [x, z, -y]


def GBOX(center_m: Sequence[float], size_m: Sequence[float]) -> Tuple[List[float], List[float]]:
    """Axis-aligned box (centre, size) in engine coords -> glTF (centre,size)."""
    c = G3(center_m[0], center_m[1], center_m[2])
    s = list(size_m)
    return ([c[0], c[1], c[2]] if False else c), [s[0], s[2], s[1]]


class Stage:
    """Accumulates glTF meshes, nodes and materials; serialises to GLB."""

    def __init__(self) -> None:
        self.g: Dict[str, Any] = {
            "asset": {"version": "2.0", "generator": "kashroot-coldstore-twin 1.0.0"},
            "scene": 0,
            "scenes": [{"nodes": [], "name": "KashRoot_Twin"}],
            "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": [],
            "extensionsUsed": ["EXT_mesh_gpu_instancing"],
            "extensionsRequired": [],
        }
        self.bin: bytearray = bytearray()
        self._mesh_cache: Dict[str, int] = {}
        self._acc_cache: Dict[str, int] = {}
        self._mats_done = False
        self._box_norm_counter = 0

    # ------------------------------------------------ materials --------- #
    def mat(self, name: str) -> int:
        if not self._mats_done:
            for key in MATERIALS_ORDER:
                entry = gltf_factors(PALETTE[key])
                entry["name"] = f"krt.{key}"
                entry["extras"] = {"krt": key, "description": PALETTE[key].get("desc", "")}
                self.g["materials"].append(entry)
            self._mats_done = True
        for i, m in enumerate(self.g["materials"]):
            if m["extras"]["krt"] == name:
                return i
        return 0

    # ------------------------------------------------ binary plumbing ---- #
    def _bufview(self, payload: bytes) -> int:
        pad = (4 - (len(self.bin) % 4)) % 4
        off = len(self.bin) + pad
        self.bin += b"\x00" * pad + payload
        self.g["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(payload)})
        return len(self.g["bufferViews"]) - 1

    def accessor(self, values: Sequence[Any], comp_type: int, type_: str, cache_key: Optional[str] = None) -> int:
        if cache_key and cache_key in self._acc_cache:
            return self._acc_cache[cache_key]
        comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[type_]
        flat: List[float] = []
        n = 0
        los: List[float] = [float("inf")] * comps
        his: List[float] = [float("-inf")] * comps
        for v in values:
            vals = [float(v)] if comps == 1 else [float(c) for c in v]
            while len(vals) < comps:
                vals.append(0.0)
            flat += vals
            for axis in range(comps):
                if vals[axis] < los[axis]:
                    los[axis] = vals[axis]
                if vals[axis] > his[axis]:
                    his[axis] = vals[axis]
            n += 1
        fmt = {5126: "<%df", 5125: "<%dI", 5123: "<%dH", 5121: "<%dB"}[comp_type]
        if comp_type == 5126:
            payload = struct.pack(fmt % len(flat), *flat) if flat else b""
        else:
            try:
                payload = struct.pack(fmt % len(flat), *[int(round(v)) for v in flat]) if flat else b""
            except struct.error:
                payload = struct.pack(fmt % len(flat), *[float(v) for v in flat])
        bv = self._bufview(payload)
        acc = {
            "bufferView": bv, "componentType": comp_type, "count": max(n, 1), "type": type_,
            "min": los if n else [0.0] * comps,
            "max": his if n else [0.0] * comps,
        }
        self.g["accessors"].append(acc)
        idx = len(self.g["accessors"]) - 1
        if cache_key:
            self._acc_cache[cache_key] = idx
        return idx

    # ------------------------------------------------ primitives --------- #
    def _bake_boxes(self, verts: List[Any], norms: List[Any], idx: List[int], boxes: Sequence[Sequence[float]]) -> None:
        """Axis-aligned boxes (x0,y0,z0,sx,sy,sz) with correct face normals."""
        corners8 = ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1))
        faces = (
            (0, 3, 2, 1, (0, 0, -1)), (4, 5, 6, 7, (0, 0, 1)),
            (0, 1, 5, 4, (0, -1, 0)), (2, 3, 7, 6, (0, 1, 0)),
            (0, 4, 7, 3, (-1, 0, 0)), (1, 2, 6, 5, (1, 0, 0)),
        )
        for (x0, y0, z0, sx, sy, sz) in boxes:
            cnt = len(verts)
            cx, cy, cz = x0 + sx / 2.0, y0 + sy / 2.0, z0 + sz / 2.0
            for (dx, dy, dz) in corners8:
                verts.append((cx + dx * sx / 2.0, cy + dy * sy / 2.0, cz + dz * sz / 2.0))
                norms.append((dx, dy, dz))
            for (a, b2, c2, d2, nrm) in faces:
                idx += [cnt + a, cnt + b2, cnt + c2, cnt + a, cnt + c2, cnt + d2]

    def _mesh_from(self, name: str, primitives: List[Dict[str, Any]]) -> int:
        self.g["meshes"].append({"name": name, "primitives": primitives})
        return len(self.g["meshes"]) - 1

    def mesh_boxes(self, name: str, boxes: Sequence[Sequence[float]], mat: str, anchor: str = "center") -> int:
        """Mesh of boxes; `anchor=center` recentres the bundle at origin."""
        key = f"boxes|{name}|{anchor}|{mat}"
        cached = self._mesh_cache.get(key)
        if cached is not None:
            return cached
        verts: List[Any] = []
        norms: List[Any] = []
        idx: List[int] = []
        self._bake_boxes(verts, norms, idx, boxes)
        if anchor == "center":
            minx = min(v[0] for v in verts)
            maxx = max(v[0] for v in verts)
            miny = min(v[1] for v in verts)
            maxy = max(v[1] for v in verts)
            minz = min(v[2] for v in verts)
            maxz = max(v[2] for v in verts)
            ox, oy, oz = -(minx + maxx) / 2.0, -(miny + maxy) / 2.0, -(minz + maxz) / 2.0
            verts = [(v[0] + ox, v[1] + oy, v[2] + oz) for v in verts]
        pos = self.accessor(verts, 5126, "VEC3")
        mid = self._mesh_from(name, [{
            "attributes": {"POSITION": pos, "NORMAL": self.accessor(norms, 5126, "VEC3")},
            "indices": self.accessor(idx, 5125, "SCALAR"),
            "material": self.mat(mat),
        }])
        self._mesh_cache[key] = mid
        return mid

    def add_box_node(self, name: str, center_m: Sequence[float], size_m: Sequence[float], mat: str, parent: int = -1, extras: Optional[Dict[str, Any]] = None) -> int:
        cg, sg = GBOX(center_m, size_m)
        mesh = self.mesh_boxes(f"Box_{round(sg[0],3)}_{round(sg[1],3)}_{round(sg[2],3)}_{mat}", [
            (0.0, 0.0, 0.0, sg[0], sg[1], sg[2]),
        ], mat, anchor="center")
        cg = G3(center_m[0], center_m[1], center_m[2])
        sg = [size_m[0], size_m[2], size_m[1]]
        return self.add_node(name, mesh=mesh, translation=[round(v, 4) for v in cg], parent=parent, extras=extras)

    # ------------------------------------------------ nodes -------------- #
    def add_node(self, name: str, mesh: Optional[int] = None, translation: Optional[Sequence[float]] = None, quat: Optional[Sequence[float]] = None, parent: int = -1, extras: Optional[Dict[str, Any]] = None, instance_attrs: Optional[Dict[str, Any]] = None) -> int:
        node: Dict[str, Any] = {"name": name}
        if mesh is not None:
            node["mesh"] = mesh
        if translation is not None:
            node["translation"] = [round(v, 4) for v in translation]
        if quat is not None:
            node["rotation"] = [round(v, 6) for v in quat]
        if extras:
            node["extras"] = extras
        if instance_attrs:
            node["extensions"] = {"EXT_mesh_gpu_instancing": {"attributes": instance_attrs}}
        self.g["nodes"].append(node)
        idx = len(self.g["nodes"]) - 1
        if parent >= 0:
            self.g["nodes"][parent].setdefault("children", []).append(idx)
        else:
            self.g["scenes"][0]["nodes"].append(idx)
        return idx

    # ------------------------------------------------ crate mesh --------- #
    def crate_mesh(self, name: str, L: float, W: float, H: float, wall: float, mat: str) -> int:
        """HDPE crate with ventilated slotted walls, authored glTF-native and
        centred at the node origin: x spans L, y spans H (up), z spans W."""
        key = f"crate|{round(L,3)}|{round(W,3)}|{round(H,3)}|{mat}"
        if key in self._mesh_cache:
            return self._mesh_cache[key]
        boxes: List[List[float]] = []
        rail_h = H * 0.16
        slot_h = H - 2 * rail_h
        post_w = 0.05

        def bx(x0: float, y0: float, z0: float, sx: float, sy: float, sz: float) -> None:
            # authored with y up, then recentred in add pass
            boxes.append([x0 - L / 2.0, y0 - H / 2.0, z0 - W / 2.0, sx, sy, sz])

        for (px, pz) in ((0.0, 0.0), (L - post_w, 0.0), (0.0, W - post_w), (L - post_w, W - post_w)):
            bx(px, 0.0, pz, post_w, H, post_w)
        long_span = L - 2 * post_w
        slots = 5
        strip = 0.03
        margin = 0.055
        slot_w = (long_span - 2 * margin - (slots + 1) * strip) / slots
        for zv in (0.0, W - wall):
            bx(post_w, 0.0, zv, long_span, rail_h, wall)
            bx(post_w, H - rail_h, zv, long_span, rail_h, wall)
            x_edge = post_w + margin
            for s in range(slots):
                bx(x_edge, rail_h, zv, slot_w, slot_h, wall)
                x_edge += slot_w + strip
                if s < slots - 1:
                    bx(x_edge, rail_h, zv, strip, slot_h, wall)
                    x_edge += strip
        short_span = W - 2 * post_w
        slotss = 2
        strips = 0.03
        margin2 = 0.04
        slot_w2 = (short_span - 2 * margin2 - (slotss + 1) * strips) / slotss
        for xv in (0.0, L - wall):
            bx(xv, 0.0, post_w, wall, rail_h, short_span)
            bx(xv, H - rail_h, post_w, wall, rail_h, short_span)
            z_edge = post_w + margin2
            for s in range(slotss):
                bx(xv, rail_h, z_edge, wall, slot_h, slot_w2)
                z_edge += slot_w2 + strips
                if s < slotss - 1:
                    bx(xv, rail_h, z_edge, wall, slot_h, strips)
                    z_edge += strips
        base = 0.014
        bx(post_w, 0.0, 0.0, L - 2 * post_w, base, wall)
        bx(post_w, 0.0, W - wall, L - 2 * post_w, base, wall)
        n_strips = 5
        span = (L - 2 * post_w) / (2 * n_strips + 1)
        for s in range(n_strips):
            bx(post_w + (1 + 2 * s) * span, 0.0, wall, span, base, W - 2 * wall)
        verts: List[Any] = []
        norms: List[Any] = []
        idx: List[int] = []
        self._bake_boxes(verts, norms, idx, boxes)
        pos = self.accessor(verts, 5126, "VEC3")
        mid = self._mesh_from(name, [{
            "attributes": {"POSITION": pos, "NORMAL": self.accessor(norms, 5126, "VEC3", f"cnorm{len(verts)}")},
            "indices": self.accessor(idx, 5125, "SCALAR"),
            "material": self.mat(mat),
        }])
        self._mesh_cache[key] = mid
        return mid

    # ------------------------------------------------ rack bay mesh ------ #
    def rack_bay_mesh(self, name: str, upright_w: float, depth: float, height: float, pitch: float, levels: int, level_pitch: float, mat_frames: str, mat_deck: str) -> int:
        """One bay of pallet racking: upright frames + load beams + mesh deck.
        Authored glTF-native and centred: x spans pitch, y spans height, z spans depth."""
        key = f"rackbay|{round(pitch,3)}|{round(depth,3)}|{round(height,3)}|{levels}|{round(level_pitch,3)}|{mat_frames}|{mat_deck}"
        if key in self._mesh_cache:
            return self._mesh_cache[key]
        fboxes: List[List[float]] = []
        dboxes: List[List[float]] = []

        def bf(x0: float, y0: float, z0: float, sx: float, sy: float, sz: float) -> None:
            fboxes.append([x0 - pitch / 2.0, y0, z0 - depth / 2.0, sx, sy, sz])

        def bd(x0: float, y0: float, z0: float, sx: float, sy: float, sz: float) -> None:
            dboxes.append([x0 - pitch / 2.0, y0, z0 - depth / 2.0, sx, sy, sz])

        beam = 0.05
        for xf in (0.0, pitch - upright_w):
            for zv in (0.0, depth - upright_w):
                bf(xf, 0.0, zv, upright_w, height, upright_w)
                for k in range(5):
                    bf(xf + upright_w * 0.22, height * (0.12 + 0.19 * k), zv - 0.008, upright_w * 0.56, height * 0.07, upright_w + 0.016)
        for lv in range(levels):
            yy = lv * level_pitch
            bf(0.0, yy, -0.02, pitch, beam, beam)
            bf(0.0, yy, depth - beam + 0.02, pitch, beam, beam)
        chords = 7
        step = (depth - 2 * upright_w) / (chords - 1)
        wires = 11
        wstep = pitch / (wires + 1)
        for lv in range(levels):
            y0 = lv * level_pitch
            for c in range(chords):
                bd(0.0, y0, upright_w + c * step - 0.006, pitch, beam, 0.012)
            for c in range(wires):
                bd((c + 1) * wstep - 0.006, y0, upright_w, 0.012, beam, depth - 2 * upright_w)
        verts: List[Any] = []
        norms: List[Any] = []
        idx: List[int] = []
        self._bake_boxes(verts, norms, idx, fboxes)
        fpos = self.accessor(verts, 5126, "VEC3")
        fnrm = self.accessor(norms, 5126, "VEC3")
        find_ = self.accessor(idx, 5125, "SCALAR")
        verts2: List[Any] = []
        norms2: List[Any] = []
        idx2: List[int] = []
        self._bake_boxes(verts2, norms2, idx2, dboxes)
        mid = self._mesh_from(name, [
            {"attributes": {"POSITION": fpos, "NORMAL": fnrm}, "indices": find_, "material": self.mat(mat_frames)},
            {"attributes": {"POSITION": self.accessor(verts2, 5126, "VEC3"), "NORMAL": self.accessor(norms2, 5126, "VEC3")}, "indices": self.accessor(idx2, 5125, "SCALAR"), "material": self.mat(mat_deck)},
        ])
        self._mesh_cache[key] = mid
        return mid

    # ------------------------------------------------ discs / pipes ------ #
    def cyl_mesh(self, name: str, radius: float, length: float, mat: str, segs: int = 10, axis: str = "+Y") -> int:
        """Cylinder along the chosen glTF axis, centred at the node origin."""
        key = f"cyl|{round(radius,4)}|{round(length,4)}|{segs}|{axis}|{mat}"
        if key in self._mesh_cache:
            return self._mesh_cache[key]
        h = length / 2.0
        ai = {"+X": 0, "-X": 0, "+Y": 1, "-Y": 1, "+Z": 2, "-Z": 2}[axis]
        o1, o2 = [0, 1, 2], [0, 1, 2]
        o1 = [x for x in (0, 1, 2) if x != ai]
        verts: List[Any] = []
        norms: List[Any] = []
        idx: List[int] = []

        def put(u: float, v: float, w: float, n: Sequence[float]) -> None:
            coord = [0.0, 0.0, 0.0]
            coord[ai] = sign * h if False else w
            coord[o1[0]] = u
            coord[o1[1]] = v
            verts.append(tuple(coord))
            norms.append(tuple(n))

        sign = 1.0 if axis[0] == "+" else -1.0
        # rings + sides
        for ring, wv in ((-1, -h), (1, h)):
            for s in range(segs):
                th = 2 * math.pi * s / segs
                cu, cv = radius * math.cos(th), radius * math.sin(th)
                nu, nv = math.cos(th), math.sin(th)
                n_coord = [0.0, 0.0, 0.0]
                n_coord[o1[0]] = nu
                n_coord[o1[1]] = nv
                put(cu, cv, wv, tuple(n_coord))
        for s in range(segs):
            a, b2 = s, (s + 1) % segs
            c2, d2 = segs + s, segs + (s + 1) % segs
            idx += [a, d2, b2, a, c2, d2]
        # caps
        for base_ring, perp in ((0, -1.0), (1, 1.0)):
            ctr = len(verts)
            cap_n = [0.0, 0.0, 0.0]
            cap_n[ai] = perp * (1.0 if axis[0] == "+" else -1.0)
            put(0.0, 0.0, -h if base_ring == 0 else h, cap_n)
            first = len(verts)
            for s in range(segs):
                th = 2 * math.pi * s / segs
                put(radius * math.cos(th), radius * math.sin(th), -h if base_ring == 0 else h, cap_n)
            for s in range(segs):
                a = first + s
                b2 = first + (s + 1) % segs
                idx += [ctr, b2, a] if base_ring == 0 else [ctr, a, b2]
        pos = self.accessor(verts, 5126, "VEC3")
        mid = self._mesh_from(name, [{
            "attributes": {"POSITION": pos, "NORMAL": self.accessor(norms, 5126, "VEC3", f"cynum{len(verts)}")},
            "indices": self.accessor(idx, 5125, "SCALAR"),
            "material": self.mat(mat),
        }])
        self._mesh_cache[key] = mid
        return mid

    # ------------------------------------------------ apple cluster ------ #
    def apple_cluster_mesh(self, name: str, crate_l: float, crate_w: float) -> int:
        """Authored top layer filling one booked crate: red + golden apples
        (each a dimpled sphere with calyx bowl and stem), fully centred."""
        key = f"applecluster|{round(crate_l,3)}|{round(crate_w,3)}"
        if key in self._mesh_cache:
            return self._mesh_cache[key]
        R = APPLE_DIAMETER_M / 2.0 * 1.08
        bands, segs = 4, 8
        gx_n, gz_n = APPLES_PER_CRATE_TOP

        def body_bases(dimple: bool) -> Tuple[List[Tuple[float, float, float]], List[Tuple[float, float, float]], List[int]]:
            verts: List[Tuple[float, float, float]] = []
            norms: List[Tuple[float, float, float]] = []
            idx: List[int] = []
            rings: List[List[Tuple[float, float, float]]] = []
            for b in range(1, bands + 1):
                th = math.pi * b / bands
                f = 1.0
                if dimple and th < 0.55:
                    f -= 0.5 * (1.0 - th / 0.55)
                if th > 2.6:
                    f *= 0.9
                ring = []
                for s in range(segs):
                    ph = 2 * math.pi * s / segs
                    rr = R * math.sin(th) * f
                    yv = R * math.cos(th)
                    ring.append((rr * math.cos(ph), yv, rr * math.sin(ph)))
                    norms.append((math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)))
                rings.append(ring)
                verts += ring
            for r_i in range(len(rings) - 1):
                for s in range(segs):
                    a = segs * r_i + s
                    b2 = segs * r_i + (s + 1) % segs
                    c2 = segs * (r_i + 1) + s
                    d2 = segs * (r_i + 1) + (s + 1) % segs
                    idx += [a, b2, d2, a, d2, c2]
            # cap the pole opening (a shallow dome; a recessed bowl on the calyx side)
            cap_c = len(verts)
            verts.append((0.0, R * (0.80 if dimple else 0.97), 0.0))
            norms.append((0.0, 1.0, 0.0))
            for s in range(segs):
                a = s
                b2 = (s + 1) % segs
                idx += [cap_c, b2, a]
            return verts, norms, idx

        step_l = (crate_l - 0.1) / gx_n
        step_w = (crate_w - 0.1) / gz_n

        def apple_off(gx: int, gz: int) -> Tuple[float, float]:
            return -crate_l / 2.0 + 0.05 + (gx + 0.5) * step_l, -crate_w / 2.0 + 0.05 + (gz + 0.5) * step_w

        prims: List[Dict[str, Any]] = []
        body_cache = {True: body_bases(True), False: body_bases(False)}
        for shade in (0, 1):
            pts: List[Tuple[float, float, float]] = []
            nlist: List[Tuple[float, float, float]] = []
            ilist: List[int] = []
            offset = 0
            for gx in range(gx_n):
                for gz in range(gz_n):
                    if (gx + gz) % 2 != shade:
                        continue
                    vv, nn, ii = body_cache[shade == 0]
                    origin = apple_off(gx, gz)
                    pts += [(v[0] + origin[0], v[1], v[2] + origin[1]) for v in vv]
                    nlist += nn
                    ilist += [i + offset for i in ii]
                    offset += len(vv)
            if not pts:
                continue
            prims.append({
                "attributes": {"POSITION": self.accessor(pts, 5126, "VEC3"), "NORMAL": self.accessor(nlist, 5126, "VEC3")},
                "indices": self.accessor(ilist, 5125, "SCALAR"),
                "material": self.mat("apple_cosse_red" if shade == 0 else "apple_gold"),
            })
        # stems: short prisms on each apple, glTF +Y
        stem_v: List[Tuple[float, float, float]] = []
        stem_n: List[Tuple[float, float, float]] = []
        stem_i: List[int] = []
        rr = 0.004
        ttl = 0.05
        for gx in range(gx_n):
            for gz in range(gz_n):
                ox, oz = apple_off(gx, gz)
                cnt = len(stem_v)
                cxx, czz = ox + 0.006, oz + 0.004
                y0 = R - 0.008
                for (yv, ny) in ((y0, 0.0), (y0 + ttl, 0.0)):
                    for s in range(6):
                        ph = 2 * math.pi * s / 6
                        stem_v.append((cxx + rr * math.cos(ph), yv, czz + rr * math.sin(ph)))
                        stem_n.append((math.cos(ph), 0.0, math.sin(ph)))
                for s in range(6):
                    a, b2 = cnt + s, cnt + (s + 1) % 6
                    c2, d2 = cnt + 6 + s, cnt + 6 + (s + 1) % 6
                    stem_i += [a, d2, b2, a, c2, d2]
        prims.append({
            "attributes": {"POSITION": self.accessor(stem_v, 5126, "VEC3"), "NORMAL": self.accessor(stem_n, 5126, "VEC3")},
            "indices": self.accessor(stem_i, 5125, "SCALAR"),
            "material": self.mat("apple_stem"),
        })
        mid = self._mesh_from(name, prims)
        self._mesh_cache[key] = mid
        return mid

    def sloped_roof_mesh(self, name: str, length: float, span: float, rise: float, mat: str) -> int:
        """Single sloped roof plane, glTF-native: eave edge at local z=0 (y=0),
        ridge edge at local z=span (y=rise), centred along X."""
        key = f"roofslab|{round(length,3)}|{round(span,3)}|{round(rise,3)}|{mat}"
        if key in self._mesh_cache:
            return self._mesh_cache[key]
        L2 = length / 2.0
        e0 = (-L2, 0.0, 0.0)
        e1 = (L2, 0.0, 0.0)
        r1 = (L2, rise, span)
        r0 = (-L2, rise, span)
        verts: List[Any] = []
        norms: List[Any] = []
        idx: List[int] = []
        # CCW when seen from the sky side (normal points up, tilted off the ridge)
        nrm = (0.0, span, -rise)
        nl = math.hypot(span, rise) or 1.0
        nrm = tuple(c / nl for c in nrm)
        for tri in ((e0, r0, r1), (e0, r1, e1)):
            cnt = len(verts)
            verts += list(tri)
            for _ in range(3):
                norms.append(tuple(nrm))
            idx += [cnt, cnt + 1, cnt + 2]
        pos = self.accessor(verts, 5126, "VEC3")
        mid = self._mesh_from(name, [{
            "attributes": {"POSITION": pos, "NORMAL": self.accessor(norms, 5126, "VEC3")},
            "indices": self.accessor(idx, 5125, "SCALAR"),
            "material": self.mat(mat),
        }])
        self._mesh_cache[key] = mid
        return mid


def _quad_faces(verts: List[Any], norms: List[Any], idx: List[int], quad: List[Tuple[float, float, float]], faces: List[Tuple[int, int, int, int, Tuple[float, float, float]]]) -> List[int]:
    """Bake quads (corner indices into `quad`) into verts/norms/idx."""
    for (a, b2, c2, d2, nrm) in faces:
        cnt = len(verts)
        verts += [quad[a], quad[b2], quad[c2], quad[d2]]
        for _ in range(4):
            norms.append(nrm)
        idx += [cnt, cnt + 1, cnt + 2, cnt, cnt + 2, cnt + 3]
    return idx


def _dir_quat(direction: Sequence[float]) -> Tuple[float, float, float, float]:
    """Unit quaternion rotating +X onto `direction` (for pipes)."""
    d = [float(c) for c in direction]
    n = math.sqrt(sum(c * c for c in d))
    if n < 1e-9:
        return (0.0, 0.0, 0.0, 1.0)
    d = [c / n for c in d]
    if d[0] <= -0.999999:
        return (0.0, 1.0, 0.0, 0.0)  # 180 degrees about Y
    w = math.sqrt(0.5 * (1.0 + d[0]))
    base = math.sqrt(0.5 * (1.0 - d[0]))
    # axis = X x d  = (0, -dz, dy)
    ay, az = -d[2], d[1]
    alen = math.hypot(ay, az)
    if alen < 1e-9:
        return (0.0, 0.0, 0.0, 1.0)
    return (0.0, ay / alen * base, az / alen * base, w)


# ---------------------------------------------------------------------- #
# Scene assembly                                                           #
# ---------------------------------------------------------------------- #
def build_glb(spec: TwinSpec, model: Dict[str, Any], stage: Stage) -> None:
    env = model["envelope"]
    p = spec.panels
    b = spec.building
    t_ext = b.wall_thickness_m + 2 * b.insulation_thickness_m
    objs: Dict[str, Any] = model["_objects"]
    g = G3

    root = stage.add_node("KashRoot_ColdStore_Twin", extras={"krt": "twin_root", "facility_name": spec.facility_name, "conventions": model["conventions"], "totals": model["totals"]})
    building = stage.add_node("Building", parent=root, extras={"krt": "building", "corridor_y": env["corridor_y"], "axes_engine": model["conventions"]["axes"], "axes_glb": "X east, Y up, Z south (engine depth mirrored)"})

    # ---- concrete slab + expansion joints ---- #
    floor = stage.add_node("Building/Floor", parent=building, extras={"krt": "floor", "slab_m": p.slab_thickness_m})
    fx = (env["min"][0] + env["max"][0]) / 2.0
    fy = (env["min"][1] + env["max"][1]) / 2.0
    fz = env["min"][2] - p.slab_thickness_m / 2.0
    stage.add_box_node("Floor_slab", [fx, fy, fz], [env["max"][0] - env["min"][0], env["max"][1] - env["min"][1], p.slab_thickness_m], "concrete_floor", parent=floor)
    for jx in env["joints_x"]:
        if env["min"][0] + 0.05 < jx < env["max"][0] - 0.05:
            stage.add_box_node(f"Floor_joint_x_{round(jx,1)}", [jx, fy, env["min"][2] - 0.002], [p.expansion_joint_width_m, env["max"][1] - env["min"][1], 0.008], "concrete_joint", parent=floor, extras={"krt": "expansion_joint"})
    for jy in (env["min"][1] + 12.0, env["chamber_zone"][0] + 6.0):
        if env["min"][1] + 0.2 < jy < env["max"][1] - 0.2:
            stage.add_box_node(f"Floor_joint_y_{round(jy,1)}", [fx, jy, env["min"][2] - 0.002], [env["max"][0] - env["min"][0], p.expansion_joint_width_m, 0.008], "concrete_joint", parent=floor, extras={"krt": "expansion_joint"})

    # ---- exterior walls with real openings ---- #
    walls = stage.add_node("Building/Walls", parent=building, extras={"krt": "walls"})
    z_bot, z_top = env["min"][2], env["max"][2]
    zc = (z_bot + z_top) / 2.0
    hh = z_top - z_bot
    front = stage.add_node("Wall_Front", parent=walls, extras={"krt": "wall", "wall": "front"})
    yfc = -t_ext / 2.0
    open_list = sorted([
        (env["entrance"]["x"] - env["entrance"]["width"] / 2, env["entrance"]["x"] + env["entrance"]["width"] / 2, env["entrance"]["height"]),
        (env["exit"]["x"] - env["exit"]["width"] / 2, env["exit"]["x"] + env["exit"]["width"] / 2, env["exit"]["height"]),
    ])
    cur = env["min"][0]
    seg_i = 0
    for (d0, d1, dh) in open_list:
        if d0 > cur + 0.005:
            stage.add_box_node(f"Wall_Front_{seg_i}", [(cur + d0) / 2.0, yfc, zc], [d0 - cur, t_ext, hh], "puf_panel_out", parent=front)
            seg_i += 1
        stage.add_box_node(f"Wall_Front_header_{seg_i}", [(d0 + d1) / 2.0, yfc, (dh + z_top) / 2.0], [d1 - d0, t_ext, z_top - dh], "puf_panel_out", parent=front, extras={"krt": "wall_header"})
        seg_i += 1
        cur = d1
    if cur < env["max"][0] - 0.005:
        stage.add_box_node(f"Wall_Front_{seg_i}", [(cur + env["max"][0]) / 2.0, yfc, zc], [env["max"][0] - cur, t_ext, hh], "puf_panel_out", parent=front)
    stage.add_box_node("Wall_Back_panel", [fx, env["max"][1] + t_ext / 2.0, zc], [env["max"][0] - env["min"][0], t_ext, hh], "puf_panel_out", parent=walls, extras={"krt": "wall", "wall": "back"})
    for side, xc, ribdir in (("West", env["min"][0] - t_ext / 2.0, 1.0), ("East", env["max"][0] + t_ext / 2.0, -1.0)):
        wn = stage.add_node(f"Wall_{side}", parent=walls, extras={"krt": "wall", "wall": side})
        stage.add_box_node(f"Wall_{side}_panel", [xc, fy, zc], [t_ext, env["max"][1] - env["min"][1] + 2 * t_ext, hh], "puf_panel_out", parent=wn)
        ribs = int((env["max"][1] - env["min"][1]) // p.corrugation_pitch_m)
        for k in range(1, ribs):
            yy = env["min"][1] + k * p.corrugation_pitch_m
            stage.add_box_node(f"Wall_{side}_corrug_{k}", [xc + ribdir * (t_ext / 2.0 + p.corrugation_depth_m), yy, zc], [2 * p.corrugation_depth_m, p.corrugation_pitch_m * 0.45, hh], "roof_steel", parent=wn, extras={"krt": "corrugation"})

    # ---- steel columns ---- #
    cols = stage.add_node("Building/Columns", parent=building, extras={"krt": "columns", "spacing_m": b.column_spacing_m})
    for c in env["columns"]:
        hcol = env["max"][2] - env["min"][2]
        stage.add_box_node(f"Column_col_{round(c['x'],1)}", [c["x"], (c["y1"] + c["y2"]) / 2.0, env["min"][2] + hcol / 2.0], [c["size"], c["size"], hcol], "galvanised_steel", parent=cols, extras={"krt": "column"})
        stage.add_box_node(f"Column_foot_{round(c['x'],1)}", [c["x"], (c["y1"] + c["y2"]) / 2.0, env["min"][2] + 0.03], [c["size"] * 1.7, c["size"] * 1.7, 0.06], "galvanised_steel", parent=cols)

    # ---- pitched roof ---- #
    roof = stage.add_node("Building/Roof", parent=building, extras={"krt": "roof", "pitch_ratio": b.roof_pitch_ratio})
    span_y = env["max"][1] - env["min"][1] + 2 * t_ext
    overhang = 0.25
    half_span = span_y / 2.0 + overhang
    ridge_rise = (env["max"][1] - env["min"][1]) / 2.0 * b.roof_pitch_ratio
    apex = env["max"][2] + ridge_rise
    roof_mesh = stage.sloped_roof_mesh("Roof_Slab", env["max"][0] - env["min"][0] + 2 * t_ext, half_span, ridge_rise, "roof_steel")
    # mesh rises along its local +z (eave at z=0, ridge at z=half_span).
    # Front half's ridge sits deeper into the building = glTF -z -> 180 deg turn.
    for hname, eave_y, flip in (("Roof_half_front", env["min"][1] - t_ext - overhang, True), ("Roof_half_back", env["max"][1] + t_ext + overhang, False)):
        eave_z = -eave_y
        stage.add_node(
            hname, mesh=roof_mesh,
            translation=[fx, env["max"][2], eave_z],
            quat=(0.0, 1.0, 0.0, 0.0) if flip else None,
            parent=roof,
            extras={"krt": "roof_slab", "side": "front" if flip else "back"},
        )
    stage.add_box_node("Roof_ridge_cap", [fx, (env["min"][1] + env["max"][1]) / 2.0, apex + 0.06], [env["max"][0] - env["min"][0] + 2 * t_ext, 0.1, 0.26], "roof_steel", parent=roof, extras={"krt": "ridge_cap"})
    for yy in (env["min"][1] - t_ext - 0.12, env["max"][1] + t_ext + 0.12):
        stage.add_box_node(f"Roof_gutter_{round(yy,1)}", [fx, yy, env["max"][2] - 0.04], [env["max"][0] - env["min"][0] + 2 * t_ext, 0.14, 0.14], "galvanised_steel", parent=roof, extras={"krt": "gutter"})

    # ---- loading bay: roll-up doors, levelers, lane markings, pre-cool zone ---- #
    bay = stage.add_node("Building/Landing_bay", parent=building, extras={"krt": "loading_bay", "precooling_corridor": True})
    for door_key in ("entrance", "exit"):
        dv = env[door_key]
        stage.add_box_node(f"{door_key}_header", [dv["x"], -t_ext / 2.0, dv["height"] + 0.3], [dv["width"] + 0.5, 0.3, 0.4], "puf_panel_out", parent=bay)
        slats = int(dv["height"] // 0.45)
        for k in range(slats):
            stage.add_box_node(f"{door_key}_slat_{k}", [dv["x"], -t_ext / 2.0, dv["height"] - (k + 0.5) * 0.45], [dv["width"], 0.12, 0.42], "ca_door", parent=bay, extras={"krt": "rollup_door"})
        stage.add_box_node(f"{door_key}_leveler", [dv["x"], -1.35, (env["min"][2] - 0.04)], [dv["width"], 2.7, 0.12], "safety_yellow", parent=bay, extras={"krt": "dock_leveler"})
        for sx in (-1, 1):
            stage.add_box_node(f"{door_key}_bumpers{sx}", [dv["x"] + sx * (dv["width"] / 2 + 0.14), -0.2, env["min"][2] + 0.5], [0.2, 0.22, 0.5], "rubber_black", parent=bay)
    lane_len = env["corridor_y"][1] - env["min"][1] - 0.6
    for lane, lx in (("left", env["min"][0] + 0.9), ("right", env["max"][0] - 0.9)):
        stage.add_box_node(f"Corridor_lane_{lane}", [lx, (env["min"][1] + env["corridor_y"][1]) / 2.0, env["min"][2] + 0.002], [0.12, lane_len, 0.01], "corridor_marking", parent=bay, extras={"krt": "lane_marking"})
    stage.add_box_node("Precool_zone_marking", [fx, env["min"][1] + 2.0, env["min"][2] + 0.001], [(env["max"][0] - env["min"][0]) * 0.8, 2.4, 0.008], "corridor_marking", parent=bay, extras={"krt": "precooling_zone"})

    # ---- chambers ---- #
    for ch, cfg in zip(model["chambers"], spec.chambers):
        mm = objs[cfg.chamber_id]
        cid = cfg.chamber_id
        crate = cfg.crate
        rack = cfg.rack
        x0, y0, z0, x1, y1, z1 = ch["rect"]
        th = p.partition_thickness_m
        chn = stage.add_node(f"Chamber_{cid}", parent=root, extras={
            "krt": "chamber", "chamber_id": cid, "label": ch["label"],
            "temperature_c": ch["temperature_c"], "humidity_pct": ch["humidity_pct"], "ca": ch["ca"],
            "rect": ch["rect"],
            "capacity": {k: ch[k] for k in (
                "levels_per_chamber", "crates_per_level", "crate_count", "booked_count",
                "max_theoretical_capacity_kg", "actual_usable_capacity_kg", "occupied_capacity_kg",
                "remaining_capacity_kg", "interior_volume_m3", "usable_volume_m3", "deck_area_m2", "max_deck_kg",
            )},
        })

        walls_ch = stage.add_node(f"Chamber_{cid}/Walls", parent=chn, extras={"krt": "chamber_walls"})
        stage.add_box_node(f"Wall_{cid}_west", [x0 - th / 2.0, (y0 + y1) / 2.0, (z0 + z1) / 2.0], [th, y1 - y0, z1 - z0], "partition_panel", parent=walls_ch, extras={"krt": "partition"})
        if cid == model["chambers"][-1]["id"]:
            stage.add_box_node(f"Wall_{cid}_east", [x1 + th / 2.0, (y0 + y1) / 2.0, (z0 + z1) / 2.0], [th, y1 - y0, z1 - z0], "partition_panel", parent=walls_ch, extras={"krt": "partition"})
        d = ch["door"]
        d_x0, d_w, d_h = d["x0"], d["width"], d["height"]
        j_left = d_x0 - x0
        if j_left > 0.02:
            stage.add_box_node(f"Partition_{cid}_L", [x0 + j_left / 2.0, y0 - th / 2.0, (z0 + z1) / 2.0], [j_left, th, z1 - z0], "partition_panel", parent=walls_ch, extras={"krt": "partition"})
        j_right = x1 - (d_x0 + d_w)
        if j_right > 0.02:
            stage.add_box_node(f"Partition_{cid}_R", [x1 - j_right / 2.0, y0 - th / 2.0, (z0 + z1) / 2.0], [j_right, th, z1 - z0], "partition_panel", parent=walls_ch, extras={"krt": "partition"})
        if z1 - d_h > 0.02:
            stage.add_box_node(f"Partition_{cid}_header", [d_x0 + d_w / 2.0, y0 - th / 2.0, (d_h + z1) / 2.0], [d_w, th, z1 - d_h], "partition_panel", parent=walls_ch, extras={"krt": "partition"})

        doorn = stage.add_node(f"Chamber_{cid}/CA_door", parent=chn, extras={"krt": "door", "chamber_id": cid, "ca": d["ca"], "width_m": d_w, "height_m": d_h})
        slab_cx = d_x0 + d_w / 2.0
        slab_cy = y0 - th / 2.0 + 0.02
        slab_zc = z0 + d_h / 2.0
        stage.add_box_node(f"Door_{cid}_slab", [slab_cx, slab_cy, slab_zc], [d_w + 0.24, 0.1, d_h], "ca_door", parent=doorn, extras={"krt": "ca_door_slab"})
        stage.add_box_node(f"Door_{cid}_rail", [slab_cx + d_w * 0.6, slab_cy, z0 + d_h + 0.1], [d_w * 2.4 + 0.5, 0.14, 0.14], "door_track", parent=doorn, extras={"krt": "door_track"})
        stage.add_box_node(f"Door_{cid}_gasket", [slab_cx, slab_cy, z0 + d_h - 0.05], [d_w + 0.2, 0.13, 0.06], "gasket", parent=doorn)
        stage.add_node(f"Door_{cid}_viewing_port", mesh=stage.cyl_mesh("GlassPort", 0.14, 0.02, "glass_port", 16, axis="+Z"), translation=[slab_cx, slab_zc, -(slab_cy - 0.07)], parent=doorn, extras={"krt": "viewing_port"})
        stage.add_node(f"Door_{cid}_handle", mesh=stage.mesh_boxes("DoorHandle", [(-0.025, -0.025, -0.32, 0.05, 0.05, 0.64), (-0.06, -0.02, -0.38, 0.14, 0.05, 0.12), (-0.06, -0.02, 0.26, 0.14, 0.05, 0.12)], "door_track", anchor="center"), translation=[slab_cx + d_w * 0.6, z0 + 1.1, -(slab_cy - 0.08)], parent=doorn, extras={"krt": "door_handle"})

        # ---- racking, crates, apples ---- #
        racks_n = stage.add_node(f"Chamber_{cid}/Racks", parent=chn, extras={"krt": "racks"})
        crate_mat = crate_material(crate.base_color) if crate.material_type == "HDPE_PLASTIC" else "wood_bin"
        crate_mesh_id = stage.crate_mesh(f"CrateBody_{cid}", crate.crate_length_m, crate.crate_width_m, crate.crate_height_m, 0.008, crate_mat)
        apple_mesh_id = stage.apple_cluster_mesh(f"AppleCluster_{cid}", crate.crate_length_m, crate.crate_width_m)
        payload_pitch = crate.crate_height_m + rack.level_clearance_m
        usable_len = (x1 - x0) - 2 * p.wall_clearance_m
        actual_len = min(rack.rack_length_m, usable_len)
        bay_n = ch["racks"][0]["bays"] if ch["racks"] else 1
        bay_mesh_id = stage.rack_bay_mesh(f"RackBayBody_{cid}", rack.upright_width_m, rack.rack_width_m, rack.rack_height_m, actual_len / bay_n, ch["levels_per_chamber"], payload_pitch, "rack_steel", "wire_mesh")

        for rk in ch["racks"]:
            rn = stage.add_node(f"Chamber_{cid}/Floor_L1/{rk['index']}", parent=racks_n, extras={"krt": "rack_row", "row": rk["index"], "levels": ch["levels_per_chamber"], "bays": rk["bays"]})
            for bi in range(rk["bays"]):
                bay_pitch = actual_len / bay_n
                bx = rk["origin"][0] + bi * bay_pitch + bay_pitch / 2.0
                t3 = g(bx, rk["origin"][1] + rack.rack_width_m / 2.0, z0)
                stage.add_node(
                    f"Rack_{cid}_R{rk['index']}_B{bi + 1}",
                    mesh=bay_mesh_id, translation=[round(v, 4) for v in t3],
                    parent=rn,
                    extras={"krt": "rack_bay", "chamber_id": cid, "floor_level": "all", "rack_row": rk["index"], "bay": bi + 1},
                )

        cells = mm.crates
        if cells:
            h_crate = crate.crate_height_m
            trans: List[List[float]] = []
            for cell in cells:
                # engine pos is the crate's bottom centre; lift by half height
                trans.append([round(cell.pos[0], 4), round(cell.pos[2] + h_crate / 2.0, 4), round(-cell.pos[1], 4)])
            tr_acc = stage.accessor([tuple(t) for t in trans], 5126, "VEC3")
            floors_node = stage.add_node(f"Chamber_{cid}/Floor_L1", parent=chn, extras={"krt": "floors", "levels": ch["levels_per_chamber"], "crate_order": model["conventions"]["crate_order"], "count": len(cells)})
            stage.add_node(
                f"Crates_{cid}", mesh=crate_mesh_id, parent=floors_node,
                instance_attrs={"TRANSLATION": tr_acc},
                extras={"krt": "crates", "chamber_id": cid, "count": len(cells), "crate_material": crate_mat, "instancing": "instance i == engine cell i; grower from chambers.booked_spans"},
            )
            booked_ids = [i for i, cell in enumerate(cells) if cell.booking_status == "booked"]
            if booked_ids:
                a_list = []
                for i in booked_ids:
                    cx, cy, cz = cells[i].pos
                    a_list.append([round(cx, 4), round(cz + h_crate + APPLE_DIAMETER_M * 0.08, 4), round(-cy, 4)])
                a_acc = stage.accessor([tuple(t) for t in a_list], 5126, "VEC3")
                overlay = stage.add_node(f"Occupier_{cid}", parent=floors_node, extras={"krt": "grower_overlay", "spans": ch.get("booked_spans", [])})
                stage.add_node(f"Apples_{cid}", mesh=apple_mesh_id, parent=overlay, instance_attrs={"TRANSLATION": a_acc}, extras={"krt": "apples", "count": len(a_list), "grid": model["conventions"]["apple_cluster_grid"], "per_crate": APPLES_PER_CRATE_TOP[0] * APPLES_PER_CRATE_TOP[1]})

        gear = stage.add_node(f"Chamber_{cid}/Machinery", parent=chn, extras={"krt": "machinery", "evaporator_units": len(ch["evaporators"]), "led_strips": len(ch["lights"]), "pipes": len(ch["pipes"])})
        for i, ev in enumerate(ch["evaporators"]):
            evn = stage.add_node(f"Evap_{cid}_{i + 1}", parent=gear, extras={"krt": "evaporator", "chamber_id": cid})
            stage.add_box_node(f"Evap_{cid}_{i + 1}_body", [ev["center"][0], ev["center"][1], ev["center"][2]], ev["size"], "evap_body", parent=evn)
            fy_d = ev["center"][1] + ev["size"][1] / 2.0 + 0.02
            for fi in range(3):
                fxc = ev["center"][0] + (fi - 1) * ev["size"][0] * 0.26
                stage.add_node(f"Evap_{cid}_{i + 1}_fan_{fi}", mesh=stage.cyl_mesh("FanDisc", ev["size"][2] * 0.26, 0.02, "fan_dark", 12, axis="+Z"), translation=[fxc, ev["center"][2], -fy_d], parent=evn, extras={"krt": "fan_blower"})
        for i, lgt in enumerate(ch["lights"]):
            stage.add_box_node(f"LED_{cid}_{i}", [lgt["center"][0], lgt["center"][1], lgt["center"][2]], lgt["size"], "led_light", parent=gear, extras={"krt": "led_strip", "chamber_id": cid})
        for i, pp in enumerate(ch["pipes"]):
            a, cto = pp["from"], pp["to"]
            dx, dy, dz = cto[0] - a[0], cto[1] - a[1], cto[2] - a[2]
            length = math.sqrt(dx * dx + dy * dy + dz * dz)
            if length < 0.01:
                continue
            mesh = stage.cyl_mesh(f"Pipe_{round(pp['radius'],3)}x{round(length,2)}", pp["radius"], length, "pipe_steel", 8, axis="+X")
            dg = GDIR(dx, dy, dz)
            q = _dir_quat((dg[0], dg[1], dg[2]))
            t3 = g(a[0], a[1], a[2])
            stage.add_node(f"Pipe_{cid}_{i}", mesh=mesh, translation=[round(v, 4) for v in t3], quat=q, parent=gear, extras={"krt": "refrigerant_pipe", "chamber_id": cid, "from": pp["from"], "to": pp["to"]})


# ---------------------------------------------------------------------- #
# Write GLB                                                                #
# ---------------------------------------------------------------------- #
def export_glb(spec: TwinSpec, out_path: str, metadata_path: Optional[str] = None) -> Dict[str, Any]:
    model = build_model(spec)
    stage = Stage()
    build_glb(spec, model, stage)
    gltf: Dict[str, Any] = stage.g
    json_bytes = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_payload = json_bytes + b" " * json_pad
    bin_pad = (4 - (len(stage.bin) % 4)) % 4
    bin_payload = bytes(stage.bin) + b"\x00" * bin_pad
    total = 12 + 8 + len(json_payload) + 8 + len(bin_payload)
    payload = (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(json_payload), _CHUNK_JSON)
        + json_payload
        + struct.pack("<I4s", len(bin_payload), _CHUNK_BIN)
        + bin_payload
    )
    with open(out_path, "wb") as fh:
        fh.write(payload)
    stats = {
        "filename": os.path.basename(out_path),
        "path": os.path.abspath(out_path),
        "bytes": os.path.getsize(out_path),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "nodes": len(gltf["nodes"]),
        "meshes": len(gltf["meshes"]),
        "accessors": len(gltf["accessors"]),
        "materials": len(gltf["materials"]),
        "instanced_nodes": sum(1 for n in gltf["nodes"] if n.get("extensions", {}).get("EXT_mesh_gpu_instancing")),
        "extras_nodes": sum(1 for n in gltf["nodes"] if "extras" in n),
    }
    if metadata_path:
        write_metadata(spec, model, stats, metadata_path)
    return stats


def write_metadata(spec: TwinSpec, model: Dict[str, Any], glb_stats: Dict[str, Any], path: str) -> None:
    """Exact capacity + layout metadata for the web viewer (per-chamber grid
    geometry + booked spans; crate records are reconstructed arithmetically)."""
    chambers: List[Dict[str, Any]] = []
    for ch in model["chambers"]:
        chambers.append(ch)
    meta = {
        "$schema": "kashroot_coldstore_twin.metadata/1.0",
        "facility_name": spec.facility_name,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generator": "kashroot-coldstore-twin (headless glb_exporter, pure Python; glTF 2.0 + EXT_mesh_gpu_instancing)",
        "units": {"length": "metre", "mass": "kilogram", "temperature": "degC", "humidity": "percent"},
        "glb": glb_stats,
        "spec": spec.to_dict(),
        "totals": model["totals"],
        "chambers": chambers,
        "conventions": model["conventions"],
        "crate_records": {
            "how": "Crates_<CH> nodes use EXT_mesh_gpu_instancing; instance i is engine cell i. "
            "cell = divmod over (levels x rack rows x rows_per_level x crates_per_row) in the engine's level/row/subrow/col order; "
            "the grower of instance i = the span in chambers[].booked_spans containing i.",
            "fields_per_cell": ["crate_id", "chamber", "level", "row", "subrow", "col", "grower", "status", "product", "weightCapacityKg", "occupiedKg", "availableKg"],
        },
        "methodology": {
            "ext_panel_thickness_m": "wall_thickness_m + 2 x insulation_thickness_m",
            "levels_per_chamber": "floor((chamber height - top clearance - evaporator band height) / (crate height + level clearance)), then min(rack num_levels, height inside rack)",
            "crates_per_level": "floor((rack length - 2 x upright width) / crate pitch) x floor((rack width - 2 x upright width) / crate pitch), capped by owner's packing pattern and deck kg/m2 limit",
            "max_theoretical_capacity_kg": "geometric crate count x crate rating",
            "actual_usable_capacity_kg": "min(geometric total, chamber max_load_capacity_kg, deck-load-limited total)",
            "occupied_capacity_kg": "sum over booked crates of kg recorded against them (rated crate capacity when the engine fills an empty station)",
            "guarantee": "every figure derives from the facility spec; the engine invents nothing",
        },
    }
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, indent=1, ensure_ascii=False, default=_plain)
        fh.write("\n")


def _plain(o: Any) -> Any:
    if hasattr(o, "to_dict"):
        return o.to_dict()
    if isinstance(o, (set, tuple)):
        return list(o)
    if isinstance(o, float):
        return round(o, 6)
    return str(o)


def verify_glb(path: str) -> Dict[str, Any]:
    """Reparse a written GLB: header, chunk order, accessor bounds, node ref."""
    with open(path, "rb") as fh:
        data = fh.read()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("Not a GLB file")
    version, length = struct.unpack_from("<II", data, 4)
    if length != len(data):
        raise ValueError(f"Header total {length} != file bytes {len(data)}")
    off = 12
    json_chunk: Optional[bytes] = None
    bin_chunk: Optional[bytes] = None
    while off < length:
        clen, ctype = struct.unpack_from("<I4s", data, off)
        if ctype == _CHUNK_JSON:
            json_chunk = data[off + 8: off + 8 + clen]
        elif ctype == _CHUNK_BIN:
            bin_chunk = data[off + 8: off + 8 + clen]
        off += 8 + clen
    if json_chunk is None:
        raise ValueError("GLB missing JSON chunk")
    if bin_chunk is None:
        raise ValueError("GLB missing BIN chunk")
    jdoc = json.loads(json_chunk.decode("utf-8").rstrip())
    stats = {
        "version": version,
        "bytes": length,
        "nodes": len(jdoc.get("nodes", [])),
        "meshes": len(jdoc.get("meshes", [])),
        "accessors": len(jdoc.get("accessors", [])),
        "materials": len(jdoc.get("materials", [])),
        "instanced_nodes": sum(1 for n in jdoc.get("nodes", []) if n.get("extensions", {}).get("EXT_mesh_gpu_instancing")),
        "extras_nodes": sum(1 for n in jdoc.get("nodes", []) if "extras" in n),
        "crate_overlay_nodes": sum(1 for n in jdoc.get("nodes", []) if str(n.get("name", "")).startswith("Crates_")),
        "chamber_nodes": sum(1 for n in jdoc.get("nodes", []) if str(n.get("name", "")).startswith("Chamber_")),
    }
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    byte_w = {5126: 4, 5125: 4, 5123: 2, 5121: 1}
    for node in jdoc.get("nodes", []):
        if "mesh" in node and not (0 <= node["mesh"] < len(jdoc["meshes"])):
            raise ValueError(f"Node {node.get('name')} points at missing mesh {node['mesh']}")
    for mesh in jdoc["meshes"]:
        for prim in mesh["primitives"]:
            for a in prim.get("attributes", {}).values():
                if a >= len(jdoc["accessors"]):
                    raise ValueError(f"Mesh {mesh['name']}: attribute accessor {a} out of range")
            if prim.get("indices") is not None and prim["indices"] >= len(jdoc["accessors"]):
                raise ValueError(f"Mesh {mesh['name']}: index accessor out of range")
    for acc in jdoc["accessors"]:
        bv = jdoc["bufferViews"][acc["bufferView"]]
        need = byte_w[acc["componentType"]] * comps[acc["type"]] * acc["count"]
        if bv["byteOffset"] + bv["byteLength"] > len(bin_chunk) + 1:
            raise ValueError(f"Accessor overruns the BIN chunk at offset {bv['byteOffset']}")
        if bv["byteLength"] < need:
            raise ValueError("Accessor buffer shorter than count requires")
    for node in jdoc.get("nodes", []):
        ext = node.get("extensions", {})
        tr = (ext.get("EXT_mesh_gpu_instancing") or {}).get("attributes", {}).get("TRANSLATION")
        if tr is not None:
            acc = jdoc["accessors"][tr]
            if acc["componentType"] != 5126 or acc["type"] != "VEC3":
                raise ValueError("Instancing TRANSLATION accessor must be float VEC3")
    for m in jdoc["materials"]:
        if "pbrMetallicRoughness" not in m:
            raise ValueError(f"Material {m.get('name')} has no pbrMetallicRoughness")
    return stats

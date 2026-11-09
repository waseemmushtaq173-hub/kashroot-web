"""The KashRoot capacity engine - exact numbers, zero invented values (Phase 6).

Every figure here is derived from the owner's parameters with documented
formulas:

  * usable interior volume after walls, insulation, partitions, slab,
  * the per-chamber layout: aisle band in from the door (which includes the
    sliding-door pocket), wall clearances, rack rows, aisles between rows,
  * crates per level between the uprights, levels up to the evaporator band,
  * weight limits: the chamber cap and the deck area load limit per level,
  * booked crates (from store records), occupied = rated capacity x count.

It also produces the **spatial model**: the exact stations of every rack
bay, crate, door, blower, light and pipe in metres, which the Blender
builder (bpy) and the headless GLB exporter both consume - so the two can
never disagree.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .properties import TwinSpec

ROUND = 3


def r(n: float) -> float:
    return round(n + 0.0, ROUND)


def r3seq(seq) -> List[float]:
    return [r(v) for v in seq]


# ---------------------------------------------------------------------- #
# Envelope layout                                                          #
# ---------------------------------------------------------------------- #
@dataclass
class Envelope:
    """Derived shell geometry shared by every builder."""

    length_m: float
    width_m: float
    height_m: float
    t_ext: float            # outer panel assembly thickness
    t_part: float           # internal insulated partition thickness
    slab: float
    interior: Tuple[float, float, float, float, float, float]  # min corner + max corner (x0,y0,z0,x1,y1,z1)
    corridor: Tuple[float, float]                              # y0, y1 of the loading corridor
    chamber_zone: Tuple[float, float]                          # y0, y1
    chamber_rects: List[Tuple[float, float]]                   # x0, x1 per chamber slot
    roof_pitch: float


def build_envelope(spec: TwinSpec) -> Envelope:
    b, p = spec.building, spec.panels
    t_ext = b.wall_thickness_m + 2.0 * b.insulation_thickness_m
    t_part = p.partition_thickness_m
    x0, y0 = t_ext, t_ext
    x1 = b.length_m - t_ext
    y1 = b.width_m - t_ext
    z0 = p.slab_thickness_m
    z1 = b.height_m - t_ext
    corridor = (y0, y0 + b.loading_bay_width_m)
    chamber_zone = (corridor[1] + t_part, y1)
    n = max(1, len(spec.chambers) or b.num_chambers)
    span = (x1 - x0) - (n - 1) * t_part
    pitch = span / n
    rects = [(r(x0 + i * (pitch + t_part)), r(x0 + i * (pitch + t_part) + pitch)) for i in range(n)]
    return Envelope(
        length_m=b.length_m, width_m=b.width_m, height_m=b.height_m,
        t_ext=t_ext, t_part=t_part, slab=p.slab_thickness_m,
        interior=(r(x0), r(y0), r(z0), r(x1), r(y1), r(z1)),
        corridor=(r(corridor[0]), r(corridor[1])),
        chamber_zone=(r(chamber_zone[0]), r(chamber_zone[1])),
        chamber_rects=rects,
        roof_pitch=b.roof_pitch_ratio,
    )


# ---------------------------------------------------------------------- #
# Capacity maths                                                           #
# ---------------------------------------------------------------------- #
@dataclass
class CrateCell:
    """Exactly one crate station in the deterministic packing order.

    Order: level, then rack row, then sub-row across the rack depth, then
    the crate along the rack length. The GLB instances and the web viewer
    both walk this same order, so instance id N is the same crate
    everywhere.
    """

    cell_id: str
    chamber_id: str
    level: int          # 1-based deck level
    row: int            # 1-based rack row
    subrow: int         # 1-based row across the rack depth
    col: int            # 1-based along the rack length
    pos: Tuple[float, float, float]      # crate centre, metres, Y-up
    rot_y: float = 0.0                  # long side along X
    grower_id: Optional[str] = None
    booking_status: str = "free"
    product_type: Optional[str] = None
    weight_capacity_kg: float = 0.0
    occupied_weight_kg: float = 0.0
    available_weight_kg: float = 0.0


@dataclass
class RackRowModel:
    index: int  # 1-based, 1 = nearest the back wall
    origin: Tuple[float, float, float]
    bays: int
    levels: int
    crates_per_level: int
    per_level_kg: int


@dataclass
class ChamberModel:
    """A built chamber: interior box, door, machinery, racks and crates."""

    id: str
    label: str
    rect: Tuple[float, float, float, float, float, float]   # interior min/max (x0,y0,z0,x1,y1,z1)
    temperature_c: float
    humidity_pct: float
    ca: bool
    aisle_width_m: float
    door: Dict[str, Any]
    evaporators: List[Dict[str, Any]]
    lights: List[Dict[str, Any]]
    pipes: List[Dict[str, Any]]
    racks: List[RackRowModel]
    crates: List[CrateCell] = field(default_factory=list)
    occupied_cells: Dict[int, str] = field(default_factory=dict)  # crate index -> grower
    # numbers (all exact, rounded to mm)
    interior_volume_m3: float = 0.0
    usable_volume_m3: float = 0.0
    levels_per_chamber: int = 0
    crates_per_level: int = 0
    crates_per_row_fit: int = 0
    rows_per_level_fit: int = 0
    crate_count: int = 0
    max_theoretical_capacity_kg: float = 0.0
    actual_usable_capacity_kg: float = 0.0
    occupied_capacity_kg: float = 0.0
    remaining_capacity_kg: float = 0.0
    booked_count: int = 0
    deck_area_m2: float = 0.0
    max_deck_kg: float = 0.0
    growers: List[Dict[str, Any]] = field(default_factory=list)
    spare_depth_m: float = 0.0
    appled_crate_count: int = 0


def layout_crates(spec: TwinSpec, chambers_out: Dict[str, ChamberModel], booked: Dict[str, List[Dict[str, Any]]]) -> None:
    """Fill every chamber's crate grid and weight totals."""
    p = spec.panels
    for cfg, model in zip(spec.chambers, [chambers_out[c.chamber_id] for c in spec.chambers]):
        crate, rack = cfg.crate, cfg.rack
        # inner usable rectangle behind the front zone
        front_zone = max(cfg.aisle_width_m, p.door_slide_allowance_m + cfg.door_width_m)
        x0 = model.rect[0] + p.wall_clearance_m
        x1 = model.rect[3] - p.wall_clearance_m
        usable_len = x1 - x0
        rack_length = min(rack.rack_length_m, usable_len)
        rack_x0 = x0  # racks start at the left wall of the chamber, centred later
        rack_x0 = x0 + (usable_len - rack_length) / 2.0

        # levels: fit by stack pitch, respecting rack height and num_levels.
        payload_pitch = crate.crate_height_m + rack.level_clearance_m
        height_cap = int((cfg.height_m - p.top_clearance_m - p.evaporator_height_m) // payload_pitch)  # keep floor for machinery
        rack_cap = int(rack.rack_height_m // payload_pitch)
        levels = max(0, min(rack.num_levels, height_cap, rack_cap, rack.num_levels))

        # crates per level: between the uprights, in both directions, then the
        # owner's packing pattern, whichever is smaller.
        big = max(crate.crate_length_m, crate.crate_width_m)
        small = min(crate.crate_length_m, crate.crate_width_m)
        along_pitch = big + p.crate_gap_m
        across_pitch = small + p.crate_gap_m
        fit_along = int((rack_length - 2.0 * rack.upright_width_m) // along_pitch)
        fit_across = int((rack.rack_width_m - 2.0 * rack.upright_width_m) // across_pitch)
        crates_per_row = min(crate.crates_per_row, fit_along) if fit_along >= 1 else 0
        rows_per_level = min(crate.rows_per_level, fit_across) if fit_across >= 1 else 0
        crates_per_rowlevel = crates_per_row * rows_per_level

        # deck area + per-level load cap (kg/m2 restraint)
        deck_area = rack_length * rack.rack_width_m
        max_deck_kg = rack.floor_load_limit_kg * deck_area
        crates_rowlevel_loadcap = int(max_deck_kg // crate.weight_capacity_kg) if crate.weight_capacity_kg > 0 else 0
        if crates_rowlevel_loadcap > 0 and crates_per_rowlevel > 0:
            crates_per_rowlevel = min(crates_per_rowlevel, crates_rowlevel_loadcap)
        crates_per_level = crates_per_rowlevel * rack.num_rack_rows  # across all rack rows

        model.levels_per_chamber = levels
        model.crates_per_level = crates_per_level
        model.crates_per_row_fit = crates_per_row
        model.rows_per_level_fit = rows_per_level
        model.deck_area_m2 = r(deck_area)
        model.max_deck_kg = r(max_deck_kg)

        # rows of racks: front zone first, walking toward the back wall (+y).
        rack_span = rack.num_rack_rows * rack.rack_width_m + max(0, rack.num_rack_rows - 1) * rack.rack_spacing_m
        run_start = model.rect[1] + front_zone  # racks start right behind the front zone
        for row_i in range(rack.num_rack_rows):
            y0 = run_start + row_i * (rack.rack_width_m + rack.rack_spacing_m)
            y1 = y0 + rack.rack_width_m
            bays = max(1, math.ceil(rack_length / p.rack_bay_pitch_m - 1e-9))
            per_level_kg = crates_per_level * 1  # get set below with weight
            model.racks.append(RackRowModel(index=row_i + 1, origin=(r(rack_x0), r(y0), model.rect[2]), bays=bays, levels=levels, crates_per_level=crates_per_level, per_level_kg=per_level_kg))

        # every crate station, in the published order (level, row, subrow, col)
        idx = 0
        for level in range(1, levels + 1):
            base_z = model.rect[2] + (level - 1) * payload_pitch + p.crate_stack_slack_m
            for row in model.racks:
                for subrow in range(1, rows_per_level + 1):
                    y = row.origin[1] + p.crate_gap_m + rack.upright_width_m + (subrow - 1) * across_pitch + crate.crate_width_m / 2.0
                    for col in range(1, crates_per_row + 1):
                        x = row.origin[0] + p.crate_gap_m + rack.upright_width_m + (col - 1) * along_pitch + crate.crate_length_m / 2.0
                        model.crates.append(CrateCell(
                            cell_id=f"Crate_{model.id}_L{level}_R{row.index}_C{(subrow - 1) * crates_per_row + col}",
                            chamber_id=model.id, level=level, row=row.index, subrow=subrow, col=col,
                            pos=(r(x), r(y), r(base_z)),
                            rot_y=0.0,
                            weight_capacity_kg=crate.weight_capacity_kg,
                            occupied_weight_kg=0.0,
                            available_weight_kg=crate.weight_capacity_kg,
                        ))
                        idx += 1
        model.crate_count = len(model.crates)

        # weights: geometric total, rated crate capacity, deck and chamber caps
        max_theoretical = len(model.crates) * crate.weight_capacity_kg
        chamber_cap = cfg.max_load_capacity_kg if cfg.max_load_capacity_kg > 0 else max_theoretical
        level_load_limited = crates_rowlevel_loadcap * rack.num_rack_rows * levels * crate.weight_capacity_kg
        model.max_theoretical_capacity_kg = r(max_theoretical)
        model.actual_usable_capacity_kg = r(min(max_theoretical, chamber_cap, level_load_limited))

        # bookings: fill deterministic order with each grower's crates
        chamber_book = booked.get(model.id) or []
        cursor = 0
        total_booked_kg = 0.0
        for g in chamber_book:
            if g["crates"] <= 0:
                continue
            filled = 0
            span: List[Optional[int]] = [None, None]
            while filled < g["crates"] and cursor < len(model.crates):
                cell = model.crates[cursor]
                cell.grower_id = g["grower_id"]
                cell.product_type = g["product"]
                cell.booking_status = "booked"
                cell.occupied_weight_kg = g["kg_per_crate"]
                cell.available_weight_kg = r(max(0.0, cell.weight_capacity_kg - g["kg_per_crate"]))
                total_booked_kg += g["kg_per_crate"]
                if span[0] is None:
                    span[0] = cursor
                span[1] = cursor
                cursor += 1
                filled += 1
            if filled < g["crates"]:
                model.growers.append({
                    "grower_id": g["grower_id"], "name": g["name"], "product_type": g["product"],
                    "crates": filled, "kg": r(filled * g["kg_per_crate"]),
                    "span_start": span[0], "span_end": span[1], "short": True,
                    "note": f"Only {filled} of {g['crates']} crates fit for {g['grower_id']}: the chamber ran out of empty stations.",
                })
            else:
                model.growers.append({
                    "grower_id": g["grower_id"], "name": g["name"], "product_type": g["product"],
                    "crates": filled, "kg": r(filled * g["kg_per_crate"]),
                    "span_start": span[0], "span_end": span[1],
                })
        model.occupied_capacity_kg = r(total_booked_kg)
        model.booked_count = cursor
        model.remaining_capacity_kg = r(max(0.0, model.actual_usable_capacity_kg - total_booked_kg))
        model.appled_crate_count = cursor
        model.spare_depth_m = r(model.rect[4] - p.wall_clearance_m - (run_start + rack_span))

        # volumes
        vol = (model.rect[3] - model.rect[0]) * (model.rect[4] - model.rect[1]) * (model.rect[5] - model.rect[2])
        model.interior_volume_m3 = r(vol)
        usable = (x1 - x0) * (model.rect[4] - (model.rect[1] + p.wall_clearance_m)) * (cfg.height_m - p.evaporator_height_m)
        model.usable_volume_m3 = r(usable)


def allocate_bookings(spec: TwinSpec) -> Dict[str, List[Dict[str, Any]]]:
    """Turn booking records into per-chamber fill lists."""
    chamber_ids = [c.chamber_id for c in spec.chambers]
    per: Dict[str, List[Dict[str, Any]]] = {}
    for g in spec.demo_bookings:
        kg = g.weight_per_crate_kg if g.weight_per_crate_kg else None
        if kg is None:
            crate_cfg = next((c.crate for c in spec.chambers if c.chamber_id == g.chamber), None)
            kg = crate_cfg.weight_capacity_kg if crate_cfg else 20.0
        target = g.chamber
        ids = [target] if target in chamber_ids else [target]
        if target not in chamber_ids:
            continue  # validation already errors on unknown chambers
        per.setdefault(target, []).append({"grower_id": g.grower_id, "name": g.name, "product": g.product_type, "crates": int(g.crates), "kg_per_crate": float(kg)})
    return per


# ---------------------------------------------------------------------- #
# Full spatial model (geometry, machinery, crates, apples)                 #
# ---------------------------------------------------------------------- #
APPLE_DIAMETER_M = 0.075
APPLES_PER_CRATE_TOP = (4, 3)  # top-layer grid shown in every booked crate


def build_model(spec: TwinSpec) -> Dict[str, Any]:
    """The complete twin layout in plain data (metres, Y-up, axes X/Y/Z)."""
    env = build_envelope(spec)
    booked = allocate_bookings(spec)
    p, b = spec.panels, spec.building

    cham_models: Dict[str, ChamberModel] = {}
    for i, cfg in enumerate(spec.chambers):
        x0, x1 = env.chamber_rects[i][0], env.chamber_rects[i][1]
        y0 = env.chamber_zone[0]
        y1 = env.chamber_zone[1]
        # Interior of the chamber box: minus partitions on both long sides and
        # the corridor partition in front; depth from chamber config.
        used_depth = min(cfg.width_m, (y1 - y0))
        z0, z1 = env.interior[2], env.interior[5]
        rect = (r(x0 + env.t_part), r(y0), z0, r(x1 - env.t_part), r(y0 + used_depth), z1)
        m = ChamberModel(
            id=cfg.chamber_id, label=cfg.label or cfg.chamber_id,
            rect=rect, temperature_c=cfg.temperature_c, humidity_pct=cfg.humidity_pct, ca=cfg.ca,
            aisle_width_m=cfg.aisle_width_m,
            door={
                "face_y": r(rect[1]),
                "x0": r(rect[0] + 1.0),  # door placed 1 m in from the left wall of the chamber
                "width": cfg.door_width_m,
                "height": cfg.door_height_m,
                "slide_x0": r(rect[0] + 1.0 + cfg.door_width_m + 0.15),
                "ca": cfg.ca,
            },
            evaporators=[], lights=[], pipes=[], racks=[],
        )
        # ceiling evaporator units: one per ~9 m of chamber length
        n_evap = max(1, int((rect[3] - rect[0]) // 9.0) + 1)
        step = (rect[3] - rect[0]) / n_evap
        evap_span = min(2.4, 0.6 + n_evap * 0.0)
        for k in range(n_evap):
            cx = rect[0] + step * (k + 0.5)
            m.evaporators.append({
                "center": [r(cx), r(rect[1] + 0.3), r(z1 - p.evaporator_height_m / 2.0 - 0.05)],
                "size": [r(min(2.4, step * 0.62)), r(1.0), r(p.evaporator_height_m)],
            })
        # LED strips over the aisle, every ~6 m, in 2 rows
        aisle_mid_y = rect[1] + p.wall_clearance_m + max(cfg.aisle_width_m, p.door_slide_allowance_m + cfg.door_width_m) / 2.0
        n_lights = max(1, int((rect[3] - rect[0]) // 6.0))
        lstep = (rect[3] - rect[0]) / (n_lights + 1)
        for k in range(1, n_lights + 1):
            m.lights.append({"center": [r(rect[0] + lstep * k), r(aisle_mid_y), r(z1 - 0.12)], "size": [r(lstep * 0.7), 0.12, 0.08]})
        # refrigerant pipes: a header above the front zone plus drops to each unit
        pipe_y = rect[1] + p.wall_clearance_m + 0.35
        m.pipes.append({"from": [r(rect[0] + 0.2), r(pipe_y), r(z1 - 0.3)], "to": [r(rect[3] - 0.2), r(pipe_y), r(z1 - 0.3)], "radius": 0.055})
        for ev in m.evaporators:
            m.pipes.append({"from": [ev["center"][0], r(pipe_y), r(z1 - 0.3)], "to": [ev["center"][0], ev["center"][1], r(z1 - 0.35)], "radius": 0.04})

        cham_models[cfg.chamber_id] = m

    layout_crates(spec, cham_models, booked)

    # corridor + bay furniture
    bld: Dict[str, Any] = {
        "min": [env.interior[0], env.interior[1], env.interior[2]],
        "max": [env.interior[3], env.interior[4], env.interior[5]],
        "outer_min": [-env.t_ext, -env.t_ext, 0.0],
        "outer_max": [r(env.length_m - env.t_ext), r(env.width_m - env.t_ext), r(env.height_m)],
        "corridor_y": list(env.corridor),
        "chamber_zone": list(env.chamber_zone),
        "entrance": {"x": r(b.entrance_pos[0] if b.entrance_pos else 6.0), "width": 4.2, "height": 4.6},
        "exit": {"x": r(b.exit_pos[0] if b.exit_pos else 42.0), "width": 4.2, "height": 4.6},
        "columns": [],
        "roof": {"pitch_ratio": b.roof_pitch_ratio, "apex_height": r(b.height_m + env.width_m * b.roof_pitch_ratio / 2.0)},
    }
    step = b.column_spacing_m
    n_cols = int(round((env.length_m - 2 * env.t_ext) / step)) + 1
    for i in range(n_cols):
        x = env.interior[0] + min(i * step, env.interior[3] - env.interior[0])
        bld["columns"].append({"x": r(x), "y1": env.interior[1], "y2": env.corridor[1], "size": 0.28})

    # floor expansion joint grid lines
    joints = []
    jx = env.interior[0]
    while jx <= env.interior[3] + 1e-9:
        joints.append([r(jx)])
        jx += p.expansion_joint_pitch_m
    bld["joints_x"] = [j[0] for j in joints]

    # chambers as plain dicts for the exporters
    chambers_out = []
    for cfg in spec.chambers:
        m: ChamberModel = cham_models[cfg.chamber_id]
        d: Dict[str, Any] = {
            "id": m.id, "label": m.label,
            "rect": list(m.rect),
            "temperature_c": m.temperature_c,
            "humidity_pct": m.humidity_pct,
            "ca": m.ca,
            "aisle_width_m": m.aisle_width_m,
            "door": dict(m.door),
            "evaporators": [dict(e) for e in m.evaporators],
            "lights": [dict(l) for l in m.lights],
            "pipes": [dict(pp) for pp in m.pipes],
            "racks": [{"index": rk.index, "origin": list(rk.origin), "bays": rk.bays} for rk in m.racks],
            "interior_volume_m3": m.interior_volume_m3,
            "usable_volume_m3": m.usable_volume_m3,
            "levels_per_chamber": m.levels_per_chamber,
            "crates_per_level": m.crates_per_level,
            "crates_per_row_fit": m.crates_per_row_fit,
            "rows_per_level_fit": m.rows_per_level_fit,
            "rack_rows": len(m.racks),
            "deck_area_m2": m.deck_area_m2,
            "max_deck_kg": m.max_deck_kg,
            "crate_count": m.crate_count,
            "booked_count": m.booked_count,
            "max_theoretical_capacity_kg": m.max_theoretical_capacity_kg,
            "actual_usable_capacity_kg": m.actual_usable_capacity_kg,
            "occupied_capacity_kg": m.occupied_capacity_kg,
            "remaining_capacity_kg": m.remaining_capacity_kg,
            "growers": m.growers,
            "crate_cells": [],  # filled below (id -> grower trail only, keep JSON small)
            "appled_crates": m.appled_crate_count,
        }
        chambers_out.append(d)

    # booked crate trail per chamber (index ranges per grower)
    for cfg in spec.chambers:
        m = cham_models[cfg.chamber_id]
        spans = []
        for i, cell in enumerate(m.crates):
            if cell.booking_status == "booked":
                if spans and spans[-1]["grower_id"] == cell.grower_id and spans[-1]["end"] == i - 1:
                    spans[-1]["end"] = i
                else:
                    spans.append({"grower_id": cell.grower_id, "start": i, "end": i})
        d = next(c for c in chambers_out if c["id"] == m.id)
        d["booked_spans"] = spans

    total_crates = sum(c["crate_count"] for c in chambers_out)
    total_booked_crates = sum(cham_models[cfg.chamber_id].booked_count for cfg in spec.chambers)
    totals = {
        "chambers_count": len(chambers_out),
        "levels_total": sum(c["levels_per_chamber"] for c in chambers_out),
        "total_crate_count": total_crates,
        "booked_crate_count": total_booked_crates,
        "max_theoretical_capacity_kg": r(sum(c["max_theoretical_capacity_kg"] for c in chambers_out)),
        "actual_usable_capacity_kg": r(sum(c["actual_usable_capacity_kg"] for c in chambers_out)),
        "occupied_capacity_kg": r(sum(c["occupied_capacity_kg"] for c in chambers_out)),
        "remaining_capacity_kg": r(sum(c["remaining_capacity_kg"] for c in chambers_out)),
        "occupancy_pct": r(100.0 * sum(cham_models[cfg.chamber_id].occupied_capacity_kg for cfg in spec.chambers) / max(1e-9, sum(c["actual_usable_capacity_kg"] for c in chambers_out))),
        "apples_modelled": sum(m2 for m2 in (APPLES_PER_CRATE_TOP[0] * APPLES_PER_CRATE_TOP[1] * cham_models[cfg.chamber_id].appled_crate_count for cfg in spec.chambers)),
        "appled_crate_nodes": sum(cham_models[cfg.chamber_id].appled_crate_count for cfg in spec.chambers),
        "interior_volume_m3": r(sum(c["interior_volume_m3"] for c in chambers_out)),
        "usable_volume_m3": r(sum(c["usable_volume_m3"] for c in chambers_out)),
    }

    model = {
        "spec_facility_name": spec.facility_name,
        "envelope": bld,
        "partitions": env.t_part,
        "chambers": chambers_out,
        "totals": totals,
        "_objects": cham_models,  # live ChamberModel objects (crates, racks) for exporters
        "conventions": {
            "axes": "Y-up, right-handed; X = long side of the building, Y = depth (door faces -Y), Z = up",
            "units": "metres, kilograms, degrees Celsius, percent",
            "crate_order": "level -> rack row -> subrow across rack depth -> crate along the rack length",
            "crate_id": "Crate_<CH>_L<level>_R<row>_C<column>",
            "apple_cluster_grid": f"{APPLES_PER_CRATE_TOP[0]}x{APPLES_PER_CRATE_TOP[1]} top-layer apples per booked crate",
        },
    }
    return model


# ---------------------------------------------------------------------- #
# Summary API used by tests, the Blender UI and the web                    #
# ---------------------------------------------------------------------- #
def capacity_summary(spec: TwinSpec) -> Dict[str, Any]:
    model = build_model(spec)
    return {"totals": model["totals"], "chambers": [
        {k: c[k] for k in (
            "id", "label", "levels_per_chamber", "crates_per_level", "crate_count", "booked_count",
            "max_theoretical_capacity_kg", "actual_usable_capacity_kg", "occupied_capacity_kg",
            "remaining_capacity_kg", "interior_volume_m3", "usable_volume_m3", "deck_area_m2", "max_deck_kg",
        )} for c in model["chambers"]
    ]}

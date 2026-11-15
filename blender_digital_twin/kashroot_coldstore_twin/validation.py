"""Validation for the KashRoot cold-store twin (Phase 1).

Given a :class:`TwinSpec`, return everything that prevents the geometry
builder from producing a real, walkable store. Every rule checks a
dimension against another dimension the owner supplied - the validator
never invents numbers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .properties import MATERIAL_TYPES, UNIT_MODES, TwinSpec

if TYPE_CHECKING:  # pragma: no cover
    from .properties import ChamberConfig, CrateConfig, RackConfig


@dataclass
class Issue:
    severity: str  # "error" | "warning" | "note"
    subject: str
    message: str


@dataclass
class ValidationResult:
    ok: bool
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    notes: list = field(default_factory=list)

    def add(self, severity: str, subject: str, message: str) -> None:
        attr = {"error": "errors", "warning": "warnings", "note": "notes"}[severity]
        getattr(self, attr).append(Issue(severity, subject, message))

    @property
    def issues(self):
        return self.errors + self.warnings + self.notes


def _pos(name: str, values, result: ValidationResult) -> bool:
    """All values finite and > 0."""
    for i, v in enumerate(values):
        if not isinstance(v, (int, float)) or v != v or v <= 0:
            result.add("error", name, f"Value {i + 1} must be a number greater than 0 (got {v!r}).")
            return False
    return True


def _enable(name: str, values, result: ValidationResult) -> bool:
    """All values finite and >= 0 (clearances may be zero)."""
    for i, v in enumerate(values):
        if not isinstance(v, (int, float)) or v != v or v < 0:
            result.add("error", name, f"Value {i + 1} must be a number >= 0 (got {v!r}).")
            return False
    return True


def validate_spec(spec: TwinSpec) -> ValidationResult:
    """Business + geometric validation of the whole facility spec."""
    res = ValidationResult(ok=True)
    b, p = spec.building, spec.panels
    if not spec.chambers:
        res.add("error", "building.num_chambers", "The store needs at least one chamber.")

    t_ext = b.wall_thickness_m + 2.0 * b.insulation_thickness_m
    if not _pos(
        "building dimensions",
        [b.length_m, b.width_m, b.height_m, b.wall_thickness_m, b.insulation_thickness_m],
        res,
    ):
        return res
    _enable("panel clearances", [
        p.partition_thickness_m, p.slab_thickness_m, p.top_clearance_m,
        p.evaporator_height_m, p.door_slide_allowance_m, p.wall_clearance_m,
        p.crate_gap_m, p.rack_bay_pitch_m, p.crate_stack_slack_m,
    ], res)
    if t_ext >= min(b.length_m, b.width_m):
        res.add("error", "building", "Wall panels fill the whole building — walls are thicker than the building itself.")
    if b.num_chambers != len(spec.chambers) and len(spec.chambers):
        res.add("warning", "building.num_chambers", f"num_chambers={b.num_chambers} but {len(spec.chambers)} chamber configs given; the layouts follow the given beds.")

    if b.insulation_thickness_m <= 0:
        res.add("note", "building.insulation_thickness_m", "No insulated core: this shell is a plain warehouse, not a cold store.")

    # Loading bay / corridor geometry.
    if not _pos("loading bay", [b.loading_bay_width_m, b.loading_bay_length_m], res):
        pass
    elif b.loading_bay_width_m + t_ext + p.partition_thickness_m >= b.width_m - t_ext:
        res.add("error", "building.loading_bay_width_m", "The loading corridor leaves no depth for the chambers.")

    # Trusses, columns etc. just need a positive pitch.
    _pos("building.column_spacing_m", [b.column_spacing_m], res)
    _enable("building.roof_pitch_ratio", [b.roof_pitch_ratio], res)

    # Each chamber against the building envelope.
    interior_l = b.length_m - 2.0 * t_ext
    interior_h = b.height_m - t_ext - p.slab_thickness_m
    n = max(1, len(spec.chambers))
    partition_pitch = (interior_l - (n - 1) * p.partition_thickness_m) / n
    chamber_zone_y0 = 0.0 + b.loading_bay_width_m + p.partition_thickness_m
    chamber_zone_depth = b.width_m - 2.0 * t_ext - b.loading_bay_width_m - p.partition_thickness_m
    for c in spec.chambers:
        validate_chamber(c, p, interior_h, chamber_zone_y0, chamber_zone_depth, partition_pitch, interior_l, res)

    # Bookings cannot exceed what the chambers can actually hold: the engine
    # re-checks each chamber's own totals, so here only global sanity.
    seen = set()
    for c in spec.chambers:
        if c.chamber_id in seen:
            res.add("error", f"chamber {c.chamber_id}", "Duplicate chamber_id.")
        seen.add(c.chamber_id)
        if c.unit_mode not in UNIT_MODES:
            res.add("error", f"chamber {c.chamber_id}.unit_mode", f"unit_mode must be one of {UNIT_MODES}.")
    for g in spec.demo_bookings:
        if not g.grower_id:
            res.add("error", "demo_bookings", "Every booking needs a grower_id.")
        if g.crates < 0:
            res.add("error", f"booking {g.grower_id}", "Booked crates cannot be negative.")
        if g.chamber and g.chamber not in seen:
            res.add("error", f"booking {g.grower_id}", f"Booking points at chamber {g.chamber}, which is not in this store.")
    res.ok = not res.errors
    return res


def validate_chamber(c: "ChamberConfig", p, interior_h: float, zone_y0: float, zone_depth: float, pitch_x: float, interior_l: float, res: ValidationResult) -> None:
    """One chamber against the building it stands in + its own inner setup."""
    cid = c.chamber_id
    if not _pos(f"chamber {cid}", [c.length_m, c.width_m, c.height_m, c.aisle_width_m, c.door_width_m, c.door_height_m], res):
        return
    if c.num_floors < 1:
        res.add("error", f"chamber {cid}.num_floors", "A chamber has at least 1 floor.")
    if not _enable(f"chamber {cid} clearances", [c.rack.level_clearance_m, c.rack.rack_spacing_m], res):
        return
    if not _pos(f"chamber {cid}.rack", [c.rack.rack_length_m, c.rack.rack_width_m, c.rack.rack_height_m], res):
        return
    if c.rack.upright_width_m <= 0:
        res.add("error", f"chamber {cid}.rack.upright_width_m", "Rack uprights need a positive width.")
    if c.rack.floor_load_limit_kg <= 0:
        res.add("error", f"chamber {cid}.rack.floor_load_limit_kg", "Deck load limit must be positive.")
    crate_cfg = c.crate  # local alias
    if not _pos(f"chamber {cid}.crate", [crate_cfg.crate_length_m, crate_cfg.crate_width_m, crate_cfg.crate_height_m, crate_cfg.weight_capacity_kg], res):
        return
    if crate_cfg.crates_per_row < 1 or crate_cfg.rows_per_level < 1:
        res.add("error", f"chamber {cid}.crate packing", "At least 1 crate per row and 1 row per level.")
    if crate_cfg.vertical_stack_limit < 1:
        res.add("error", f"chamber {cid}.crate.vertical_stack_limit", "Stack limit is at least 1.")
    if c.humidity_pct < 30 or c.humidity_pct > 100:
        res.add("warning", f"chamber {cid}.humidity_pct", "Relative humidity is usually kept between 90 and 95% for apple CA stores.")
    if not (-32 <= c.temperature_c <= 15):
        res.add("error", f"chamber {cid}.temperature_c", "Chamber temperature must be between -32 and +15 degC.")
    if crate_cfg.material_type not in MATERIAL_TYPES:
        res.add("error", f"chamber {cid}.crate.material_type", f"material_type must be one of {MATERIAL_TYPES}.")

    # Does the chamber bed fit inside this wing of the building?
    if c.length_m > pitch_x + 1e-9:
        res.add("error", f"chamber {cid}.length_m", f"Bigger than the wing of the building ({pitch_x:.2f} m pitch).")
    if c.width_m > zone_depth + 1e-9:
        res.add("error", f"chamber {cid}.width_m", f"Deeper than the chamber zone of the building ({zone_depth:.2f} m).")
    if c.height_m > interior_h + 1e-9:
        res.add("error", f"chamber {cid}.height_m", f"Higher than the building's clear interior ({interior_h:.2f} m).")
    if c.door_width_m > c.length_m:
        res.add("error", f"chamber {cid}.door_width_m", "Door wider than the chamber.")
    if c.door_height_m > c.height_m:
        res.add("error", f"chamber {cid}.door_height_m", "Door taller than the chamber walls.")

    # The front zone keeps forklift traffic + door-slide pocket clear.
    slide = p.door_slide_allowance_m + c.door_width_m
    front_zone = max(c.aisle_width_m, slide)
    usable_depth = c.width_m - 2.0 * p.wall_clearance_m - front_zone
    usable_len = c.length_m - 2.0 * p.wall_clearance_m
    if c.rack.num_rack_rows > 0:
        if usable_depth <= 0:
            res.add("error", f"chamber {cid}", "The aisle + door-slide clearance leaves no depth for racking.")
        span_needed = c.rack.num_rack_rows * c.rack.rack_width_m + max(0, c.rack.num_rack_rows - 1) * c.rack.rack_spacing_m
        if span_needed > usable_depth + 1e-9:
            res.add("error", f"chamber {cid}.rack.num_rack_rows", f"{c.rack.num_rack_rows} rows x {c.rack.rack_width_m} m + {c.rack.rack_spacing_m} m spacing need {span_needed:.2f} m, the chamber has {usable_depth:.2f} m behind the aisle.")
        if usable_len <= 0:
            res.add("error", f"chamber {cid}", "Wall clearance leaves no length for racking.")
        elif c.rack.rack_length_m > usable_len + 1e-9:
            res.add("warning", f"chamber {cid}.rack.rack_length_m", f"Rack longer than usable room ({usable_len:.2f} m); it is trimmed to fit.")
    # Rack of crates: last level must clear the ceiling.
    payload_pitch = c.crate.crate_height_m + c.rack.level_clearance_m
    levels_cap = int((c.height_m - p.top_clearance_m - p.evaporator_height_m) // payload_pitch)
    if c.rack.num_levels > levels_cap:
        res.add("error", f"chamber {cid}.rack.num_levels", f"{c.rack.num_levels} levels of {c.crate.crate_height_m} m + clearance need more stack height than the chamber keeps after the evaporator band ({levels_cap} levels fit).")
    if c.crate.crate_height_m + c.rack.level_clearance_m > c.rack.rack_height_m / max(1, c.rack.num_levels):
        res.add("warning", f"chamber {cid}.rack_height_m", "The rack is too short for the levels asked; shorter racks are built.")
    # Fit of one crate between uprights / beams.
    crate_pitch = c.crate.crate_length_m + p.crate_gap_m if c.crate.crate_length_m >= c.crate.crate_width_m else c.crate.crate_width_m + p.crate_gap_m
    across_pitch = c.crate.crate_width_m + p.crate_gap_m if c.crate.crate_length_m >= c.crate.crate_width_m else c.crate.crate_length_m + p.crate_gap_m
    fit_along = int((c.rack.rack_length_m - 2.0 * c.rack.upright_width_m) // crate_pitch)
    fit_across = int((c.rack.rack_width_m - 2.0 * c.rack.upright_width_m) // across_pitch)
    if fit_along < 1 or fit_across < 1:
        res.add("error", f"chamber {cid}.crate", "One crate does not fit inside a bay between the uprights — check the crate size against the rack.")
        return
    if c.crate.crates_per_row > fit_along or c.crate.rows_per_level > fit_across:
        res.add("note", f"chamber {cid}.crate", f"Asked {c.crate.crates_per_row}x{c.crate.rows_per_level}; the rack fits {fit_along}x{fit_across} per level — the engine counts what fits.")

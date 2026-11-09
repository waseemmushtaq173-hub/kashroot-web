"""KashRoot Cold-Store Digital Twin - shared parameter model.

Phase 1 of the KashRoot Blender twin: one source of truth for every
dimension of the building, its refrigerated chambers, the pallet racking
and the apple crates. The same dataclasses feed:

  * the Blender UI (bpy ``PropertyGroup`` collections under
    ``VIEW_3D > UI > KashRoot Twin``), defined at the bottom of this file
    and only registered when ``bpy`` is importable,
  * the headless capacity engine and the GLB/metadata exporter,
  * the JSON spec files written by (or for) the Cold Storage owner.

All lengths are metres, weights kilograms, temperatures degrees Celsius,
humidity percent, colours linear RGBA 0-1. Nothing is read from the
network and nothing is hard-coded that the owner can supply.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, fields
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:  # Blender is optional: the headless pipeline runs on plain Python.
    import bpy  # type: ignore
    import rna_prop_ui  # type: ignore  # noqa: F401  (kept so `bpy.props` is resolved)
except Exception:  # pragma: no cover - executed only when bpy is missing
    bpy = None


SCHEMA_VERSION = "1.0"
SCHEMA_NAME = "kashroot_coldstore_twin.schema"

# Every material_type the crate builder can turn into meshes.
MATERIAL_TYPES = ("HDPE_PLASTIC", "WOODEN_BIN")
UNIT_MODES = ("CRATES", "BINS")


@dataclass
class BuildingConfig:
    """The shell of the store: outer dimensions, insulated panel build-up."""

    length_m: float = 48.0
    width_m: float = 26.0
    height_m: float = 9.0
    wall_thickness_m: float = 0.2
    insulation_thickness_m: float = 0.1
    column_spacing_m: float = 6.0
    roof_pitch_ratio: float = 0.08
    num_chambers: int = 4
    loading_bay_length_m: float = 47.2
    loading_bay_width_m: float = 6.5
    entrance_pos: Tuple[float, float] = (6.0, 0.0)
    exit_pos: Tuple[float, float] = (42.0, 0.0)


@dataclass
class PanelConfig:
    """Insulated partition panels, concrete slab, corrugation and joints."""

    partition_thickness_m: float = 0.12
    slab_thickness_m: float = 0.25
    corrugation_pitch_m: float = 0.28
    corrugation_depth_m: float = 0.02
    expansion_joint_pitch_m: float = 6.0
    expansion_joint_width_m: float = 0.02
    top_clearance_m: float = 0.45
    evaporator_height_m: float = 0.9
    door_slide_allowance_m: float = 0.15
    wall_clearance_m: float = 0.3
    crate_gap_m: float = 0.02
    rack_bay_pitch_m: float = 1.2
    crate_stack_slack_m: float = 0.05


@dataclass
class StagingConfig:
    """Crate staging (stacked on pallets) in the loading corridor."""

    pallet_length_m: float = 1.2
    pallet_width_m: float = 1.0
    stack_rows: int = 2
    stack_gap_m: float = 0.35
    edge_clearance_m: float = 0.5


@dataclass
class RackConfig:
    """Structural steel pallet racking, one system shared by the chamber."""

    rack_length_m: float = 9.6
    rack_width_m: float = 2.0
    rack_height_m: float = 7.0
    num_rack_rows: int = 3
    num_levels: int = 12
    level_clearance_m: float = 0.1
    rack_spacing_m: float = 1.4
    floor_load_limit_kg: float = 1500
    upright_width_m: float = 0.1


@dataclass
class CrateConfig:
    """One storage crate or bulk bin: size, rating, packing pattern."""

    crate_length_m: float = 0.6
    crate_width_m: float = 0.4
    crate_height_m: float = 0.33
    weight_capacity_kg: float = 20.0
    crates_per_row: int = 15
    rows_per_level: int = 4
    vertical_stack_limit: int = 3
    material_type: str = "HDPE_PLASTIC"
    base_color: Tuple[float, float, float, float] = (0.72, 0.16, 0.14, 1.0)


@dataclass
class ChamberConfig:
    """One refrigerated chamber and what stands inside it."""

    chamber_id: str = "CH01"
    label: str = "Chamber 1"
    length_m: float = 11.5
    width_m: float = 17.5
    height_m: float = 8.2
    temperature_c: float = -0.5
    humidity_pct: float = 92.0
    ca: bool = True
    num_floors: int = 1
    aisle_width_m: float = 3.5
    door_width_m:  float = 3.2
    door_height_m: float = 4.0
    max_load_capacity_kg: float = 60000.0
    unit_mode: str = "CRATES"
    rack: RackConfig = field(default_factory=RackConfig)
    crate: CrateConfig = field(default_factory=CrateConfig)


@dataclass
class GrowerBooking:
    """Booked crates allocated to one grower (from store records, not invented)."""

    grower_id: str = "GRW-000"
    name: str = ""
    product_type: str = "Apple"
    crates: int = 0
    chamber: Optional[str] = None
    weight_per_crate_kg: Optional[float] = None  # None = the crate's rated capacity


@dataclass
class TwinSpec:
    """The whole facility: building, panels, staging, chambers, bookings."""

    schema_version: str = SCHEMA_VERSION
    facility_name: str = "KashRoot Cold Store"
    building: BuildingConfig = field(default_factory=BuildingConfig)
    panels: PanelConfig = field(default_factory=PanelConfig)
    staging: StagingConfig = field(default_factory=StagingConfig)
    chambers: List[ChamberConfig] = field(default_factory=list)
    demo_bookings: List[GrowerBooking] = field(default_factory=list)

    # ---------------------------------------------------------------- #
    # Serialisation                                                     #
    # ---------------------------------------------------------------- #
    def to_dict(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "$schema": f"{SCHEMA_NAME}/{SCHEMA_VERSION}",
            "facility_name": self.facility_name,
            "building": _dump(self.building),
            "panels": _dump(self.panels),
            "staging": _dump(self.staging),
            "chambers": [_dump(c) for c in self.chambers],
            "demo_bookings": [_dump(g) for g in self.demo_bookings],
        }
        return out

    @classmethod
    def from_dict(cls, raw: Dict[str, Any]) -> "TwinSpec":
        b = dict(raw.get("building") or {})
        p = dict(raw.get("panels") or {})
        s = dict(raw.get("staging") or {})
        cs = [_chamber(c) for c in (raw.get("chambers") or [])]
        gs = [_grower(g) for g in (raw.get("demo_bookings") or [])]
        return cls(
            schema_version=str(raw.get("$schema", "")).split("/")[-1] or SCHEMA_VERSION,
            facility_name=str(raw.get("facility_name") or "KashRoot Cold Store"),
            building=_fill(BuildingConfig, b),
            panels=_fill(PanelConfig, p),
            staging=_fill(StagingConfig, s),
            chambers=cs,
            demo_bookings=gs,
        )

    @classmethod
    def from_json_file(cls, path: str) -> "TwinSpec":
        with open(path, "r", encoding="utf-8") as fh:
            return cls.from_dict(json.load(fh))

    def to_json_file(self, path: str) -> None:
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(self.to_dict(), fh, indent=2, ensure_ascii=False)
            fh.write("\n")


def _dump(obj: Any) -> Dict[str, Any]:
    """Dataclass -> plain dict (recursing nested dataclasses, tuples as lists)."""
    out: Dict[str, Any] = {}
    for f in fields(obj):  # type: ignore[arg-type]
        v = getattr(obj, f.name)
        if hasattr(v, "__dataclass_fields__"):
            out[f.name] = _dump(v)
        elif isinstance(v, (list, tuple)):
            out[f.name] = [_dump(x) if hasattr(x, "__dataclass_fields__") else (list(x) if isinstance(x, tuple) else x) for x in v]
        else:
            out[f.name] = v
    return out


def _fill(cls: type, raw: Dict[str, Any]) -> Any:
    """Build a dataclass from a dict, ignoring unknown keys."""
    names = {f.name for f in fields(cls)}  # type: ignore[arg-type]
    kwargs = {}
    for k, v in (raw or {}).items():
        if k in names:
            kwargs[k] = v
    return cls(**kwargs)


def _chamber(raw: Any) -> ChamberConfig:
    c = _fill(ChamberConfig, raw or {})
    c.rack = _fill(RackConfig, (raw or {}).get("rack") or {})
    c.crate = _fill(CrateConfig, (raw or {}).get("crate") or {})
    if c.crate.material_type not in MATERIAL_TYPES:
        c.crate.material_type = "HDPE_PLASTIC"
    if c.unit_mode not in UNIT_MODES:
        c.unit_mode = "CRATES"
    return c


def _grower(raw: Any) -> GrowerBooking:
    g = _fill(GrowerBooking, raw or {})
    return g


def example_spec() -> TwinSpec:
    """A ready-to-run spec: one chamber of the reference facility shape."""
    spec = TwinSpec(
        facility_name="KashRoot Example Store",
        building=BuildingConfig(num_chambers=1),
        panels=PanelConfig(),
        staging=StagingConfig(),
        chambers=[ChamberConfig(chamber_id="CH01", label="Example chamber")],
    )
    return spec


# ---------------------------------------------------------------------- #
# Blender UI (registered only when bpy is available)                       #
# ---------------------------------------------------------------------- #
_KRT_PREFIX = "krt_"


def _bl(i: float) -> float:
    """Blender's UI keeps one decimal in most fields; doubled precision here."""
    return float(i)


class _PgBase:  # pragma: no cover - bpy-only helpers
    """Mixin: read a bpy PropertyGroup back into a plain dict."""

    def to_data(self) -> Dict[str, Any]:
        def val(v: Any) -> Any:
            try:
                if hasattr(v, "to_list"):
                    return list(v.to_list())
            except Exception:
                pass
            return v

        out = {}
        for k in dir(self):
            if k.endswith(".enum_items_static") or not any(m == k.split(".") for m in ("bl_rna",)):
                pass
        for prop in self.bl_rna.properties:  # type: ignore[attr-defined]
            ident = prop.identifier
            if ident in ("rna_type", "name"):
                continue
            out[ident] = val(getattr(self, ident))
        return out


def register_bpy_ui() -> None:  # pragma: no cover - runs inside Blender only
    """Define and register all PropertyGroups used by the Blender UI."""
    if bpy is None:
        raise RuntimeError("register_bpy_ui() requires Blender.")

    props = bpy.props

    class BuildingProps(_PgBase):
        length_m: "Any" = props.FloatProperty(name="Length", default=48.0, min=2.0, max=400.0, unit="LENGTH", description="Building length (X), metres")
        width_m: "Any" = props.FloatProperty(name="Width", default=26.0, min=2.0, max=400.0, unit="LENGTH", description="Building width (Y), metres")
        height_m: "Any" = props.FloatProperty(name="Height", default=9.0, min=2.0, max=60.0, unit="LENGTH", description="Building height (Z), metres")
        wall_thickness_m: "Any" = props.FloatProperty(name="Wall thickness", default=0.2, min=0.05, max=2.0, unit="LENGTH", description="Structural panel skin thickness, metres")
        insulation_thickness_m: "Any" = props.FloatProperty(name="PUF insulation", default=0.1, min=0.0, max=2.0, unit="LENGTH", description="Insulated PUF core per face, metres")
        num_chambers: "Any" = props.IntProperty(name="Chambers", default=4, min=1, max=24, description="Refrigerated chambers side by side")
        loading_bay_length_m: "Any" = props.FloatProperty(name="Loading bay length", default=47.2, min=1.0, max=400.0, unit="LENGTH")
        loading_bay_width_m: "Any" = props.FloatProperty(name="Loading bay depth", default=6.5, min=1.0, max=100.0, unit="LENGTH")
        entrance_x: "Any" = props.FloatProperty(name="Entrance X", default=6.0, min=0.0, max=400.0, unit="LENGTH")
        exit_x: "Any" = props.FloatProperty(name="Exit X", default=42.0, min=0.0, max=400.0, unit="LENGTH")

    class PanelProps(_PgBase):
        partition_thickness_m: "Any" = props.FloatProperty(name="Partition thickness", default=0.12, min=0.02, max=1.0, unit="LENGTH")
        slab_thickness_m: "Any" = props.FloatProperty(name="Slab thickness", default=0.25, min=0.05, max=2.0, unit="LENGTH")
        corrugation_pitch_m: "Any" = props.FloatProperty(name="Corrugation pitch", default=0.28, min=0.02, max=2.0, unit="LENGTH")
        expansion_joint_pitch_m: "Any" = props.FloatProperty(name="Expansion joint pitch", default=6.0, min=0.5, max=30.0, unit="LENGTH")

    class ChamberIndexProps(_PgBase):
        index: "Any" = props.IntProperty(name="Chamber", default=0, options={"HIDDEN"})

    class RackProps(_PgBase):
        rack_length_m: "Any" = props.FloatProperty(name="Rack length", default=9.6, min=0.5, unit="LENGTH")
        rack_width_m: "Any" = props.FloatProperty(name="Rack depth", default=2.0, min=0.5, unit="LENGTH")
        rack_height_m: "Any" = props.FloatProperty(name="Rack height", default=7.0, min=0.5, max=40.0, unit="LENGTH")
        num_rack_rows: "Any" = props.IntProperty(name="Rack rows", default=3, min=0, max=40)
        num_levels: "Any" = props.IntProperty(name="Levels", default=12, min=1, max=40)
        level_clearance_m: "Any" = props.FloatProperty(name="Level clearance", default=0.1, min=0.0, max=2.0, unit="LENGTH")
        rack_spacing_m: "Any" = props.FloatProperty(name="Row spacing", default=1.4, min=0.0, max=20.0, unit="LENGTH")
        floor_load_limit_kg: "Any" = props.FloatProperty(name="Deck load limit", default=1500.0, min=1.0, unit="MASS")
        upright_width_m: "Any" = props.FloatProperty(name="Upright width", default=0.1, min=0.02, max=1.0, unit="LENGTH")

    class CrateProps(_PgBase):
        crate_length_m: "Any" = props.FloatProperty(name="Crate length", default=0.6, min=0.05, unit="LENGTH")
        crate_width_m: "Any" = props.FloatProperty(name="Crate width", default=0.4, min=0.05, unit="LENGTH")
        crate_height_m: "Any" = props.FloatProperty(name="Crate height", default=0.33, min=0.05, unit="LENGTH")
        weight_capacity_kg: "Any" = props.FloatProperty(name="Capacity (kg)", default=20.0, min=0.1, unit="MASS")
        crates_per_row: "Any" = props.IntProperty(name="Crates / row", default=15, min=1, max=60)
        rows_per_level: "Any" = props.IntProperty(name="Rows / level", default=4, min=1, max=30)
        vertical_stack_limit: "Any" = props.IntProperty(name="Stack limit", default=3, min=1, max=30)
        material_type: "Any" = props.EnumProperty(name="Material", items=[(t, t.replace("_", " ").title(), "") for t in MATERIAL_TYPES])
        base_color: "Any" = props.FloatVectorProperty(name="Base colour", size=4, default=(0.72, 0.16, 0.14, 1.0), min=0.0, max=1.0, subtype="COLOR")

    class ChamberProps(_PgBase):
        chamber_id: "Any" = props.StringProperty(name="Id", default="CH01")
        label: "Any" = props.StringProperty(name="Label", default="Chamber")
        length_m: "Any" = props.FloatProperty(name="Length", default=11.5, min=2.0, unit="LENGTH")
        width_m: "Any" = props.FloatProperty(name="Width", default=17.5, min=2.0, unit="LENGTH")
        height_m: "Any" = props.FloatProperty(name="Height", default=8.2, min=2.0, max=40.0, unit="LENGTH")
        temperature_c: "Any" = props.FloatProperty(name="Temperature", default=-0.5, min=-32.0, max=15.0, description="Degrees Celsius")
        humidity_pct: "Any" = props.FloatProperty(name="Humidity", default=92.0, min=30.0, max=100.0, description="Relative humidity, %")
        ca: "Any" = props.BoolProperty(name="CA chamber", default=True)
        num_floors: "Any" = props.IntProperty(name="Floors", default=1, min=1, max=10)
        aisle_width_m: "Any" = props.FloatProperty(name="Aisle width", default=3.5, min=0.0, max=20.0, unit="LENGTH")
        door_width_m: "Any" = props.FloatProperty(name="Door width", default=3.2, min=0.4, unit="LENGTH")
        door_height_m: "Any" = props.FloatProperty(name="Door height", default=4.0, min=0.8, unit="LENGTH")
        max_load_capacity_kg: "Any" = props.FloatProperty(name="Chamber load cap", default=60000.0, min=0.0, unit="MASS")
        unit_mode: "Any" = props.EnumProperty(name="Unit mode", items=[(m, m.title(), "") for m in UNIT_MODES])
        rack: "Any" = props.PointerProperty(type=RackProps)
        crate: "Any" = props.PointerProperty(type=CrateProps)

    class SceneProps(_PgBase):
        facility_name: "Any" = props.StringProperty(name="Facility", default="KashRoot Cold Store")
        building: "Any" = props.PointerProperty(type=BuildingProps)
        panels: "Any" = props.PointerProperty(type=PanelProps)
        chambers: "Any" = props.CollectionProperty(type=ChamberProps, name="Chambers")
        active_chamber: "Any" = props.IntProperty(name="Active chamber", default=0, min=0)
        cutaway: "Any" = props.BoolProperty(name="Cutaway mode", default=False)
        transparent_walls: "Any" = props.BoolProperty(name="Transparent walls", default=False)
        isolated_floor: "Any" = props.StringProperty(name="Isolated floor", default="")
        grower_id: "Any" = props.StringProperty(name="Grower", default="")
        grower_mode: "Any" = props.BoolProperty(name="Grower inspection", default=False)

    for cls in (BuildingProps, PanelProps, ChamberIndexProps, RackProps, CrateProps, ChamberProps, SceneProps):
        bpy.utils.register_class(cls)
    bpy.types.Scene.kashroot_twin = props.PointerProperty(type=SceneProps)
    return None


def unregister_bpy_ui() -> None:  # pragma: no cover - runs inside Blender only
    if bpy is None:
        return
    scene_props = getattr(bpy.types.Scene, "kashroot_twin", None)
    if scene_props is not None:
        try:
            bpy.utils.unregister_class(scene_props.rna_type)
            del bpy.types.Scene.kashroot_twin
        except Exception:
            pass


def scene_props_to_dict(scene: "Any") -> Dict[str, Any]:  # pragma: no cover
    """Pull the Blender sidebar values into a headless-compatible dict."""
    if bpy is None or not hasattr(scene, "kashroot_twin"):
        return {}
    sp = scene.kashroot_twin
    spec: Dict[str, Any] = {
        "facility_name": sp.facility_name,
        "building": sp.building.to_data(),
        "panels": sp.panels.to_data(),
        "chambers": [],
        "demo_bookings": [],
    }
    spec["building"]["entrance_pos"] = [sp.building.entrance_x, 0.0]
    spec["building"]["exit_pos"] = [sp.building.exit_x, 0.0]
    b = spec["building"]
    b.pop("entrance_x", None)
    b.pop("exit_x", None)
    for ch in sp.chambers:
        raw = ch.to_data()
        raw["rack"] = ch.rack.to_data()
        raw["crate"] = ch.crate.to_data()
        spec["chambers"].append(raw)
    return spec

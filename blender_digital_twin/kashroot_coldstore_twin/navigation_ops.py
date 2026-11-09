"""Viewport navigation for the KashRoot twin (Phase 8, bpy-only).

Operators + sidebar panel (``VIEW_3D > UI > KashRoot Twin``) driving the
four viewer behaviours the web twin offers:

* **Cutaway**         — hides the roof/ridge/gutters so the rack field
  and crate levels are readable from above
* **Transparent walls** — turns PUF panels, partitions and CA doors
  translucent in the viewport (material-level restore on toggle)
* **Enter chamber**   — frames the selected chamber's aisle from the
  doorway, tracking along the engine's +Y depth axis
* **Floor filter**    — isolates one crate level (or "all") by hiding
  the crates of the other levels

State (original material/alpha values, hidden roof pieces) is stored as
custom properties on the touched datablocks, so repeated toggles and
file round-trips stay consistent. Grower highlighting lives in
``grower_mode`` and is invoked from the same panel.
"""
from __future__ import annotations

import json
import math
import os
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:  # Blender is optional; module is *used* only inside Blender.
    import bpy  # type: ignore
except Exception:  # pragma: no cover - executed only when bpy is missing
    bpy = None

from .geometry_builder import ROOT_COLL, _materials

_TRANSLUCENT_KEYS = ("puf_panel_out", "puf_panel_in", "partition_panel", "ca_door", "glass_port", "wire_mesh")
_ROOF_KINDS = ("roof", "gutter")
_ALPHA = 0.22


def _props(context: "Any") -> Any:
    return getattr(context.scene, "kashroot_twin", None)


def _root_coll(context: "Any") -> Any:
    return bpy.data.collections.get(ROOT_COLL)


def _kind_objects(context: "Any", kinds: Sequence[str]) -> List[Any]:
    root = _root_coll(context)
    if root is None:
        return []
    return [o for o in root.all_objects if o.get("krt_kind") in kinds]


# ---------------------------------------------------------------------- #
# Operators                                                               #
# ---------------------------------------------------------------------- #
class KRT_OT_cutaway(bpy.types.Operator):  # pragma: no cover - bpy only
    """Toggle the twin's cutaway: hide roof, ridge and gutters."""

    bl_idname = "krt.cutaway_toggle"
    bl_label = "Cutaway"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context: Any) -> Any:  # pragma: no cover - bpy only
        sp = _props(context)
        if sp is None:
            return {"CANCELLED"}
        sp.cutaway = not sp.cutaway
        # hide/show roof pieces; remember what we hid
        wm = context.window_manager
        hidden = [n for n in (wm.get("krt_hidden") or "").split("|") if n]
        for obj in _kind_objects(context, _ROOF_KINDS):
            if sp.cutaway:
                if any(obj.name.startswith(tag) for tag in ("KRT_Roof_", "KRT_Ridge", "KRT_Gutter_")):
                    obj.hide_viewport = True
                    if obj.name not in hidden:
                        hidden.append(obj.name)
            else:
                obj.hide_viewport = False
        for name in list(hidden):
            obj = bpy.data.objects.get(name)
            if obj is not None and not sp.cutaway:
                obj.hide_viewport = False
        if not sp.cutaway:
            hidden = []
        wm["krt_hidden"] = "|".join(hidden)
        return {"FINISHED"}


class KRT_OT_transparent_walls(bpy.types.Operator):  # pragma: no cover - bpy only
    """Toggle translucent PUF panels / partitions / CA doors."""

    bl_idname = "krt.transparent_walls_toggle"
    bl_label = "Transparent walls"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Any) -> bool:  # pragma: no cover - bpy only
        return _props(context) is not None

    def execute(self, context: Any) -> Any:  # pragma: no cover - bpy only
        sp = _props(context)
        if sp is None:
            return {"CANCELLED"}
        sp.transparent_walls = not sp.transparent_walls
        mats = _materials()
        for key in _TRANSLUCENT_KEYS:
            mat = mats.get(key)
            if mat is None or not mat.use_nodes:
                continue
            bsdf = next((s.node for s in mat.node_tree.nodes if s.node.type == "BSDF_PRINCIPLED" and False), None)
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                continue
            alpha = bsdf.inputs["Alpha"]
            if sp.transparent_walls:
                if "krt_alpha0" not in mat:
                    mat["krt_alpha0"] = float(alpha.default_value)
                alpha.default_value = _ALPHA
                mat.blend_method = "BLEND"
            else:
                alpha.default_value = float(mat.get("krt_alpha0", 1.0))
                mat.blend_method = "OPAQUE"
        return {"FINISHED"}


class KRT_OT_enter_chamber(bpy.types.Operator):  # pragma: no cover - bpy only
    """Fly the viewport into the selected chamber's aisle."""

    bl_idname = "krt.enter_chamber"
    bl_label = "Enter chamber"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Any) -> bool:  # pragma: no cover - bpy only
        if _props(context) is None:
            return False
        return bool([c for c in (bpy.data.collections.get(ROOT_COLL).children if ROOT_COLL and bpy.data.collections.get(ROOT_COLL) else []) if c.name.startswith("KRT_CH")]) or bool(_chamber_colls(context))

    def execute(self, context: Any) -> Any:  # pragma: no cover - bpy only
        colls = _chamber_colls(context)
        if not colls:
            self.report({"WARNING"}, "Build the facility first (KashRoot Twin > Build).")
            return {"CANCELLED"}
        sp = _props(context)
        idx = max(0, min(sp.active_chamber, len(colls) - 1))
        cid = colls[idx].name.replace("KRT_", "")
        meta = _chamber_meta(cid)
        if meta is None:
            self.report({"WARNING"}, f"No engine metadata for chamber {cid}.")
            return {"CANCELLED"}
        rect = meta["rect"]
        from mathutils import Vector  # type: ignore

        for area in context.screen.areas:
            if area.type == "VIEW_3D":
                region = next((r for r in area.regions if r.type == "WINDOW"), None)
                rv3d = area.spaces.active.region_3d
                if region is None or rv3d is None:
                    continue
                target = Vector((rect[0] + (rect[3] - rect[0]) / 2.0, rect[1] + 2.5, 1.7))
                # look deeper into the chamber (+Y = rack rows, away from doors)
                direction = Vector((0.0, 1.0, -0.18)).normalized()
                rv3d.view_location = target
                rv3d.view_distance = 9.0
                rv3d.view_rotation = direction.to_track_quat("-Z", "Y")
                area.tag_redraw()
                sp.isolated_floor = sp.isolated_floor  # keep floor filter state
                return {"FINISHED"}
        return {"CANCELLED"}


class KRT_OT_floor_filter(bpy.types.Operator):  # pragma: no cover - bpy only
    """Isolate one crate level (0 = all)."""

    bl_idname = "krt.floor_filter"
    bl_label = "Filter floor level"
    bl_options = {"REGISTER", "UNDO"}

    level: "Any" = bpy.props.IntProperty(name="Level", default=0, min=0, max=40,  # type: ignore
                                         description="Crate level to isolate; 0 shows all")

    @classmethod
    def poll(cls, context: Any) -> bool:  # pragma: no cover - bpy only
        return _props(context) is not None

    def execute(self, context: Any) -> Any:  # pragma: no cover - bpy only
        sp = _props(context)
        if sp is None:
            return {"CANCELLED"}
        sp.isolated_floor = "" if self.level <= 0 else f"L{self.level:02d}"
        root = _root_coll(context)
        if root is None:
            return {"CANCELLED"}
        for obj in root.all_objects:
            kind = obj.get("krt_kind")
            if kind not in ("crate", "apples"):
                continue
            cell_level = int(obj.get("krt_level", 0) or 0)
            obj.hide_viewport = self.level > 0 and cell_level != self.level
        return {"FINISHED"}


class KRT_OT_reset_view(bpy.types.Operator):  # pragma: no cover - bpy only
    """Restore opaque walls, unhide the roof, show every level, leave grower mode."""

    bl_idname = "krt.reset_view"
    bl_label = "Reset viewer"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Any) -> bool:  # pragma: no cover - bpy only
        return _props(context) is not None

    def execute(self, context: Any) -> Any:  # pragma: no cover - bpy only
        sp = _props(context)
        if sp is None:
            return {"CANCELLED"}
        sp.cutaway = False
        if sp.transparent_walls:
            bpy.ops.krt.transparent_walls_toggle()
        sp.isolated_floor = ""
        bpy.ops.krt.grower_clear()
        root = _root_coll(context)
        if root is not None:
            for obj in root.all_objects:
                if obj.get("krt_kind") in ("crate", "apples", "roof", "gutter"):
                    obj.hide_viewport = False
        return {"FINISHED"}


def _chamber_colls(context: Any) -> List[Any]:  # pragma: no cover - bpy only
    root = _root_coll(context)
    if root is None:
        return []
    return sorted([c for c in root.children if c.name.startswith("KRT_CH")], key=lambda c: c.name)


def _chamber_meta(chamber_id: str) -> Optional[Dict[str, Any]]:  # pragma: no cover - bpy only
    """Chamber rect from the metadata JSON shipped beside the GLB."""
    here = os.path.dirname(os.path.abspath(__file__))
    meta_path = os.path.join(here, "..", "..", "public", "models", "kashroot_coldstore_metadata.json")
    try:
        with open(meta_path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:
        return None
    for ch in data.get("chambers", []):
        if ch.get("id") == chamber_id:
            return ch
    return None


# ---------------------------------------------------------------------- #
# Panels                                                                  #
# ---------------------------------------------------------------------- #
class KRT_PT_main(bpy.types.Panel):  # type: ignore[misc]
    bl_label = "KashRoot Twin"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "KashRoot Twin"

    def draw(self, context: Any) -> None:  # pragma: no cover - bpy only
        sp = _props(context)
        layout = self.layout
        if sp is None:
            layout.label(text="Headless twin: Blender UI not registered")
            return
        root = _root_coll(context)
        colls = _chamber_colls(context)
        layout.prop(sp, "active_chamber", text="Chamber", slider=True) if colls else None
        row = layout.row()
        row.operator("krt.cutaway_toggle", text="Cutaway", icon="MESH_GRID")
        row.prop(sp, "cutaway", text="")
        row = layout.row()
        row.operator("krt.transparent_walls_toggle", text="Transparent walls", icon="TRANSPARENT")
        row.prop(sp, "transparent_walls", text="")
        layout.operator("krt.enter_chamber", icon="VIEW_CAMERA")
        row = layout.row(align=True)
        row.prop(sp, "isolated_floor", text="Level")
        row = layout.row(align=True)
        row.operator("krt.floor_filter", text="Isolate level").level = int("".join(ch for ch in sp.isolated_floor if ch.isdigit()) or 0)
        layout.operator("krt.reset_view", icon="LOOP_BACK")
        if root is None:
            layout.operator("krt.build_facility", icon="MESH_DATA", text="Build facility")
        else:
            layout.operator("krt.build_facility", icon="FILE_REFRESH", text="Rebuild facility")
        layout.separator()
        layout.label(text=f"Grower inspection: {sp.grower_id or '—'}")
        layout.prop(sp, "grower_id", text="Grower")
        row = layout.row(align=True)
        row.operator("krt.grower_apply", icon="RESTRICT_COLOR_ON", text="Apply")
        row.operator("krt.grower_clear", icon="RESTRICT_COLOR_OFF", text="Clear")


class KRT_PT_crate_info(bpy.types.Panel):  # type: ignore[misc]
    """Live crate info of the selected object (mirrors the web info drawer)."""

    bl_label = "Crate info"
    bl_idname = "KRT_PT_crate_info"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "KashRoot Twin"

    def draw(self, context: Any) -> None:  # pragma: no cover - bpy only
        layout = self.layout
        obj = context.object
        if obj is None or obj.get("krt_kind") != "crate":
            layout.label(text="Select a crate to inspect")
            return
        for label, key in (
            ("Cell", "krt_cell_id"), ("Chamber", "krt_chamber"), ("Level", "krt_level"),
            ("Row / Seat", "krt_row"), ("Sub-row", "krt_subrow"), ("Column", "krt_col"),
            ("Grower", "krt_grower"), ("Status", "krt_status"), ("Product", "krt_product"),
            ("Capacity (kg)", "krt_kg_cap"), ("Occupied (kg)", "krt_kg_occupied"),
            ("Available (kg)", "krt_kg_available"),
        ):
            v = obj.get(key)
            if v in (None, ""):
                continue
            row = layout.row()
            row.label(text=label)
            row.label(text=str(v))


CLASSES: Tuple[Any, ...] = ()
if bpy is not None:  # pragma: no cover - bpy only
    CLASSES = (
        KRT_OT_cutaway,
        KRT_OT_transparent_walls,
        KRT_OT_enter_chamber,
        KRT_OT_floor_filter,
        KRT_OT_reset_view,
        KRT_PT_main,
        KRT_PT_crate_info,
    )


def register() -> None:  # pragma: no cover - bpy only
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister() -> None:  # pragma: no cover - bpy only
    for cls in tuple(reversed(CLASSES)):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass

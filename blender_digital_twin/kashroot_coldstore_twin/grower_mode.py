"""Grower inspection mode for the KashRoot twin (Phase 8, bpy-only).

Highlights every crate booked to one grower (green), dims the rest, and
mirrors exactly the web twin's grower mode: the affected set is derived
from the engine's own booking data (`krt_status` / `krt_grower` custom
properties stamped on every crate object by ``geometry_builder``).

Reversibility: before the first tint each crate stores its original
material name in ``krt_mat0`` so ``krt.grower_clear`` (and the panel's
"Clear" button) restores the PBR palette exactly.
"""
from __future__ import annotations

from typing import Any, List, Optional

try:  # Blender is optional; module is *used* only inside Blender.
    import bpy  # type: ignore
except Exception:  # pragma: no cover - executed only when bpy is missing
    bpy = None

from .geometry_builder import ROOT_COLL, _materials

_GROW = "highlight_free"     # crates booked to the inspected grower
_DIM = "dim_free"            # everything else while the mode is on


def _props(context: Any) -> Any:
    return getattr(context.scene, "kashroot_twin", None)


def _crates(context: Any) -> List[Any]:  # pragma: no cover - bpy only
    root = bpy.data.collections.get(ROOT_COLL)
    if root is None:
        return []
    return [o for o in root.all_objects if o.get("krt_kind") == "crate"]


def _saved_name(obj: Any) -> str:  # pragma: no cover - bpy only
    """Original material name (stamped once, before any tinting)."""
    saved = obj.get("krt_mat0")
    if saved is None:
        current = ""
        try:
            if obj.material_slots and obj.material_slots[0].material:
                current = obj.material_slots[0].material.name
        except Exception:
            current = ""
        obj["krt_mat0"] = current
        saved = current
    return str(saved)


class KRT_OT_grower_apply(bpy.types.Operator):  # pragma: no cover - bpy only
    """Highlight all crates allocated to the selected grower (grower id on the panel)."""

    bl_idname = "krt.grower_apply"
    bl_label = "Highlight grower's crates"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Any) -> bool:
        return _props(context) is not None

    def execute(self, context: Any) -> Any:
        sp = _props(context)
        if sp is None:
            return {"CANCELLED"}
        gid = (sp.grower_id or "").strip()
        if not gid:
            return bpy.ops.krt.grower_clear()
        mats = _materials()
        n_found = 0
        for obj in _crates(context):
            base = _saved_name(obj)
            is_his = obj.get("krt_status") == "booked" and (obj.get("krt_grower") or "") == gid
            try:
                slot = obj.material_slots[0]
                slot.link = "OBJECT"
                slot.material = mats[_GROW if is_his else _DIM]
            except Exception:
                continue
            obj.hide_viewport = False
            n_found += int(is_his)
        if n_found == 0:
            self.report({"WARNING"}, f"No booked crates found for grower '{gid}'.")
        sp.grower_mode = True
        return {"FINISHED"}


class KRT_OT_grower_clear(bpy.types.Operator):  # pragma: no cover - bpy only
    """Restore every crate's original material (leaves grower inspection)."""

    bl_idname = "krt.grower_clear"
    bl_label = "Clear grower highlight"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Any) -> bool:
        return _props(context) is not None

    def execute(self, context: Any) -> Any:
        mats = _materials()
        for obj in _crates(context):
            saved = obj.get("krt_mat0")
            if saved is None:
                continue
            try:
                slot = obj.material_slots[0]
                slot.link = "OBJECT"
                slot.material = mats.get(str(saved)) or slot.material
            except Exception:
                continue
            del obj["krt_mat0"]
            obj.hide_viewport = False
        sp = _props(context)
        if sp is not None:
            sp.grower_mode = False
        return {"FINISHED"}


CLASSES = ()
if bpy is not None:  # pragma: no cover - bpy only
    CLASSES = (KRT_OT_grower_apply, KRT_OT_grower_clear)


def register() -> None:  # pragma: no cover - bpy only
    for cls in CLASSES:
        bpy.utils.register_class(cls)


def unregister() -> None:  # pragma: no cover - bpy only
    for cls in tuple(reversed(CLASSES)):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass

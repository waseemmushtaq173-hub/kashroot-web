"""Blender add-on registration hub (Phase 8, bpy-only).

Collects every operator/panel of the twin:

* ``navigation_ops`` — cutaway, transparent walls, enter chamber,
  floor filter, reset, plus the sidebar panels
* ``grower_mode``    — grower inspection highlighting
* ``KRT_OT_build_facility``  — (re)build the scene from the engine
* ``KRT_OT_export_web``      — write ``kashroot_coldstore_twin.glb`` +
  metadata straight into ``kashroot-web/public/models``

The headless entry point (``headless_runner`` / ``generate_and_export``)
does not import this module at all; everything here runs inside Blender.
"""
from __future__ import annotations

import os
from typing import Any, Optional, Tuple

try:  # Blender is optional; module is *used* only inside Blender.
    import bpy  # type: ignore
except Exception:  # pragma: no cover - executed only when bpy is missing
    bpy = None

from .properties import TwinSpec, scene_props_to_dict

_PKG_DIR = os.path.dirname(os.path.abspath(__file__))                                  # package dir
_KRT_ROOT = os.path.dirname(os.path.dirname(_PKG_DIR))                                 # .../kashroot-web
_DEFAULT_SPEC = os.path.join(os.path.dirname(_PKG_DIR), "specs", "default_facility.json")
_WEB_MODELS = os.path.join(_KRT_ROOT, "public", "models")


def _spec_from_context(context: Any) -> Tuple[TwinSpec, str]:  # pragma: no cover - bpy only
    """The sidebar values, or the reference spec when the sidebar is empty."""
    raw = scene_props_to_dict(context.scene)
    if raw.get("chambers"):
        return TwinSpec.from_dict(raw), "scene"
    return TwinSpec.from_json_file(_DEFAULT_SPEC), "default"


class KRT_OT_build_facility(bpy.types.Operator):  # pragma: no cover - bpy only
    """(Re)build the cold store scene from the capacity engine."""

    bl_idname = "krt.build_facility"
    bl_label = "Build facility"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Any) -> bool:
        return _spec_from_context(context)[1] == "scene" or os.path.exists(_DEFAULT_SPEC)

    def execute(self, context: Any) -> Any:
        from .geometry_builder import build_facility

        spec, source = _spec_from_context(context)
        stats = build_facility(spec)
        self.report({"INFO"}, "Twin rebuilt from %s spec: %s collections, %s objects" % (
            source, stats.get("collections"), stats.get("objects")))
        return {"FINISHED"}


class KRT_OT_export_web(bpy.types.Operator):  # pragma: no cover - bpy only
    """Export the web twin (GLB + exact capacity metadata) from this spec."""

    bl_idname = "krt.export_web"
    bl_label = "Export web twin (GLB)"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context: Any) -> bool:
        return _spec_from_context(context)[1] == "scene" or os.path.exists(_DEFAULT_SPEC)

    def execute(self, context: Any) -> Any:
        from .headless_runner import run

        spec, _source = _spec_from_context(context)
        os.makedirs(_WEB_MODELS, exist_ok=True)
        stats = run(
            spec,
            os.path.join(_WEB_MODELS, "kashroot_coldstore_twin.glb"),
            os.path.join(_WEB_MODELS, "kashroot_coldstore_metadata.json"),
        )
        t = stats.get("totals", {})
        self.report({"INFO"}, "GLB %d B; crates %s, booked %s, remaining %.1f t" % (
            stats["bytes"], t.get("total_crate_count"), t.get("booked_crate_count"),
            (t.get("remaining_capacity_kg") or 0.0) / 1000.0))
        return {"FINISHED"}


def _classes() -> Tuple[Any, ...]:  # pragma: no cover - bpy only
    from . import grower_mode, navigation_ops

    return tuple(navigation_ops.CLASSES) + tuple(grower_mode.CLASSES) + (
        KRT_OT_build_facility, KRT_OT_export_web,
    )


def register() -> None:  # pragma: no cover - bpy only
    for cls in _classes():
        try:
            bpy.utils.register_class(cls)
        except ValueError:
            pass  # already registered (Blender reloads)


def unregister() -> None:  # pragma: no cover - bpy only
    for cls in tuple(reversed(_classes())):
        try:
            bpy.utils.unregister_class(cls)
        except Exception:
            pass

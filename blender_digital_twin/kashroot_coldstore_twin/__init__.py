"""kashroot_coldstore_twin — KashRoot Cold-Store Blender Digital Twin.

A modular Blender Python add-on **and** a plain-Python headless pipeline
for the KashRoot apple cold-store digital twin:

  * ``properties``        — the parametric spec (dataclasses + JSON + bpy UI)
  * ``validation``        — geometry / feasibility rules for a spec
  * ``capacity_engine``   — exact capacity mathematics + spatial layout model
  * ``materials_pbr``     — PBR palette (bpy node trees + glTF factors)
  * ``geometry_builder``  — bpy procedural building/chambers/racking (Blender)
  * ``produce_generator`` — bpy apples & crates meshes (Blender)
  * ``glb_exporter``      — headless glTF 2.0 (.glb) + metadata JSON exporter
  * ``headless_runner``   — CLI: spec JSON -> GLB + metadata (+ self verify)
  * ``navigation_ops``    — bpy cutaway/transparent/enter-chamber operators
  * ``grower_mode``       — bpy grower inspection mode

Headless (no Blender required)::

    python -m kashroot_coldstore_twin.headless_runner --spec spec.json --out out/

Inside Blender the package registers under ``VIEW_3D > UI > KashRoot Twin``.
"""
from __future__ import annotations

from .properties import (
    BuildingConfig, ChamberConfig, CrateConfig, GrowerBooking, PanelConfig,
    RackConfig, StagingConfig, TwinSpec, example_spec,
)
from .validation import validate_spec
from .capacity_engine import (APPLES_PER_CRATE_TOP, build_model,
                              capacity_summary)
from .materials_pbr import PALETTE, gltf_factors

__version__ = "1.0.0"
__all__ = [
    "BuildingConfig", "ChamberConfig", "CrateConfig", "GrowerBooking",
    "PanelConfig", "RackConfig", "StagingConfig", "TwinSpec",
    "example_spec", "validate_spec", "build_model", "capacity_summary",
    "APPLES_PER_CRATE_TOP", "PALETTE", "gltf_factors",
]

# ---------------------------------------------------------------------- #
# Blender add-on plumbing (no-ops outside Blender)                          #
# ---------------------------------------------------------------------- #
bl_info = {
    "name": "KashRoot ColdStore Twin",
    "author": "KashRoot",
    "version": (1, 0, 0),
    "blender": (3, 6, 0),
    "location": "VIEW_3D > UI > KashRoot Twin",
    "description": "Parametric apple cold-store digital twin: capacity engine, PBR geometry, GLB export, grower inspection",
    "category": "Architecture",
}

_blender_modules = (
    "geometry_builder", "produce_generator", "navigation_ops", "grower_mode",
)


def register() -> None:  # pragma: no cover - Blender only
    """Register the add-on UI inside Blender."""
    try:
        import bpy  # type: ignore
    except Exception:
        raise RuntimeError("kashroot_coldstore_twin.register() requires Blender.")
    from . import properties

    properties.register_bpy_ui()
    import importlib

    from . import addon  # lightweight bpy-only registration hub
    importlib.reload(addon)
    addon.register()


def unregister() -> None:  # pragma: no cover - Blender only
    """Unregister the add-on UI inside Blender."""
    try:
        import bpy  # type: ignore
    except Exception:
        return
    try:
        from . import addon

        addon.unregister()
    except Exception:
        pass
    from . import properties

    properties.unregister_bpy_ui()

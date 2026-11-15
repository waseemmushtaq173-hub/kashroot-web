"""PBR materials for the KashRoot cold-store twin (Phase 5).

Two consumers, one palette:

  * **Blender**: full Principled BSDF node trees (``build_bpy_material``)
    with roughness/subsurface variation where the object deserves it -
    brushed galvanised steel, PUF sandwich panels, trowelled concrete with
    roughness patches, subsurface apple skin and HDPE crate plastic.
  * **Headless GLB**: the same colors as glTF
    ``pbrMetallicRoughness`` factors (``gltf_factors``), enhanced with a
    KHR-friendly material name map the web viewer can key on.

Every material is named ``krt.<name>`` so the GLB exporter, the Blender
builder and the web viewer agree on which material is which.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

Material = Dict[str, Any]

# ---------------------------------------------------------------------- #
# Palette; colours are linear sRGB 0-1 (+ alpha), roughness/metallic 0-1   #
# ---------------------------------------------------------------------- #
PALETTE: Dict[str, Material] = {
    "galvanised_steel": {"color": (0.60, 0.62, 0.64, 1.0), "metallic": 0.85, "roughness": 0.42, "desc": "Brushed galvanised rack steel"},
    "rack_steel": {"color": (0.53, 0.55, 0.58, 1.0), "metallic": 0.9, "roughness": 0.38, "desc": "Pallet-racking uprights and beams"},
    "wire_mesh": {"color": (0.50, 0.52, 0.55, 1.0), "metallic": 0.85, "roughness": 0.5, "opacity": 0.55, "double_sided": True, "desc": "Wire-mesh deck panels"},
    "puf_panel_out": {"color": (0.87, 0.86, 0.82, 1.0), "metallic": 0.12, "roughness": 0.45, "desc": "Corrugated PUF sandwich panel, outer face"},
    "puf_panel_in": {"color": (0.90, 0.93, 0.94, 1.0), "metallic": 0.05, "roughness": 0.42, "desc": "Fair-faced PUF panel, chamber side"},
    "partition_panel": {"color": (0.85, 0.90, 0.91, 1.0), "metallic": 0.05, "roughness": 0.45, "desc": "Insulated partition wall"},
    "concrete_floor": {"color": (0.55, 0.54, 0.51, 1.0), "metallic": 0.02, "roughness": 0.72, "desc": "Troweled concrete floor with roughness variation"},
    "concrete_joint": {"color": (0.30, 0.29, 0.27, 1.0), "metallic": 0.02, "roughness": 0.9, "desc": "Expansion-joint strip"},
    "roof_steel": {"color": (0.66, 0.68, 0.70, 1.0), "metallic": 0.8, "roughness": 0.5, "desc": "Pitched industrial roof sheet"},
    "ca_door": {"color": (0.35, 0.42, 0.46, 1.0), "metallic": 0.7, "roughness": 0.35, "desc": "Airtight CA sliding door slab"},
    "door_track": {"color": (0.45, 0.47, 0.50, 1.0), "metallic": 0.9, "roughness": 0.3, "desc": "Door track / rails"},
    "gasket": {"color": (0.10, 0.10, 0.11, 1.0), "metallic": 0.05, "roughness": 0.9, "desc": "Door gasket rubber"},
    "glass_port": {"color": (0.75, 0.82, 0.85, 1.0), "metallic": 0.9, "roughness": 0.08, "opacity": 0.35, "desc": "Chamber-door viewing port glass"},
    "evap_body": {"color": (0.62, 0.64, 0.66, 1.0), "metallic": 0.6, "roughness": 0.4, "desc": "Evaporator blower casing"},
    "fan_dark": {"color": (0.12, 0.12, 0.13, 1.0), "metallic": 0.75, "roughness": 0.45, "desc": "Fan blades"},
    "pipe_steel": {"color": (0.58, 0.60, 0.62, 1.0), "metallic": 0.9, "roughness": 0.35, "desc": "Refrigerant piping"},
    "led_light": {"color": (1.0, 0.99, 0.95, 1.0), "metallic": 0.0, "roughness": 0.3, "emissive": (1.0, 0.98, 0.9), "desc": "LED strip fixtures (emissive)"},
    "hdpe_red": {"color": (0.70, 0.15, 0.12, 1.0), "metallic": 0.0, "roughness": 0.35, "krt_kind": "crate", "desc": "HDPE apple crate plastic, red"},
    "hdpe_amber": {"color": (0.82, 0.55, 0.12, 1.0), "metallic": 0.0, "roughness": 0.38, "krt_kind": "crate", "desc": "Booked-crate accent (amber HDPE)"},
    "hdpe_green": {"color": (0.13, 0.42, 0.18, 1.0), "metallic": 0.0, "roughness": 0.38, "krt_kind": "crate", "desc": "Grower-highlight crates (free)"},  # tinted run-time too
    "wood_bin": {"color": (0.44, 0.30, 0.16, 1.0), "metallic": 0.0, "roughness": 0.75, "krt_kind": "crate", "desc": "Timber bulk bin"},
    "apple_cosse_red": {"color": (0.42, 0.03, 0.025, 1.0), "metallic": 0.0, "roughness": 0.32, "subsurface": (0.9, 0.08, 0.05), "subsurface_amount": 0.12, "desc": "Kashmir red apple skin, SSS"},
    "apple_gold": {"color": (0.68, 0.44, 0.06, 1.0), "metallic": 0.0, "roughness": 0.35, "subsurface": (0.9, 0.45, 0.12), "subsurface_amount": 0.12, "desc": "Golden apple skin, SSS"},
    "apple_stem": {"color": (0.16, 0.10, 0.045, 1.0), "metallic": 0.0, "roughness": 0.8, "desc": "Apple stem"},
    "safety_yellow": {"color": (0.85, 0.68, 0.03, 1.0), "metallic": 0.1, "roughness": 0.5, "desc": "Dock leveler / safety paint"},
    "rubber_black": {"color": (0.05, 0.05, 0.05, 1.0), "metallic": 0.0, "roughness": 0.95, "desc": "Dock buffers"},
    "corridor_marking": {"color": (0.13, 0.52, 0.24, 1.0), "metallic": 0.0, "roughness": 0.6, "desc": "Corridor lane markings"},
    "highlight_free": {"color": (0.16, 0.45, 0.20, 1.0), "metallic": 0.0, "roughness": 0.4, "desc": "Grower mode: allocated crates (viewer tints live)"},
    "dim_free": {"color": (0.55, 0.55, 0.55, 1.0), "metallic": 0.0, "roughness": 0.5, "opacity": 0.18, "desc": "Grower mode: unallocated crates, dimmed"},
}


def gltf_factors(mat: Material) -> Material:
    """Reduce one palette entry to glTF PBR factors (+ extras)."""
    out: Material = {
        "name": "",  # filled by caller
        "pbrMetallicRoughness": {"baseColorFactor": list(mat["color"]), "roughnessFactor": mat.get("roughness", 0.5), "metallicFactor": mat.get("metallic", 0.05)},
    }
    if mat.get("opacity") is not None and mat["opacity"] < 1.0:
        out["pbrMetallicRoughness"]["baseColorFactor"] = [c for c in mat["color"]]
        out["pbrMetallicRoughness"]["baseColorFactor"][3] = mat["opacity"]
        out["alphaMode"] = "BLEND"
    if mat.get("double_sided"):
        out["doubleSided"] = True
    if mat.get("emissive"):
        out["emissiveFactor"] = list(mat["emissive"])
    return out


# ---------------------------------------------------------------------- #
# Blender node trees (called only inside Blender)                          #
# ---------------------------------------------------------------------- #
def build_bpy_material(key: str, mat_def: Material, bpy: Any, nodes_cache: Dict[str, Any]) -> Any:  # pragma: no cover - bpy only
    """Create (or reuse) a Principled BSDF material for `key`."""
    if key in nodes_cache:
        return nodes_cache[key]
    name = f"krt.{key}"
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (620, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    c = mat_def.get("color", (0.5, 0.5, 0.5, 1.0))
    bsdf.inputs["Base Color"].default_value = (c[0], c[1], c[2], 1.0)
    bsdf.inputs["Roughness"].default_value = mat_def.get("roughness", 0.5)
    metal = bsdf.inputs["Metallic"]
    metal.default_value = mat_def.get("metallic", 0.05)

    # procedural life: a musgrave/wave blend breaks flat plastic honesty
    if key in ("concrete_floor", "puf_panel_out", "puf_panel_in"):
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.location = (-260, 0)
        noise.inputs["Scale"].default_value = 4.0 if key.startswith("puf") else 12.0
        noise.inputs["Detail"].default_value = 6.0
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.location = (-60, 0)
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[1].position = 0.75
        ramp.color_ramp.elements[0].color = (0.82, 0.82, 0.82, 1.0)
        ramp.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
        nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        if key == "concrete_floor":
            nt.links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
        else:
            bump = nt.nodes.new("ShaderNodeBump")
            bump.location = (100, -240)
            bump.inputs["Strength"].default_value = 0.06
            nt.links.new(ramp.outputs["Color"], bump.inputs["Height"])
            nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    if key.startswith("apple_") and key != "apple_stem":
        bsdf.inputs.get("Subsurface Weight", None) and setattr(bsdf.inputs["Subsurface Weight"], "default_value", mat_def.get("subsurface_amount", 0.12))
        subs = mat_def.get("subsurface", (0.9, 0.3, 0.1))
        radius = bsdf.inputs.get("Subsurface Radius")
        if radius:
            radius.default_value = (subs[0], subs[1], subs[2])

    if mat_def.get("emissive"):
        try:
            bsdf.inputs["Emission Color"].default_value = (*mat_def["emissive"], 1.0)
            bsdf.inputs["Emission Strength"].default_value = 8.0
        except KeyError:  # older Blender
            nt.nodes.new("ShaderNodeEmission")
    if mat_def.get("opacity") is not None and mat_def["opacity"] < 1.0:
        mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else mat.blend_method
        try:
            bsdf.inputs["Alpha"].default_value = mat_def["opacity"]
        except KeyError:
            pass
    mat.use_backface_culling = not mat_def.get("double_sided", False)
    nodes_cache[key] = mat
    return mat


# ---------------------------------------------------------------------- #
# Crate material resolution                                                #
# ---------------------------------------------------------------------- #
def crate_material(color: Sequence[float]) -> str:
    """Pick the nearest palette crate plastic for an owner's base colour."""
    import math

    def dist(a: Sequence[float], b: Sequence[float]) -> float:
        return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))

    best = min(("hdpe_red", "hdpe_amber", "hdpe_green"), key=lambda k: dist(color, PALETTE[k]["color"]))
    return best

# scripts/blender_generate_coldstore.py
# Blender 5.2.3 LTS generator — merged KashRoot cold-store generator.
#
# Runs headless:
#   blender --background --python scripts/blender_generate_coldstore.py -- <out-dir>
#
# Writes three artifacts into the out directory (default public/models):
#   coldstore_kit.glb              six kit prototypes (real sizes), node names
#                                  that src/components/rental/three/coldKit.ts
#                                  matches exactly:
#       Kit_Crate_HDPE             blue ventilated HDPE crate (~16.5 kg)
#       Kit_Pallet_Bin             wooden apple bulk bin (~200 kg)
#       Kit_Apples_Cluster         the booked-unit apple crown
#       Kit_Rack_Post              galvanised C-profile upright
#       Kit_Rack_Beam              C-profile load beam (one bay)
#       Kit_Evaporator             triple-fan ceiling evaporator
#   coldstore_facility_twin.glb    a generic reference facility (corridor, one
#                                  wooden-bin chamber, one blue-crate chamber,
#                                  machinery bay, CA door) built from shared
#                                  meshes so the GLB stays small
#   coldstore_metadata.json        generator identity + storage types + file
#                                  bytes/sha256 + the reference layout counts
#
# Nothing here invents live data: the web derives occupancy and temperatures
# from the database; this GLB is only the 3D illustration. Machine-readable
# result: the last "[bgen] RESULT {json}" line; exit 0 only when both GLBs are
# written and the six kit nodes are verified.
from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone

import bpy
import bmesh
from mathutils import Matrix, Vector


KIT_GLB = "coldstore_kit.glb"
FACILITY_GLB = "coldstore_facility_twin.glb"
METADATA = "coldstore_metadata.json"

REQUIRED_KIT_NODES = (
    "Kit_Crate_HDPE",
    "Kit_Pallet_Bin",
    "Kit_Apples_Cluster",
    "Kit_Rack_Post",
    "Kit_Rack_Beam",
    "Kit_Evaporator",
)


# ---------------------------------------------------------------------- #
# Materials                                                                #
# ---------------------------------------------------------------------- #
def make_mat(name, rgba, metallic=0.0, roughness=0.5):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgba, 1.0)
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    return mat


def init_materials():
    return {
        "wood_bin": make_mat("Mat_Wooden_Apple_Bin_200kg", (0.64, 0.47, 0.28), 0.0, 0.82),
        "blue_crate": make_mat("Mat_Blue_Plastic_Crate_17kg", (0.08, 0.42, 0.82), 0.05, 0.36),
        "apple_red": make_mat("Mat_Kashmiri_Apple_Red", (0.76, 0.08, 0.11), 0.0, 0.24),
        "steel_rack": make_mat("Mat_Galvanized_Rack", (0.26, 0.32, 0.38), 0.85, 0.28),
        "evaporator": make_mat("Mat_Evaporator_Unit", (0.82, 0.85, 0.88), 0.72, 0.25),
        "ca_door": make_mat("Mat_CA_Door_Industrial", (0.88, 0.58, 0.08), 0.45, 0.30),
        "puf_wall": make_mat("Mat_PUF_Wall_Panel", (0.90, 0.92, 0.94), 0.18, 0.35),
        "concrete": make_mat("Mat_Industrial_Floor", (0.58, 0.60, 0.59), 0.0, 0.78),
        "machinery": make_mat("Mat_Grading_Washing_Line", (0.14, 0.48, 0.36), 0.65, 0.32),
        "corridor_paint": make_mat("Mat_Corridor_Yellow", (0.92, 0.70, 0.03), 0.0, 0.5),
        "bay_paint": make_mat("Mat_Bay_Teal", (0.06, 0.46, 0.43), 0.0, 0.6),
    }


def _box(bm, sx, sy, sz, cx, cy, cz):
    cube = bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=cube["verts"])
    bmesh.ops.translate(bm, vec=(cx, cy, cz), verts=cube["verts"])


# ---------------------------------------------------------------------- #
# Kit prototypes (user-approved bmesh builders)                            #
# ---------------------------------------------------------------------- #
def build_wooden_apple_bin_200kg(name, l_m=1.20, w_m=1.00, h_m=0.78, mat=None):
    """Wooden bulk apple bin on three fork skids, slatted walls, foot at z=0."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()

    fork_h = 0.10
    post_t = 0.07
    slat_t = 0.022
    slat_count = 5
    usable_h = h_m - fork_h

    for sx in (-l_m / 2 + post_t / 2, 0.0, l_m / 2 - post_t / 2):
        _box(bm, post_t, w_m, fork_h, sx, 0.0, fork_h / 2)

    _box(bm, l_m, w_m, slat_t, 0.0, 0.0, fork_h + slat_t / 2)

    for px in (-l_m / 2 + post_t / 2, l_m / 2 - post_t / 2):
        for py in (-w_m / 2 + post_t / 2, w_m / 2 - post_t / 2):
            _box(bm, post_t, post_t, usable_h, px, py, fork_h + usable_h / 2)

    slat_h = (usable_h * 0.82) / slat_count
    step_z = usable_h / slat_count
    for s in range(slat_count):
        z = fork_h + (s + 0.5) * step_z
        for py in (-w_m / 2 + slat_t / 2, w_m / 2 - slat_t / 2):
            _box(bm, l_m, slat_t, slat_h, 0.0, py, z)
        for px in (-l_m / 2 + slat_t / 2, l_m / 2 - slat_t / 2):
            _box(bm, slat_t, w_m, slat_h, px, 0.0, z)

    bm.to_mesh(mesh)
    bm.free()
    if mat:
        obj.data.materials.append(mat)
    return obj


def build_blue_plastic_crate_17kg(name, l_m=0.54, w_m=0.36, h_m=0.29, mat=None):
    """Ventilated blue HDPE crate: base plate, corner pillars, rib rings."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    wall = 0.018
    pillar = 0.035

    _box(bm, l_m, w_m, wall, 0.0, 0.0, wall / 2)

    for px in (-l_m / 2 + pillar / 2, l_m / 2 - pillar / 2):
        for py in (-w_m / 2 + pillar / 2, w_m / 2 - pillar / 2):
            _box(bm, pillar, pillar, h_m, px, py, h_m / 2)

    for z_frac in (0.30, 0.62, 0.94):
        rib_h = 0.038 if z_frac < 0.9 else 0.032
        z = h_m * z_frac
        for py in (-w_m / 2 + wall / 2, w_m / 2 - wall / 2):
            _box(bm, l_m, wall, rib_h, 0.0, py, z)
        for px in (-l_m / 2 + wall / 2, l_m / 2 - wall / 2):
            _box(bm, wall, w_m, rib_h, px, 0.0, z)

    bm.to_mesh(mesh)
    bm.free()
    if mat:
        obj.data.materials.append(mat)
    return obj


def build_apple_cluster(name, l_m=0.46, w_m=0.28, z_base=0.14, mat=None):
    """A tight 4x3 crown of Kashmiri apples, one smooth mesh."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    cols, rows = 4, 3
    rad = min(l_m / (cols * 2.1), w_m / (rows * 2.1))
    for r in range(rows):
        for c in range(cols):
            cx = -l_m / 2 + (c + 0.5) * (l_m / cols)
            cy = -w_m / 2 + (r + 0.5) * (w_m / rows)
            sp = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=rad)
            bmesh.ops.translate(bm, vec=(cx, cy, z_base), verts=sp["verts"])
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    if mat:
        obj.data.materials.append(mat)
    return obj


def build_evaporator_unit(name, mat):
    """Ceiling evaporator: casing + three fan shrouds, centred on origin."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    _box(bm, 2.4, 0.65, 0.55, 0.0, 0.0, 0.0)
    for fx in (-0.75, 0.0, 0.75):
        cone = bmesh.ops.create_cone(
            bm, cap_ends=True, segments=14, radius1=0.20, radius2=0.20, depth=0.10
        )
        bmesh.ops.rotate(
            bm, verts=cone["verts"], cent=Vector((0.0, 0.0, 0.0)),
            matrix=Matrix.Rotation(math.pi / 2, 3, 'X'),
        )
        bmesh.ops.translate(bm, verts=cone["verts"], vec=(fx, 0.36, 0.0))
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(mat)
    return obj


def build_rack_post(name, height_m=4.0, profile=0.075, mat=None):
    """Galvanised C-profile upright: web plate + two flanges, foot at z=0."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    web_t = 0.008
    flange_t = 0.006
    flange_l = profile * 0.84
    _box(bm, web_t, profile, height_m, 0.0, 0.0, height_m / 2)
    _box(bm, flange_l, flange_t, height_m, -profile * 0.42, profile / 2 - flange_t / 2, height_m / 2)
    _box(bm, flange_l, flange_t, height_m, -profile * 0.42, -profile / 2 + flange_t / 2, height_m / 2)
    bm.to_mesh(mesh)
    bm.free()
    if mat:
        obj.data.materials.append(mat)
    return obj


def build_rack_beam(name, span_m=1.32, height_m=0.063, mat=None):
    """C-profile load beam spanning one bay, along X, base at z=0."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    web_t = 0.006
    flange_w = 0.05
    _box(bm, span_m, web_t, height_m, 0.0, 0.0, height_m / 2)
    _box(bm, span_m, flange_w, web_t, 0.0, -flange_w / 2 + web_t / 2, height_m - web_t / 2)
    _box(bm, span_m, flange_w, web_t, 0.0, -flange_w / 2 + web_t / 2, web_t / 2)
    bm.to_mesh(mesh)
    bm.free()
    if mat:
        obj.data.materials.append(mat)
    return obj


# ---------------------------------------------------------------------- #
# GLB export                                                               #
# ---------------------------------------------------------------------- #
def _export_glb(path):
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB',
                                  export_apply=False, export_materials='EXPORT')
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB')
    with open(path, "rb") as fh:
        data = fh.read()
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def _object_names():
    return sorted(o.name for o in bpy.data.objects)


# ---------------------------------------------------------------------- #
# Phase 1 — the kit                                                        #
# ---------------------------------------------------------------------- #
def build_kit(mats):
    crate = build_blue_plastic_crate_17kg("Kit_Crate_HDPE", 0.54, 0.36, 0.29, mats["blue_crate"])
    apples = build_apple_cluster("Kit_Apples_Cluster", 0.46, 0.28, 0.15, mats["apple_red"])
    bin_200 = build_wooden_apple_bin_200kg("Kit_Pallet_Bin", 1.20, 1.00, 0.78, mats["wood_bin"])
    post = build_rack_post("Kit_Rack_Post", 4.0, 0.075, mats["steel_rack"])
    beam = build_rack_beam("Kit_Rack_Beam", 1.32, 0.063, mats["steel_rack"])
    evap = build_evaporator_unit("Kit_Evaporator", mats["evaporator"])

    crate.location = (0.0, 0.0, 0.0)
    apples.location = (0.0, 0.0, 0.0)      # the crown sits inside the crate
    bin_200.location = (2.0, 0.0, 0.0)
    post.location = (3.6, 0.0, 0.0)
    beam.location = (5.2, 0.0, 0.0)
    evap.location = (7.2, 0.0, 0.0)

    got = [o.name for o in bpy.data.objects if o.name.startswith("Kit_")]
    missing = [n for n in REQUIRED_KIT_NODES if n not in got]
    if missing:
        raise RuntimeError("kit missing required nodes: " + ", ".join(missing))
    return sorted(got)


# ---------------------------------------------------------------------- #
# Phase 2 — the reference facility                                         #
# ---------------------------------------------------------------------- #
def _place(name, mesh, loc):
    ob = bpy.data.objects.new(name, mesh)
    ob.location = loc
    bpy.context.collection.objects.link(ob)
    return ob


def _make_master(builder, name, *args, **kw):
    """Build a prototype via its kit builder, keep only the mesh datablock.

    Facility placements share the mesh; the temporary object is removed so
    nothing hidden or unused ever reaches the GLB."""
    ob = builder(name, *args, **kw)
    me = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    return me


def _simple_box_mesh(mat, sx, sy, sz, mesh_name):
    mesh = bpy.data.meshes.new(mesh_name)
    bm = bmesh.new()
    _box(bm, sx, sy, sz, 0.0, 0.0, 0.0)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return mesh


def build_facility(mats):
    counts = {"woodenBins": 0, "blueCrates": 0, "rackPosts": 0, "rackBeams": 0}

    # masters share one mesh datablock; the GLB keeps one mesh, many nodes
    bin_mesh = _make_master(build_wooden_apple_bin_200kg, "Ref_Bin_Master",
                            1.20, 1.00, 0.78, mat=mats["wood_bin"])
    crate_mesh = _make_master(build_blue_plastic_crate_17kg, "Ref_Crate_Master",
                              0.54, 0.36, 0.29, mat=mats["blue_crate"])
    post_mesh = _make_master(build_rack_post, "Ref_Post_Master",
                             4.0, 0.075, mat=mats["steel_rack"])
    short_post_mesh = _make_master(build_rack_post, "Ref_Post_Short_Master",
                                   2.4, 0.075, mat=mats["steel_rack"])
    beam_mesh = _make_master(build_rack_beam, "Ref_Beam_Master",
                             1.32, 0.063, mat=mats["steel_rack"])
    crate_beam_mesh = _make_master(build_rack_beam, "Ref_Beam_Small_Master",
                                   0.62, 0.063, mat=mats["steel_rack"])
    evap_mesh = _make_master(build_evaporator_unit, "Ref_Evap_Master",
                             mat=mats["evaporator"])

    # floor + perimeter PUF walls
    _place("Fac_Floor", _simple_box_mesh(mats["concrete"], 30.6, 16.6, 0.3, "Fac_Floor_Mesh"), (0.0, 0.0, 0.15))
    for name, loc, size in (
        ("Fac_Wall_S", (0.0, -8.125, 4.3), (30.6, 0.25, 8.0)),
        ("Fac_Wall_N", (0.0, 8.125, 4.3), (30.6, 0.25, 8.0)),
        ("Fac_Wall_W", (-15.125, 0.0, 4.3), (0.25, 16.5, 8.0)),
        ("Fac_Wall_E", (15.125, 0.0, 4.3), (0.25, 16.5, 8.0)),
        ("Fac_Door_CA", (15.0, 0.0, 1.9), (0.35, 3.2, 3.2)),
    ):
        mat = mats["ca_door"] if name.endswith("CA") else mats["puf_wall"]
        _place(name, _simple_box_mesh(mat, *size, name + "_Mesh"), loc)

    # corridor + operational-bay floor paint
    _place("Fac_Corridor", _simple_box_mesh(mats["corridor_paint"], 24.0, 4.0, 0.04, "Fac_Corridor_Mesh"), (2.0, 0.0, 0.32))
    _place("Fac_Bay", _simple_box_mesh(mats["bay_paint"], 5.0, 16.0, 0.04, "Fac_Bay_Mesh"), (-12.5, 0.0, 0.32))

    # machinery / grading-washing line in the operational bay
    for name, loc, size in (
        ("Fac_Grading_Line_A", (-13.0, -3.0, 1.0), (3.0, 1.8, 1.4)),
        ("Fac_Grading_Line_B", (-13.0, 3.0, 1.0), (3.0, 1.8, 1.4)),
        ("Fac_Packing_Table", (-11.3, 0.0, 0.75), (2.0, 1.0, 0.9)),
    ):
        _place(name, _simple_box_mesh(mats["machinery"], *size, name + "_Mesh"), loc)

    # chamber shells (PUF, open toward the corridor side is the LEFT chamber)
    for name, loc, size in (
        ("Fac_Chamber_L_Wall_Front", (0.0, -2.125, 2.8), (19.5, 0.25, 5.0)),
        ("Fac_Chamber_L_Wall_Back", (0.0, -7.875, 2.8), (19.5, 0.25, 5.0)),
        ("Fac_Chamber_L_Wall_West", (-9.625, -5.0, 2.8), (0.25, 5.5, 5.0)),
        ("Fac_Chamber_L_Wall_East", (9.625, -5.0, 2.8), (0.25, 5.5, 5.0)),
        ("Fac_Chamber_R_Wall_Front", (0.0, 2.125, 2.8), (19.5, 0.25, 5.0)),
        ("Fac_Chamber_R_Wall_Back", (0.0, 7.875, 2.8), (19.5, 0.25, 5.0)),
        ("Fac_Chamber_R_Wall_West", (-9.625, 5.0, 2.8), (0.25, 5.5, 5.0)),
        ("Fac_Chamber_R_Wall_East", (9.625, 5.0, 2.8), (0.25, 5.5, 5.0)),
    ):
        _place(name, _simple_box_mesh(mats["puf_wall"], *size, name + "_Mesh"), loc)

    # LEFT chamber: wooden pallet bins on racks (double-deep, 4 levels)
    pitch_x, pitch_y, pitch_z = 1.32, 1.12, 0.92
    cols, rows, levels = 13, 2, 4
    beam_y = (-7.19, -2.81)
    for i in range(cols + 1):
        px = -8.58 + i * pitch_x
        for py in beam_y:
            _place("Fac_Post_L_%02d_%d" % (i, int(py > 0)), post_mesh, (px, py, 0.3))
            counts["rackPosts"] += 1
    for lvl in range(levels):
        bz = 0.36 + lvl * pitch_z
        for i in range(cols):
            bx = -7.92 + i * pitch_x
            for by in beam_y:
                _place("Fac_Beam_L_%d_%02d_%d" % (lvl, i, int(by > 0)), beam_mesh, (bx, by, bz))
                counts["rackBeams"] += 1
        for r in range(rows):
            by = (-6.69, -3.31)[r]
            for i in range(cols):
                bx = -7.92 + i * pitch_x
                _place("Fac_Bin_L_%d_%02d_%d" % (lvl, r, i), bin_mesh, (bx, by, bz + 0.39))
                counts["woodenBins"] += 1

    # RIGHT chamber: blue plastic crates on light racks (4 deep, 5 levels)
    cp_x, cp_z = 0.62, 0.41
    c_cols, c_rows, c_levels = 20, 4, 5
    c_beam_y = (3.03, 6.47)
    for i in range(c_cols + 1):
        px = -6.2 + i * cp_x
        for py in c_beam_y:
            _place("Fac_Post_R_%02d_%d" % (i, int(py > 4)), short_post_mesh, (px, py, 0.3))
            counts["rackPosts"] += 1
    for lvl in range(c_levels):
        bz = 0.36 + lvl * cp_z
        for i in range(c_cols):
            bx = -5.89 + i * cp_x
            for by in c_beam_y:
                _place("Fac_CBeam_R_%d_%02d_%d" % (lvl, i, int(by > 4)), crate_beam_mesh, (bx, by, bz))
                counts["rackBeams"] += 1
        for r in range(c_rows):
            by = 3.3 + r * (6.2 - 3.3) / (c_rows - 1)
            for i in range(c_cols):
                bx = -5.89 + i * cp_x
                _place("Fac_Crate_R_%d_%02d_%d" % (lvl, r, i), crate_mesh, (bx, by, bz + 0.145))
                counts["blueCrates"] += 1

    # ceiling evaporators, one per chamber
    _place("Fac_Evap_L", evap_mesh, (-4.0, -5.0, 6.4))
    _place("Fac_Evap_R", evap_mesh, (-4.0, 5.0, 6.4))

    return counts


# ---------------------------------------------------------------------- #
# Main                                                                     #
# ---------------------------------------------------------------------- #
def export_all(output_dir):
    os.makedirs(output_dir, exist_ok=True)

    # Phase 1: the six-node kit
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = init_materials()
    kit_nodes = build_kit(mats)
    kit_path = os.path.join(output_dir, KIT_GLB)
    kit_stats = _export_glb(kit_path)
    print("[bgen] kit written: %s" % json.dumps(kit_stats), flush=True)

    # Phase 2: the reference facility
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = init_materials()
    counts = build_facility(mats)
    facility_path = os.path.join(output_dir, FACILITY_GLB)
    facility_stats = _export_glb(facility_path)
    print("[bgen] facility written: %s" % json.dumps(facility_stats), flush=True)

    meta = {
        "ok": True,
        "generator": "Blender 5.2.3 LTS",
        "blender_version": bpy.app.version_string,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "storageTypes": {
            "WOODEN_BIN": {"defaultCapacityKg": 200, "dimensionsMeters": [1.20, 1.00, 0.78]},
            "PLASTIC_CRATE": {"defaultCapacityKg": 16.5, "dimensionsMeters": [0.54, 0.36, 0.29]},
        },
        "kit": {"file": KIT_GLB, "nodes": kit_nodes, **kit_stats},
        "facility": {
            "file": FACILITY_GLB,
            "note": "generic reference facility; live capacity and occupancy come from the database",
            "referenceLayout": counts,
            **facility_stats,
        },
    }
    meta_path = os.path.join(output_dir, METADATA)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
        f.write("\n")

    result = {
        "ok": True,
        "blender": bpy.app.version_string,
        "kitNodes": kit_nodes,
        "files": {
            KIT_GLB: kit_stats,
            FACILITY_GLB: facility_stats,
            METADATA: {"bytes": os.path.getsize(meta_path)},
        },
        "referenceLayout": counts,
        "out_dir": output_dir,
    }
    print("[bgen] RESULT " + json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    out = args[-1] if args else os.path.join(os.getcwd(), "public", "models")
    try:
        code = export_all(out)
    except Exception as exc:  # noqa: BLE001 - one machine-readable line
        import traceback
        traceback.print_exc()
        print("[bgen] RESULT " + json.dumps({"ok": False, "error": "%s: %s" % (type(exc).__name__, exc)}), flush=True)
        code = 1
    raise SystemExit(code)

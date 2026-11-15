"""GLB + metadata deliverable tests for the KashRoot cold-store twin.

Reads the shipped web assets (``kashroot-web/public/models``) and asserts:

* a well-formed glTF 2.0 binary (chunks, sizes, accessor bounds)
* ``verify_glb`` structure stats
* EXT_mesh_gpu_instancing instance counts equal the engine's exact
  per-chamber crate and booking counts
* crate/app positions are physically sane (Y-up crate stack range)
* metadata JSON parity with the engine's reference numbers
"""
from __future__ import annotations

import json
import os
import struct
import unittest

from kashroot_coldstore_twin.glb_exporter import verify_glb

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)                # blender_digital_twin/
WEB = os.path.dirname(BLENDER_DIR)                 # kashroot-web/
GLB_PATH = os.path.join(WEB, "public", "models", "kashroot_coldstore_twin.glb")
META_PATH = os.path.join(WEB, "public", "models", "kashroot_coldstore_metadata.json")


def _load_glb() -> tuple[dict, bytes]:
    with open(GLB_PATH, "rb") as fh:
        data = fh.read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2, "not a glTF 2.0 binary"
    off, chunks = 12, []
    while off < length:
        clen, ctype = struct.unpack_from("<I4s", data, off)
        chunks.append((ctype, data[off + 8: off + 8 + clen]))
        off += 8 + clen
    types = [c[0] for c in chunks]
    assert types[0] == b"JSON" and b"BIN\x00" in types, f"unexpected chunk layout {types}"
    blob = next(c[1] for c in chunks if c[0] == b"BIN\x00")
    assert len(blob) % 4 == 0, "BIN chunk not 4-byte aligned"
    return json.loads(chunks[0][1]), blob


def _read_translation(g: dict, blob: bytes, node: dict) -> list[tuple[float, float, float]]:
    acc_idx = node["extensions"]["EXT_mesh_gpu_instancing"]["attributes"]["TRANSLATION"]
    acc = g["accessors"][acc_idx]
    bv = g["bufferViews"][acc["bufferView"]]
    base = bv.get("byteOffset", 0)
    stride = bv.get("byteStride", 12)
    out = []
    for i in range(acc["count"]):
        x, y, z = struct.unpack_from("<3f", blob, base + i * stride)
        out.append((x, y, z))
    return out


class TestGlbBinary(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not os.path.exists(GLB_PATH):
            raise unittest.SkipTest("regenerate with `python generate_and_export.py` first")
        cls.g, cls.blob = _load_glb()

    def test_chunk_layout(self) -> None:
        self.assertEqual(self.g["asset"]["version"], "2.0")
        self.assertIn("EXT_mesh_gpu_instancing", self.g["extensionsUsed"])
        self.assertGreater(len(self.blob), 0)

    def test_verify_glb_stats(self) -> None:
        s = verify_glb(GLB_PATH)
        self.assertEqual(s["version"], 2)
        self.assertGreaterEqual(s["nodes"], 400)
        self.assertGreaterEqual(s["meshes"], 40)
        self.assertGreaterEqual(s["materials"], 25)
        self.assertEqual(s["instanced_nodes"], 8)

    def test_accessors_inside_buffer(self) -> None:
        for bv in self.g["bufferViews"]:
            end = bv.get("byteOffset", 0) + bv["byteLength"]
            self.assertLessEqual(end, len(self.blob), f"bufferView {bv} overruns BIN chunk")
        for acc in self.g["accessors"]:
            self.assertIn(acc["type"], ("SCALAR", "VEC2", "VEC3", "VEC4"))
            self.assertGreaterEqual(acc["count"], 0)


class TestInstancingCounts(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not os.path.exists(GLB_PATH):
            raise unittest.SkipTest("regenerate first")
        cls.g, cls.blob = _load_glb()
        with open(META_PATH, "r", encoding="utf-8") as fh:
            cls.meta = json.load(fh)
        cls.chambers = {c["id"]: c for c in cls.meta["chambers"]}

    def test_crate_instances_equal_engine_cells(self) -> None:
        nodes = {n.get("name", ""): n for n in self.g["nodes"]}
        for cid, ch in self.chambers.items():
            cr = nodes[f"Crates_{cid}"]
            tr = _read_translation(self.g, self.blob, cr)
            self.assertEqual(len(tr), ch["crate_count"], f"{cid} instance count must equal engine cell count")
            self.assertEqual(ch["crate_count"], 2160)

    def test_apple_instances_equal_booked_crates(self) -> None:
        nodes = {n.get("name", ""): n for n in self.g["nodes"]}
        for cid, ch in self.chambers.items():
            resp = nodes.get(f"Apples_{cid}")
            if resp is None:
                self.assertEqual(ch["booked_count"], 0, f"{cid}: apples missing but bookings exist")
                continue
            a = _read_translation(self.g, self.blob, resp)
            self.assertEqual(len(a), ch["booked_count"], f"{cid} apples == booked crates")

    def test_positions_are_physically_sane(self) -> None:
        nodes = {n.get("name", ""): n for n in self.g["nodes"]}
        for cid in self.chambers:
            y_crates = [p[1] for p in _read_translation(self.g, self.blob, nodes[f"Crates_{cid}"])]
            self.assertTrue(0.30 < min(y_crates) < 0.80, f"{cid} lowest crate centre {min(y_crates)}")
            self.assertTrue(4.8 < max(y_crates) < 5.6, f"{cid} top crate centre {max(y_crates)}")
            y_apples = [p[1] for p in _read_translation(self.g, self.blob, nodes[f"Apples_{cid}"])]
            self.assertGreaterEqual(min(y_apples), min(y_crates), "apples must sit on/above crates")
            self.assertLessEqual(min(y_apples) - min(y_crates), 0.35)

    def test_translation_accessor_bounds_are_per_axis(self) -> None:
        nodes = {n.get("name", ""): n for n in self.g["nodes"]}
        for cid in self.chambers:
            cr = nodes[f"Crates_{cid}"]
            acc = self.g["accessors"][cr["extensions"]["EXT_mesh_gpu_instancing"]["attributes"]["TRANSLATION"]]
            pts = _read_translation(self.g, self.blob, cr)
            for axis in range(3):
                self.assertAlmostEqual(acc["min"][axis], min(p[axis] for p in pts), places=4)
                self.assertAlmostEqual(acc["max"][axis], max(p[axis] for p in pts), places=4)


class TestMetadataParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if not os.path.exists(META_PATH):
            raise unittest.SkipTest("regenerate first")
        with open(META_PATH, "r", encoding="utf-8") as fh:
            cls.meta = json.load(fh)

    def test_totals(self) -> None:
        t = self.meta["totals"]
        self.assertEqual(t["total_crate_count"], 8640)
        self.assertEqual(t["booked_crate_count"], 6080)
        self.assertAlmostEqual(t["actual_usable_capacity_kg"], 172800.0)
        self.assertAlmostEqual(t["occupied_capacity_kg"], 121600.0)
        self.assertAlmostEqual(t["remaining_capacity_kg"], 51200.0)
        self.assertAlmostEqual(t["occupancy_pct"], 70.37, places=2)

    def test_conventions_are_published(self) -> None:
        conv = self.meta["conventions"]
        self.assertEqual(conv["crate_order"],
                         "level -> rack row -> subrow across rack depth -> crate along the rack length")
        self.assertEqual(conv["apple_cluster_grid"], "4x3 top-layer apples per booked crate")
        self.assertEqual(conv["crate_id"], "Crate_<CH>_L<level>_R<row>_C<column>")
        self.assertIn("Y-up", conv["axes"])
        self.assertIn("metres", conv["units"])
        self.assertEqual(self.meta["totals"]["appled_crate_nodes"], self.meta["totals"]["booked_crate_count"])

    def test_growers_and_booked_spans_present(self) -> None:
        named = {(g["grower_id"], ch["id"]) for ch in self.meta["chambers"] for g in ch["growers"]}
        self.assertEqual(named, {("GRW-001", "CH01"), ("GRW-002", "CH02"), ("GRW-003", "CH02"),
                                 ("GRW-004", "CH03"), ("GRW-005", "CH04")})
        ch02 = next(c for c in self.meta["chambers"] if c["id"] == "CH02")
        grw3 = next(g for g in ch02["growers"] if g["grower_id"] == "GRW-003")
        self.assertTrue(grw3["short"])
        self.assertEqual(grw3["crates"], 760)

    @property
    def chambers(self) -> list:
        return self.meta["chambers"]


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

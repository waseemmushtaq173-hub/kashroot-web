"""Capacity-engine tests (exact numbers, no invented values).

Covers the reference facility spec:

* validation is clean on the default spec
* the crate grid invariants (levels x rows x bays, ordering convention,
  per-cell uid uniqueness, station positions inside the chamber rect)
* weight invariants (crate rating, chamber caps, totals)
* booking spans (contiguity, kg accounting, the GRW-003 short-fall note)
"""
from __future__ import annotations

import os
import unittest

from kashroot_coldstore_twin.capacity_engine import build_model
from kashroot_coldstore_twin.properties import TwinSpec
from kashroot_coldstore_twin.validation import validate_spec

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # blender_digital_twin/
SPEC_PATH = os.path.join(ROOT, "specs", "default_facility.json")


def _model():
    spec = TwinSpec.from_json_file(SPEC_PATH)
    return spec, build_model(spec)


class TestValidation(unittest.TestCase):
    def test_default_spec_is_valid(self) -> None:
        spec = TwinSpec.from_json_file(SPEC_PATH)
        result = validate_spec(spec)
        self.assertEqual(result.errors, [], "reference spec must validate without errors")

    def test_model_shapes(self) -> None:
        spec, model = _model()
        # published top-level contract (mirrored 1:1 by the web parity check)
        self.assertEqual(
            set(model),
            {"spec_facility_name", "envelope", "partitions", "chambers", "totals", "_objects", "conventions"},
        )
        self.assertEqual(len(model["chambers"]), 4)
        self.assertEqual(list(model["_objects"]), [ch["id"] for ch in model["chambers"]])
        self.assertEqual(model["conventions"]["crate_id"], "Crate_<CH>_L<level>_R<row>_C<column>")


class TestGrid(unittest.TestCase):
    def setUp(self) -> None:
        self.spec, self.model = _model()

    def test_grid_invariants_per_chamber(self) -> None:
        for ch in self.model["chambers"]:
            with self.subTest(chamber=ch["id"]):
                self.assertEqual(ch["crate_count"], ch["levels_per_chamber"] * ch["crates_per_level"])
                self.assertEqual(
                    ch["crates_per_level"],
                    ch["crates_per_row_fit"] * ch["rows_per_level_fit"] * ch["rack_rows"],
                )
                self.assertEqual(ch["crate_count"], 2160, "reference facility grid size")
                self.assertEqual(ch["crates_per_level"], 180)

    def test_cell_order_convention(self) -> None:
        # instance i == engine cell i; order is level -> rack row -> subrow -> col
        spec, model = _model()
        self.assertEqual(model["conventions"]["crate_order"],
                         "level -> rack row -> subrow across rack depth -> crate along the rack length")
        for ch, _spec_cfg in zip(model["chambers"], spec.chambers, strict=True):
            cells = model["_objects"][ch["id"]].crates
            # level-major: each 2160-slot block is one level
            self.assertEqual(cells[0].level, 1)
            self.assertEqual(cells[ch["crate_count"] // 2].level,
                             1 + (ch["crate_count"] // 2) // ch["crates_per_level"])
            self.assertEqual(cells[-1].level, ch["levels_per_chamber"])
            self.assertEqual(cells[-1].col, ch["crates_per_row_fit"])
            self.assertEqual(cells[-1].subrow, ch["rows_per_level_fit"])
            self.assertEqual(cells[-1].row, ch["rack_rows"])
            # subrow wraps along the rack depth before col restarts along the bay
            self.assertEqual((cells[1].row, cells[1].subrow, cells[1].col), (1, 1, 2), "col advances first")
            self.assertEqual((cells[ch["crates_per_row_fit"]].row,
                              cells[ch["crates_per_row_fit"]].subrow,
                              cells[ch["crates_per_row_fit"]].col), (1, 2, 1), "then subrow")
            self.assertEqual((cells[ch["crates_per_row_fit"] * ch["rows_per_level_fit"]].row,
                              cells[ch["crates_per_row_fit"] * ch["rows_per_level_fit"]].subrow,
                              cells[ch["crates_per_row_fit"] * ch["rows_per_level_fit"]].col),
                             (2, 1, 1), "then rack row")

    def test_cell_ids_unique_positions_in_rect(self) -> None:
        spec, model = _model()
        for ch in model["chambers"]:
            cells = model["_objects"][ch["id"]].crates
            ids = [c.cell_id for c in cells]
            self.assertEqual(len(ids), len(set(ids)), "cell ids must be unique")
            x0, y0, z0, x1, y1, z1 = ch["rect"]
            for c in cells:
                self.assertTrue(x0 <= c.pos[0] <= x1, f"{c.cell_id} x {c.pos[0]}")
                self.assertTrue(y0 <= c.pos[1] <= y1, f"{c.cell_id} y {c.pos[1]}")
                self.assertTrue(z0 <= c.pos[2] <= z1, f"{c.cell_id} z {c.pos[2]}")


class TestWeights(unittest.TestCase):
    def setUp(self) -> None:
        self.spec, self.model = _model()
        self.t = self.model["totals"]

    def test_reference_totals(self) -> None:
        self.assertEqual(self.t["chambers_count"], 4)
        self.assertEqual(self.t["total_crate_count"], 8640)
        self.assertEqual(self.t["booked_crate_count"], 6080)
        self.assertAlmostEqual(self.t["actual_usable_capacity_kg"], 172800.0)
        self.assertAlmostEqual(self.t["occupied_capacity_kg"], 121600.0)
        self.assertAlmostEqual(self.t["remaining_capacity_kg"], 51200.0)
        self.assertAlmostEqual(self.t["occupancy_pct"], 70.37, places=2)

    def test_every_cell_capacity_math(self) -> None:
        for ch in self.model["chambers"]:
            cap = self.spec.chambers[0].crate.weight_capacity_kg
            for cell in self.model["_objects"][ch["id"]].crates:
                self.assertAlmostEqual(cell.weight_capacity_kg, cap)
                booked = cell.booking_status == "booked"
                self.assertAlmostEqual(cell.occupied_weight_kg, cap if booked else 0.0)
                self.assertAlmostEqual(cell.available_weight_kg, 0.0 if booked else cap)
            self.assertAlmostEqual(
                sum(c.occupied_weight_kg for c in self.model["_objects"][ch["id"]].crates),
                ch["occupied_capacity_kg"])


class TestBookings(unittest.TestCase):
    def setUp(self) -> None:
        self.spec, self.model = _model()

    def test_spans_partition_booked_range(self) -> None:
        for ch in self.model["chambers"]:
            spans = ch["booked_spans"]
            if not spans:
                self.assertEqual(ch["booked_count"], 0)
                continue
            self.assertEqual(spans[0]["start"], 0, "bookings fill front-first")
            for prev, nxt in zip(spans, spans[1:]):
                self.assertEqual(nxt["start"], prev["end"] + 1, "booked cells must be contiguous")
            self.assertEqual(spans[-1]["end"] + 1, ch["booked_count"])
            self.assertEqual(sum(g["crates"] for g in ch["growers"]), ch["booked_count"])
            # growers' own span_start/span_end trail must mirror the spans
            self.assertEqual(spans[-1]["end"], ch["growers"][-1]["span_end"])

    def test_grw003_shortfall_recorded_not_invented(self) -> None:
        ch02 = next((c for c in self.model["chambers"] if c["id"] == "CH02"), None)
        self.assertIsNotNone(ch02)
        grw3 = next((g for g in ch02["growers"] if g["grower_id"] == "GRW-003"), None)
        self.assertIsNotNone(grw3)
        self.assertTrue(grw3["short"])
        self.assertEqual(grw3["crates"], 760)
        self.assertIn("900", grw3["note"], "the note should explain the 900-crates request")
        # the short-fall is against the empty capacity of that chamber, not invented
        self.assertEqual(grw3["span_end"], ch02["booked_count"] - 1)

    def test_demo_booking_total_matches(self) -> None:
        """Exact accounting: occupied = requested − unfilled shortfall (140 crates × 20 kg here)."""
        def kg_of(g) -> float:
            if g.weight_per_crate_kg is not None:
                return float(g.weight_per_crate_kg)
            cfg = next((c for c in self.spec.chambers if c.chamber_id == g.chamber), None)
            return float(cfg.crate.weight_capacity_kg) if cfg else 20.0

        requested_kg = sum(int(g.crates) * kg_of(g) for g in self.spec.demo_bookings)
        filled_by_id = {}
        for ch in self.model["chambers"]:
            for g in ch["growers"]:
                filled_by_id[g["grower_id"]] = g["crates"]
        shortfall_kg = sum(max(0, int(g.crates) - filled_by_id.get(g.grower_id, 0)) * kg_of(g)
                           for g in self.spec.demo_bookings)
        self.assertGreater(shortfall_kg, 0.0, "GRW-003 shortfall must be recorded, not invented")
        self.assertAlmostEqual(self.model["totals"]["occupied_capacity_kg"], requested_kg - shortfall_kg)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()

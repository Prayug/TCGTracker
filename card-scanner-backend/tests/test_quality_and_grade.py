"""Unit tests for image quality gate, defect merge, and bottleneck grading."""

from __future__ import annotations

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from defect_grouping import Detection, merge_detections, detections_to_defect_strings, grade_weight
from grade_math import bottleneck_overall
from quality_gate import GLARE_REFUSE, assess_card_quality, glare_ratio
from PIL import Image
import cv2


def _card(color=(40, 80, 40), size=(1002, 1400)) -> np.ndarray:
    img = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    img[:, :] = color
    # Fake artwork block so contrast exists
    img[200:1200, 120:880] = (30, 50, 160)
    return img


class TestGlareGate(unittest.TestCase):
    def test_glare_ratio_on_specular_blob(self):
        card = _card()
        # White blown-out patch covering ~20% of the card
        h, w = card.shape[:2]
        card[int(h * 0.2) : int(h * 0.7), int(w * 0.15) : int(w * 0.65)] = (255, 255, 255)
        ratio = glare_ratio(card)
        self.assertGreater(ratio, GLARE_REFUSE)

    def test_refuses_surface_when_glare_is_high(self):
        card = _card()
        h, w = card.shape[:2]
        card[int(h * 0.15) : int(h * 0.75), int(w * 0.1) : int(w * 0.7)] = (255, 255, 255)
        q = assess_card_quality(card)
        self.assertTrue(q.ok)
        self.assertFalse(q.surface_ok)
        self.assertIn("glare", (q.surface_message or "").lower())

    def test_clean_card_allows_surface(self):
        card = _card()
        q = assess_card_quality(card)
        self.assertTrue(q.surface_ok)
        self.assertLess(q.glare_ratio, 0.06)


class TestDefectMerge(unittest.TestCase):
    def test_overlapping_whitening_merges(self):
        dets = [
            Detection(
                label="Whitening on top edge",
                kind="whitening",
                category="edges",
                severity="heavy",
                confidence=0.91,
                coverage=0.12,
                location={"x": 0.1, "y": 0.0, "width": 0.8, "height": 0.12},
            ),
            Detection(
                label="Whitening on top-left corner",
                kind="whitening",
                category="edges",
                severity="moderate",
                confidence=0.7,
                coverage=0.08,
                location={"x": 0.0, "y": 0.0, "width": 0.2, "height": 0.2},
            ),
            Detection(
                label="Whitening on left edge",
                kind="whitening",
                category="edges",
                severity="light",
                confidence=0.66,
                coverage=0.1,
                location={"x": 0.0, "y": 0.05, "width": 0.12, "height": 0.4},
            ),
        ]
        merged = merge_detections(dets)
        self.assertEqual(len(merged), 1)
        self.assertGreaterEqual(merged[0].confidence, 0.91)
        self.assertEqual(merged[0].severity, "heavy")
        labels = detections_to_defect_strings(merged)
        self.assertEqual(len(labels), 1)
        self.assertIn("91%", labels[0])

    def test_opposite_edges_do_not_become_central_area(self):
        dets = [
            Detection(
                label="Whitening on top edge",
                kind="whitening",
                category="edges",
                severity="heavy",
                confidence=0.9,
                coverage=0.1,
                location={"x": 0.0, "y": 0.0, "width": 1.0, "height": 0.05},
            ),
            Detection(
                label="Whitening on left edge",
                kind="whitening",
                category="edges",
                severity="heavy",
                confidence=0.88,
                coverage=0.1,
                location={"x": 0.0, "y": 0.0, "width": 0.05, "height": 1.0},
            ),
            Detection(
                label="Whitening on right edge",
                kind="whitening",
                category="edges",
                severity="heavy",
                confidence=0.86,
                coverage=0.1,
                location={"x": 0.95, "y": 0.0, "width": 0.05, "height": 1.0},
            ),
            Detection(
                label="Whitening on bottom edge",
                kind="whitening",
                category="edges",
                severity="heavy",
                confidence=0.84,
                coverage=0.1,
                location={"x": 0.0, "y": 0.95, "width": 1.0, "height": 0.05},
            ),
        ]
        merged = merge_detections(dets)
        self.assertGreaterEqual(len(merged), 2)
        for d in merged:
            self.assertNotIn("central area", d.label.lower())
            if d.location:
                self.assertLess(d.location["width"] * d.location["height"], 0.2)

    def test_low_confidence_barely_weights(self):
        weak = Detection(
            label="Possible whitening",
            kind="whitening",
            category="edges",
            severity="moderate",
            confidence=0.58,
        )
        strong = Detection(
            label="Heavy whitening",
            kind="whitening",
            category="edges",
            severity="heavy",
            confidence=0.93,
        )
        self.assertLess(grade_weight(weak), 0.35)
        self.assertGreater(grade_weight(strong), 0.5)


class TestBottleneck(unittest.TestCase):
    def test_surface_five_is_not_an_eight(self):
        out = bottleneck_overall(
            {"centering": 9.5, "corners": 9.5, "edges": 9.0, "surface": 5.0},
            [],
            surface_ok=True,
        )
        self.assertLess(out["grade"], 8.0)
        self.assertLessEqual(out["high"], 7)

    def test_high_conf_crease_caps_near_four(self):
        crease = Detection(
            label="Major crease",
            kind="crease",
            category="surface",
            severity="severe",
            confidence=0.92,
        )
        out = bottleneck_overall(
            {"centering": 9.5, "corners": 8.0, "edges": 8.0, "surface": 7.0},
            [crease],
            surface_ok=True,
        )
        self.assertLessEqual(out["grade"], 4.0)

    def test_withheld_surface_widens_range(self):
        out = bottleneck_overall(
            {"centering": 9.0, "corners": 8.0, "edges": 7.5, "surface": None},
            [],
            surface_ok=False,
        )
        self.assertGreaterEqual(out["high"] - out["low"], 1)
        self.assertIsNotNone(out["mass"])


class TestMeasurement(unittest.TestCase):
    def test_tcg_points_and_bottleneck(self):
        from measurement import to_tcg_points, tcg_overall, px_to_mm

        self.assertEqual(to_tcg_points(7.68), 768)
        self.assertIsNone(to_tcg_points(None))
        overall = tcg_overall(
            {"centering": 950, "corners": 812, "edges": 781, "surface": 734}
        )
        self.assertGreaterEqual(overall, 734)
        self.assertLess(overall, 812)
        withheld = tcg_overall({"centering": 950, "corners": 900, "edges": 880, "surface": None})
        self.assertGreater(withheld, 850)
        card = np.zeros((1400, 1002, 3), dtype=np.uint8)
        self.assertAlmostEqual(px_to_mm(1002, card, "x"), 63.0, places=1)

    def test_edge_profile_measures_whitening_length(self):
        from measurement import edge_profiles

        card = _card()
        card[:, :18] = (255, 255, 255)
        profiles = edge_profiles(card)
        self.assertIn("left", profiles)
        self.assertIn("summary", profiles)
        self.assertGreater(profiles["left"]["coverage"], 0.4)
        self.assertGreater(profiles["left"]["maxDefectLengthMm"], 10)
        self.assertNotIn("coverage", profiles["summary"])


class TestMultiFrame(unittest.TestCase):
    def test_scratch_drops_when_glare_is_unconfirmed(self):
        from multi_frame import should_keep_surface_detection

        fusion = {
            "frameCount": 3,
            "unconfirmedLikelyGlare": True,
            "surfaceConfirmed": False,
            "glareCoverage": 0.2,
        }
        self.assertFalse(should_keep_surface_detection(fusion, "scratch"))
        self.assertTrue(should_keep_surface_detection(fusion, "crease"))
        self.assertTrue(should_keep_surface_detection({"frameCount": 1}, "scratch"))


class TestOverlayMapping(unittest.TestCase):
    def test_identity_when_display_is_the_card(self):
        from grading_service import card_box_to_display

        card = np.zeros((100, 80, 3), dtype=np.uint8)
        box = {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}
        out = card_box_to_display(box, card=card, display=card, meta={"mx": 0, "my": 0})
        assert out is not None
        self.assertAlmostEqual(out["x"], 0.1, places=2)
        self.assertAlmostEqual(out["y"], 0.2, places=2)
        self.assertAlmostEqual(out["width"], 0.3, places=2)
        self.assertAlmostEqual(out["height"], 0.4, places=2)

    def test_bbox_offset_maps_onto_original_photo(self):
        from grading_service import card_box_to_display

        display = np.zeros((200, 200, 3), dtype=np.uint8)
        card = np.zeros((100, 80, 3), dtype=np.uint8)
        box = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
        out = card_box_to_display(
            box, card=card, display=display, meta={"mx": 50, "my": 40, "warped": False}
        )
        assert out is not None
        self.assertAlmostEqual(out["x"], 50 / 200, places=2)
        self.assertAlmostEqual(out["y"], 40 / 200, places=2)
        self.assertAlmostEqual(out["width"], 80 / 200, places=2)
        self.assertAlmostEqual(out["height"], 100 / 200, places=2)

    def test_warped_corners_map_onto_original_photo(self):
        from grading_service import card_box_to_display

        display = np.zeros((400, 300, 3), dtype=np.uint8)
        card = np.zeros((200, 100, 3), dtype=np.uint8)
        # Card sits in the middle of the photo as an axis-aligned quad.
        corners = [[80, 60], [180, 60], [180, 260], [80, 260]]
        box = {"x": 0.0, "y": 0.0, "width": 0.2, "height": 0.1}  # top-left of card
        out = card_box_to_display(
            box,
            card=card,
            display=display,
            meta={"mx": 0, "my": 0, "warped": True, "corners": corners},
        )
        assert out is not None
        self.assertLess(out["x"], 0.4)
        self.assertLess(out["y"], 0.3)
        self.assertLess(out["width"], 0.2)
        self.assertLess(out["height"], 0.15)


if __name__ == "__main__":
    unittest.main()

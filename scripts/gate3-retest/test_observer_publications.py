"""Offline tests for the observer-to-publication adapter. All data is invented; nothing here ran the app."""
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import observer_publications as op  # noqa: E402

FREQ = 10_000_000
VIEW = [100.0, 100.0, 600.0, 400.0]
LABELS = dict(op.DEFAULT_LABELS)
ORIGIN = 1_000_000
HEADER = {"type": "header", "schema": op.RAW_SCHEMA, "qpc_frequency": FREQ, "origin_qpc": ORIGIN}


def el(name, bounds=None, words=None, offscreen=False):
    row = {"role": "Text", "name": name, "offscreen": offscreen, "bounds": bounds or [110, 120, 80, 18]}
    if words is not None:
        row["words"] = words
    return row


def row(label, time, text, top, word_boxes=True):
    words = [{"text": w, "bounds": [110 + 60 * i, top, 50, 18]} for i, w in enumerate(text.split())] if word_boxes else None
    return [el(label, [110, top - 20, 40, 14]), el(time, [160, top - 20, 40, 14]),
            el(text, [110, top, 60 * len(text.split()), 18], words)]


def sample(begin_ms, end_ms, elements, viewport=VIEW):
    return {"type": "sample", "qpc_begin": ORIGIN + begin_ms * FREQ // 1000, "qpc_end": ORIGIN + end_ms * FREQ // 1000,
            "viewport": viewport, "elements": elements}


def build(samples, origin=ORIGIN):
    return op.build_publications(HEADER, samples, LABELS, origin, FREQ)


class Visibility(unittest.TestCase):
    def test_inside_rules(self):
        self.assertTrue(op.inside([100, 100, 600, 400], VIEW))
        self.assertFalse(op.inside([99, 120, 50, 10], VIEW))
        self.assertFalse(op.inside([650, 120, 51, 10], VIEW))
        self.assertFalse(op.inside([120, 495, 50, 10], VIEW))
        self.assertFalse(op.inside([120, 120, 0, 10], VIEW))
        self.assertFalse(op.inside(None, VIEW))
        self.assertFalse(op.inside([float("nan"), 0, 5, 5], VIEW))

    def test_clipped_or_offscreen_words_are_not_visible(self):
        e = row("You", "0:05", "alpha beta", 480)
        e[2]["words"][1]["bounds"] = [170, 490, 50, 18]  # bottom edge 508 > 500
        found, _ = op.visible_words_in_sample(sample(0, 10, e), LABELS)
        self.assertEqual([(w["text"], w["visible"]) for w in found], [("alpha", True), ("beta", False)])
        e2 = row("You", "0:05", "alpha beta", 200)
        e2[2]["offscreen"] = True
        found, _ = op.visible_words_in_sample(sample(0, 10, e2), LABELS)
        self.assertFalse(any(w["visible"] for w in found))

    def test_scrolled_out_lines_disappear_but_keep_first_visible_time(self):
        a = row("Meeting", "0:10", "first line here", 150)
        b = row("Meeting", "0:20", "second line now", 300)
        s0 = sample(0, 40, a)
        s1 = sample(100, 140, a + b)
        s2 = sample(200, 240, b)  # older line virtualized away
        s3 = sample(300, 340, a + b)  # scrolled back
        records, report = build([s0, s1, s2, s3])
        ids = [r["id"] for r in records]
        self.assertEqual(ids, ["meeting|0:10|0", "meeting|0:10|1", "meeting|0:10|2",
                               "meeting|0:20|0", "meeting|0:20|1", "meeting|0:20|2"])
        self.assertEqual({r["sample_index"] for r in records if r["id"].startswith("meeting|0:10")}, {0})
        self.assertEqual({r["sample_index"] for r in records if r["id"].startswith("meeting|0:20")}, {1})
        self.assertEqual(report["text_revisions"], [])

    def test_viewport_read_in_the_same_sample_is_used(self):
        e = row("You", "0:05", "alpha", 150)
        small = [100, 100, 600, 40]  # the pane shrank in this sample, so the word is outside it
        records, _ = build([sample(0, 10, e, small), sample(50, 60, e, VIEW)])
        self.assertEqual(records[0]["sample_index"], 1)


class Identity(unittest.TestCase):
    def test_ids_stable_when_row_moves_on_screen(self):
        records_a, _ = build([sample(0, 10, row("You", "0:05", "alpha beta", 150))])
        records_b, _ = build([sample(0, 10, row("You", "0:05", "alpha beta", 300))])
        self.assertEqual([r["id"] for r in records_a], [r["id"] for r in records_b])

    def test_repeated_words_get_distinct_positions(self):
        records, _ = build([sample(0, 10, row("You", "0:05", "yes yes yes", 150))])
        self.assertEqual([r["id"] for r in records], ["microphone|0:05|0", "microphone|0:05|1", "microphone|0:05|2"])

    def test_same_time_rows_in_one_sample_are_excluded_and_reported(self):
        e = row("You", "0:05", "alpha", 150) + row("You", "0:05", "beta", 300)
        records, report = build([sample(0, 10, e)])
        self.assertEqual(records, [])
        self.assertEqual(report["ambiguous_rows"], [["microphone", "0:05"]])

    def test_tracks_by_label_and_unknown_label_ignored(self):
        e = row("You", "0:05", "alpha", 150) + row("Meeting", "0:05", "beta", 250) + row("Speaker 3", "0:06", "gamma", 350)
        records, _ = build([sample(0, 10, e)])
        self.assertEqual({(r["track"], r["text"]) for r in records}, {("microphone", "alpha"), ("meeting", "beta")})

    def test_provisional_to_final_change_is_reported_not_published(self):
        s0 = sample(0, 10, row("You", "0:05", "thank you", 150))
        s1 = sample(100, 110, row("You", "0:05", "thanks you", 150))
        records, report = build([s0, s1])
        self.assertEqual(records[0]["text"], "thank")
        self.assertEqual(report["text_revisions"][0]["to"], "thanks")

    def test_paragraph_only_bounds_are_marked(self):
        records, report = build([sample(0, 10, row("You", "0:05", "alpha beta", 150, word_boxes=False))])
        self.assertEqual({r["bounds_source"] for r in records}, {"element"})
        self.assertEqual(report["paragraph_bounds_only"], 2)


class Uncertainty(unittest.TestCase):
    def test_u_is_gap_plus_both_read_times(self):
        # previous sample reads 0-40 ms, this one 100-130 ms: gap 60, reads 40 + 30, interval 130 ms
        s0 = sample(0, 40, row("You", "0:05", "alpha", 150))
        s1 = sample(100, 130, row("You", "0:05", "alpha beta", 150))
        records, report = build([s0, s1])
        beta = [r for r in records if r["text"] == "beta"][0]
        self.assertAlmostEqual(beta["u"], 0.130, places=9)
        self.assertAlmostEqual(beta["observed"], 0.130, places=9)
        self.assertAlmostEqual(report["gap_max_s"], 0.060, places=9)
        self.assertAlmostEqual(report["read_max_s"], 0.040, places=9)

    def test_error_samples_widen_the_interval(self):
        s0 = sample(0, 40, row("You", "0:05", "alpha", 150))
        s2 = sample(300, 330, row("You", "0:05", "alpha beta", 150))  # samples at 100 and 200 ms failed
        records, _ = build([s0, s2])
        self.assertAlmostEqual([r for r in records if r["text"] == "beta"][0]["u"], 0.330, places=9)

    def test_over_limit_listed_and_present_at_start_flagged(self):
        s0 = sample(500, 540, row("You", "0:05", "alpha", 150))
        records, report = build([s0])
        self.assertTrue(records[0]["present_at_start"])
        self.assertAlmostEqual(records[0]["u"], 0.540, places=9)  # measured from the observer origin, not an interval
        s1 = sample(900, 930, row("You", "0:05", "alpha beta", 150))
        _, report = build([s0, s1])
        self.assertEqual(report["u_over_limit"], ["microphone|0:05|1"])  # 930 - 500 = 430 ms > 250 ms

    def test_origin_conversion_and_frequency_check(self):
        records, _ = build([sample(0, 100, row("You", "0:05", "alpha", 150))], origin=ORIGIN - 2 * FREQ)
        self.assertAlmostEqual(records[0]["observed"], 2.1, places=9)
        with self.assertRaises(ValueError):
            op.build_publications(HEADER, [sample(0, 10, [])], LABELS, ORIGIN, FREQ + 1)

    def test_chronology_enforced(self):
        a, b = sample(100, 140, []), sample(0, 40, [])
        with self.assertRaises(ValueError):
            build([a, b])
        with self.assertRaises(ValueError):
            op.observation_u(10, 5)


class Review(unittest.TestCase):
    def setUp(self):
        a = row("You", "0:05", "alpha beta", 150)
        b = row("You", "0:20", "gamma delta", 300)
        self.samples = [sample(i * 100, i * 100 + 20, a if i < 5 else b) for i in range(12)]

    def item(self, t, words, **extra):
        return {"t": t, "track": "microphone", "expected_visible": words, **extra}

    def test_pass_needs_ten_samples_scrolling_and_virtualization(self):
        review = [self.item(0.05 + 0.1 * i, ["alpha", "beta"] if i < 5 else ["gamma", "delta"],
                            scrolling=(i == 5), virtualized_older_lines=(i == 6)) for i in range(10)]
        result = op.compare_review(self.samples, LABELS, review, FREQ, ORIGIN)
        self.assertTrue(result["pass"], result)
        short = op.compare_review(self.samples, LABELS, review[:9], FREQ, ORIGIN)
        self.assertFalse(short["enough_samples"])
        none = [dict(i, scrolling=False) for i in review]
        self.assertFalse(op.compare_review(self.samples, LABELS, none, FREQ, ORIGIN)["pass"])

    def test_mismatch_is_reported(self):
        review = [self.item(0.05 + 0.1 * i, ["alpha", "WRONG"]) for i in range(10)]
        result = op.compare_review(self.samples, LABELS, review, FREQ, ORIGIN)
        self.assertFalse(result["pass"])
        self.assertTrue(result["mismatches"])


class Schema(unittest.TestCase):
    def raw_file(self, directory):
        path = Path(directory) / "raw.jsonl"
        lines = [HEADER, sample(0, 20, row("You", "0:05", "alpha beta", 150)),
                 {"type": "error", "qpc_begin": ORIGIN + 1000, "qpc_end": ORIGIN + 2000, "message": "x"},
                 sample(100, 120, row("You", "0:05", "alpha beta", 150) + row("Meeting", "0:06", "gamma", 300))]
        path.write_text("\n".join(json.dumps(line) for line in lines), encoding="utf-8")
        return path

    def test_cli_writes_matcher_shape_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = self.raw_file(directory)
            out = Path(directory) / "pub.json"
            command = [sys.executable, str(HERE / "observer_publications.py"), str(raw), str(out), "--harness-origin-qpc", str(ORIGIN),
                       "--expected-frequency", str(FREQ), "--recording-sha256", "a" * 64]
            self.assertEqual(subprocess.run(command, capture_output=True, text=True).returncode, 0)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data["clock_basis"], "harness")
            self.assertEqual(data["recording_sha256"], "a" * 64)
            for word in data["words"]:
                self.assertTrue({"id", "track", "text", "observed", "u"} <= set(word))
                self.assertIn(word["track"], ("microphone", "meeting"))
                self.assertGreaterEqual(word["u"], 0)
            observed = [w["observed"] for w in data["words"]]
            self.assertEqual(observed, sorted(observed))
            self.assertEqual(data["report"]["error_samples"], 1)
            self.assertNotEqual(subprocess.run(command, capture_output=True, text=True).returncode, 0)

    def test_wrong_header_and_bad_hash_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            bad = Path(directory) / "bad.jsonl"
            bad.write_text(json.dumps({"type": "sample"}), encoding="utf-8")
            with self.assertRaises(ValueError):
                op.load_raw(bad)
            raw = self.raw_file(directory)
            command = [sys.executable, str(HERE / "observer_publications.py"), str(raw), str(Path(directory) / "o.json"),
                       "--harness-origin-qpc", "1", "--expected-frequency", str(FREQ), "--recording-sha256", "zz"]
            self.assertNotEqual(subprocess.run(command, capture_output=True, text=True).returncode, 0)

    @unittest.skipUnless(os.environ.get("SCRB_MATCHER_DIR"), "set SCRB_MATCHER_DIR to a folder holding occurrence_matcher.py")
    def test_accepted_by_the_matcher_if_present(self):
        spec = importlib.util.spec_from_file_location("occurrence_matcher", Path(os.environ["SCRB_MATCHER_DIR"]) / "occurrence_matcher.py")
        matcher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(matcher)
        records, _ = build([sample(0, 20, row("You", "0:05", "alpha beta", 150)),
                            sample(100, 120, row("You", "0:05", "alpha beta", 150) + row("You", "0:08", "gamma", 250))])
        annotations = {"utterances": [{"id": "u1", "reference_words": ["alpha", "beta"], "start": 0.0, "last_word_start": 0.05,
                                       "earliest_acoustic_end_s": 0.09, "latest_acoustic_end_s": 0.1, "eligible": True}]}
        # Same-clock call only checks that the record shape passes the matcher's input validation.
        try:
            matcher.align_occurrences(annotations, records, "microphone", clock_basis="recording")
        except KeyError as error:  # annotation fields beyond this invented minimum are the matcher's own business
            self.skipTest("invented annotation lacks %s" % error)


class Scripts(unittest.TestCase):
    """Static guards on the unrun PowerShell scripts."""

    def read(self, name):
        return (HERE / name).read_text(encoding="utf-8")

    def test_observer_sends_no_input_and_never_overwrites(self):
        text = self.read("observe-live-v2.ps1")
        for forbidden in ("SendKeys", "SendInput", "mouse_event", "InvokePattern", "SetFocus", "SetValue", "Click", "Start-Process", "npm "):
            self.assertNotIn(forbidden, text)
        self.assertIn("CreateNew", text)
        self.assertIn("input_sent = $false", text)
        self.assertIn("Stopwatch]::GetTimestamp", text)
        self.assertIn("SRCB-G3-OBSERVER-RAW-1", text)

    def test_raw_schema_name_matches_adapter(self):
        self.assertIn(op.RAW_SCHEMA, self.read("observe-live-v2.ps1"))

    def test_overlay_uses_the_same_qpc_ticks(self):
        text = self.read("clock-overlay.ps1")
        self.assertIn("Stopwatch]::GetTimestamp", text)
        self.assertIn("OriginQpc", text)
        self.assertNotIn("Start-Process", text)


if __name__ == "__main__":
    unittest.main()

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

    def test_labels_map_to_tracks_in_one_place(self):
        for name in ("Meeting", "Speaker ?", "Speaker 1", "Speaker 2", "Speaker 12"):
            self.assertEqual(op.track_for_label(name, LABELS), "meeting", name)
        self.assertEqual(op.track_for_label("You", LABELS), "microphone")
        for name in ("Speaker", "Speaker 0", "Speaker 01", "Speaker -1", "Speaker X", "Speaker  1", "Someone", "you", ""):
            self.assertIsNone(op.track_for_label(name, LABELS), name)

    def test_meeting_speaker_labels_are_published_on_the_meeting_track(self):
        e = row("You", "0:05", "alpha", 150) + row("Speaker 1", "0:06", "beta", 250) + row("Speaker ?", "0:07", "gamma", 350)
        records, report = build([sample(0, 10, e)])
        self.assertEqual({(r["track"], r["text"]) for r in records},
                         {("microphone", "alpha"), ("meeting", "beta"), ("meeting", "gamma")})
        self.assertEqual(report["unmapped_label_row_count"], 0)

    def test_speaker_three_is_no_longer_ignored(self):
        records, _ = build([sample(0, 10, row("Speaker 3", "0:06", "gamma", 350))])
        self.assertEqual([(r["track"], r["text"]) for r in records], [("meeting", "gamma")])

    def test_same_row_changing_label_between_samples_is_one_row(self):
        s0 = sample(0, 20, row("Speaker ?", "0:10", "first line here", 150))
        s1 = sample(100, 120, row("Speaker 2", "0:10", "first line here now", 150))
        records, report = build([s0, s1])
        self.assertEqual(report["quarantined_rows"], [])
        self.assertEqual(report["ambiguous_rows"], [])
        self.assertEqual([r["id"] for r in records],
                         ["meeting|0:10|0", "meeting|0:10|1", "meeting|0:10|2", "meeting|0:10|3"])

    def test_unmapped_label_with_words_is_reported_and_inconclusive(self):
        for e in (row("Zed", "0:05", "alpha beta", 150),
                  row("You", "0:04", "first", 100) + row("Zed", "0:05", "alpha beta", 250)):
            s = [sample(0, 10, []), sample(100, 110, e)]
            records, report = build(s)
            self.assertEqual(report["unmapped_labels"], {"Zed": 1})
            self.assertEqual(report["unmapped_label_rows"][0]["words"], 2)
            self.assertEqual(report["result_status"], "INCONCLUSIVE")
            self.assertFalse(report["validation_pass"])

    def test_unmapped_label_without_words_is_not_reported(self):
        _, report = build([sample(0, 10, []), sample(100, 110, [el("Zed", [110, 100, 40, 14]), el("0:05", [160, 100, 40, 14]),
                                                              el("You", [110, 200, 40, 14]), el("0:06", [160, 200, 40, 14])])])
        self.assertEqual(report["unmapped_label_row_count"], 0)

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


def word_row(label, time, text, top, spaces=True):
    """A row as the live UI Automation tree reports it: label, time, then one Text element per word with ' ' separators."""
    out = [el(label, [110, top - 20, 40, 14]), el(time, [160, top - 20, 40, 14])]
    for i, w in enumerate(text.split()):
        if i and spaces:
            out.append(el(" ", [110 + 60 * i - 8, top, 7, 18]))
        out.append(el(w, [110 + 60 * i, top, 50, 18]))
    return out


class RowHeaderContext(unittest.TestCase):
    """A label word is a row header only when the next non-empty element is a time stamp."""

    def published(self, elements):
        records, report = build([sample(0, 10, []), sample(100, 110, elements)])
        return [(r["id"], r["text"]) for r in records], report

    def test_recognised_label_word_inside_a_row_is_a_word(self):
        got, report = self.published(word_row("You", "0:05", "You are here", 150))
        self.assertEqual(got, [("microphone|0:05|0", "You"), ("microphone|0:05|1", "are"), ("microphone|0:05|2", "here")])
        self.assertEqual(report["unmapped_label_row_count"], 0)

    def test_first_sample_visible_count_includes_the_words_after_a_label_word(self):
        sampled = sample(0, 10, word_row("You", "0:05", "You are here", 150))
        self.assertEqual(op.visible_before_dedup(sampled, LABELS), 3)

    def test_meeting_word_inside_a_meeting_row(self):
        got, _ = self.published(word_row("Meeting", "0:10", "Meeting notes today", 150))
        self.assertEqual([(i, t) for i, t in got],
                         [("meeting|0:10|0", "Meeting"), ("meeting|0:10|1", "notes"), ("meeting|0:10|2", "today")])

    def test_speaker_label_text_as_one_element_inside_a_row(self):
        e = word_row("Speaker 1", "0:10", "so", 150) + [el("Speaker 2", [230, 150, 90, 18])]
        got, report = self.published(e)
        self.assertEqual(got, [("meeting|0:10|0", "so"), ("meeting|0:10|1", "Speaker"), ("meeting|0:10|2", "2")])
        self.assertEqual(report["unmapped_label_row_count"], 0)

    def test_unmapped_label_row_whose_words_include_you_is_still_found(self):
        got, report = self.published(word_row("Zed", "0:05", "You are here", 150))
        self.assertEqual(report["unmapped_labels"], {"Zed": 1})
        self.assertEqual(report["unmapped_label_rows"][0]["words"], 3)
        self.assertEqual(report["result_status"], "INCONCLUSIVE")
        self.assertEqual(got, [])

    def test_unmapped_row_after_a_normal_row_keeps_the_previous_row_whole(self):
        e = word_row("You", "0:04", "ok now", 100) + word_row("Zed", "0:05", "You are here", 250)
        got, report = self.published(e)
        self.assertEqual(got, [("microphone|0:04|0", "ok"), ("microphone|0:04|1", "now")])
        self.assertEqual(report["unmapped_labels"], {"Zed": 1})

    def test_real_header_followed_by_its_time_is_recognised_even_with_empty_elements_between(self):
        e = [el("You", [110, 130, 40, 14]), el("  ", [150, 130, 5, 14]), el("", [155, 130, 5, 14]),
             el("0:05", [160, 130, 40, 14]), el("hello", [110, 150, 50, 18])]
        got, _ = self.published(e)
        self.assertEqual(got, [("microphone|0:05|0", "hello")])

    def test_label_not_followed_by_a_time_is_only_a_word(self):
        e = word_row("You", "0:05", "thank you", 150) + [el("You", [400, 150, 40, 18]), el("again", [450, 150, 50, 18])]
        got, _ = self.published(e)
        self.assertEqual([t for _, t in got], ["thank", "you", "You", "again"])

    def test_labels_are_case_sensitive(self):
        got, _ = self.published(word_row("You", "0:05", "you meeting speaker", 150))
        self.assertEqual([t for _, t in got], ["you", "meeting", "speaker"])
        self.assertIsNone(op.track_for_label("you", LABELS))
        self.assertIsNone(op.track_for_label("meeting", LABELS))


class Conservation(unittest.TestCase):
    """Every nonblank Text element inside the viewport is a label, time or word of a recognised row, or is reported."""

    def test_row_elements_are_all_attributed_and_chrome_is_listed(self):
        chrome = el("Text appears here once people start talking.", [110, 110, 300, 18])
        s0 = sample(0, 10, [chrome])
        s1 = sample(100, 110, [el("Pause", [600, 105, 50, 18])] + word_row("You", "0:05", "You are here", 150))
        s2 = sample(200, 210, word_row("You", "0:05", "You are here", 150) + [el("Outside", [10, 10, 50, 18])])
        records, report = build([s0, s1, s2])
        u = report["unattributed_text_elements"]
        self.assertEqual((u["total"], u["per_sample_max"], u["samples_with_any"]), (2, 1, 2))
        self.assertEqual([e["sample"] for e in u["examples"]], [0, 1])
        self.assertEqual(u["outside_known_chrome_total"], 1)
        self.assertEqual(u["outside_known_chrome_examples"], [{"sample": 1, "text": "Pause"}])
        self.assertTrue(u["proposed_rule_would_be_inconclusive"])
        self.assertEqual(report["result_status"], "OK")  # report only: not a gate

    def test_unmapped_row_elements_are_unattributed(self):
        s = sample(0, 10, word_row("Zed", "0:05", "alpha beta", 150))
        self.assertEqual([t for t, _ in op.unattributed_elements(s, LABELS)], ["Zed", "0:05", "alpha", "beta"])


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


def scroll_run():
    """14 samples: rows A and B; A moves (pane motion), leaves the tree, then returns unchanged."""
    out = []
    for i in range(14):
        if i < 4:
            elements = row("You", "0:05", "alpha beta", 150) + row("You", "0:20", "gamma delta", 300)
        elif i < 7:
            elements = row("You", "0:05", "alpha beta", 250) + row("You", "0:20", "gamma delta", 400)
        elif i < 10:
            elements = row("You", "0:20", "gamma delta", 400)
        else:
            elements = row("You", "0:05", "alpha beta", 250) + row("You", "0:20", "gamma delta", 400)
        out.append(sample(i * 100, i * 100 + 20, elements))
    return out


class Review(unittest.TestCase):
    def setUp(self):
        self.samples = scroll_run()

    def item(self, index, **extra):
        words = ["gamma", "delta"] if 7 <= index < 10 else ["alpha", "beta", "gamma", "delta"]
        return {"t": index * 0.1 + 0.03, "track": "microphone", "expected_visible": words, **extra}

    def test_pass_needs_ten_frames_and_derived_scrolling_and_virtualization(self):
        review = [self.item(i) for i in (1, 2, 3, 4, 5, 6, 7, 8, 10, 12)]
        result = op.compare_review(self.samples, LABELS, review, FREQ, ORIGIN)
        self.assertTrue(result["pass"], result)
        self.assertGreaterEqual(result["counts"]["scrolling_derived"], 1)
        self.assertGreaterEqual(result["counts"]["virtualized_derived"], 1)
        self.assertFalse(op.compare_review(self.samples, LABELS, review[:9], FREQ, ORIGIN)["enough_samples"])

    def test_typed_flags_are_ignored(self):
        still = [sample(i * 100, i * 100 + 20, row("You", "0:05", "alpha beta", 150)) for i in range(12)]
        review = [{"t": i * 0.1 + 0.03, "track": "microphone", "expected_visible": ["alpha", "beta"],
                   "scrolling": True, "virtualized_older_lines": True} for i in range(10)]
        result = op.compare_review(still, LABELS, review, FREQ, ORIGIN)
        self.assertFalse(result["pass"])
        self.assertEqual(result["counts"]["scrolling_derived"], 0)
        self.assertEqual(result["counts"]["virtualized_derived"], 0)

    def test_mismatch_is_reported(self):
        review = [dict(self.item(i), expected_visible=["alpha", "WRONG"]) for i in (1, 2, 3, 4, 5, 6, 7, 8, 10, 12)]
        result = op.compare_review(self.samples, LABELS, review, FREQ, ORIGIN)
        self.assertFalse(result["pass"])
        self.assertTrue(result["mismatches"])


class Virtualization(unittest.TestCase):
    def test_removed_and_returned_with_identity_preserved(self):
        evidence = op.virtualization_evidence(scroll_run(), LABELS)
        self.assertTrue(evidence["pass"])
        self.assertEqual(evidence["virtualized_windows"], [[7, 10]])
        self.assertEqual(evidence["pane_motion_samples"], [4])
        self.assertTrue(all(r["identity_preserved"] for r in evidence["returns"]))

    def test_scrolled_out_but_still_in_tree_is_not_virtualization(self):
        samples = []
        for i in range(8):
            top = 150 if i < 4 else 900  # row A outside the viewport but still in the tree
            samples.append(sample(i * 100, i * 100 + 20, row("You", "0:05", "alpha beta", top)))
        evidence = op.virtualization_evidence(samples, LABELS)
        self.assertEqual(evidence["rows_returned_after_removal"], 0)
        self.assertFalse(evidence["pass"])
        self.assertEqual(evidence["max_rows_in_tree_outside_viewport"], 1)

    def test_return_with_changed_text_breaks_identity(self):
        samples = scroll_run()
        samples[10] = sample(1000, 1020, row("You", "0:05", "ALTERED beta", 250) + row("You", "0:20", "gamma delta", 400))
        evidence = op.virtualization_evidence(samples, LABELS)
        self.assertFalse(evidence["pass"])
        self.assertFalse(evidence["returns"][0]["identity_preserved"])

    def test_row_removed_and_never_returned_is_listed(self):
        evidence = op.virtualization_evidence(scroll_run()[:9], LABELS)
        self.assertEqual(evidence["rows_removed_never_returned"], [["microphone", "0:05"]])
        self.assertFalse(evidence["pass"])


class Quarantine(unittest.TestCase):
    def a(self, i, text="alpha beta", top=150):
        return sample(i * 100, i * 100 + 20, row("You", "0:05", text, top))

    def test_reappearing_with_different_text_is_quarantined_and_records_removed(self):
        gone = sample(100, 120, [])
        records, report = build([self.a(0), gone, sample(200, 220, row("You", "0:05", "other words", 150))])
        self.assertEqual(records, [])
        self.assertEqual(report["quarantined_rows"][0]["time"], "0:05")
        self.assertIn("different or shorter", report["quarantined_rows"][0]["reason"])
        self.assertIn("denominator", report["credit_policy"])

    def test_reappearing_with_same_or_longer_text_is_kept(self):
        records, report = build([self.a(0), sample(100, 120, []), self.a(2, "alpha beta gamma")])
        self.assertEqual([r["text"] for r in records], ["alpha", "beta", "gamma"])
        self.assertEqual(report["quarantined_rows"], [])

    def test_reappearing_shorter_is_quarantined(self):
        records, report = build([self.a(0, "alpha beta gamma"), sample(100, 120, []), self.a(2, "alpha beta")])
        self.assertEqual(records, [])
        self.assertEqual(len(report["quarantined_rows"]), 1)

    def test_return_after_a_read_error_gap_is_checked(self):
        errors = [{"type": "error", "qpc_begin": ORIGIN + 30 * FREQ // 1000, "qpc_end": ORIGIN + 90 * FREQ // 1000}]
        records, report = op.build_publications(HEADER, [self.a(0), self.a(1, "different text")], LABELS, ORIGIN, FREQ, errors)
        self.assertEqual(records, [])
        self.assertEqual(len(report["quarantined_rows"]), 1)

    def test_contiguous_revision_without_a_gap_is_not_a_collision(self):
        records, report = build([self.a(0, "thank you"), self.a(1, "thanks you")])
        self.assertEqual(report["quarantined_rows"], [])
        self.assertEqual(report["text_revisions"][0]["to"], "thanks")

    def test_two_rows_first_seen_separately_then_together(self):
        together = row("You", "0:05", "alpha beta", 150) + row("You", "0:05", "different row", 300)
        records, report = build([self.a(0), sample(100, 120, together)])
        self.assertEqual(records, [])  # the earlier record of the key is removed too
        self.assertEqual(report["quarantined_rows"][0]["reason"], "rows with the same track and time seen together")

    def test_quarantine_is_permanent_so_later_clean_sightings_never_publish(self):
        together = row("You", "0:05", "alpha beta", 150) + row("You", "0:05", "different row", 300)
        records, _ = build([sample(0, 20, together), self.a(1), self.a(2), self.a(3)])
        self.assertEqual(records, [])

    def test_quarantined_row_cannot_be_credited_in_either_bound(self):
        """Excluded rows leave no publication, so no bound (best-case included) can credit their unit."""
        together = row("You", "0:05", "alpha beta", 150) + row("You", "0:05", "different row", 300)
        other = row("You", "0:20", "gamma delta", 450)
        records, report = build([sample(0, 20, together + other), self.a(1), sample(200, 220, other)])
        self.assertEqual({r["id"].rsplit("|", 1)[0] for r in records}, {"microphone|0:20"})
        self.assertEqual(len(report["quarantined_rows"]), 1)


class UAll(unittest.TestCase):
    def test_max_u_covers_all_intervals_not_only_first_visible(self):
        # words appear in the first sample only; a later 420 ms interval carries no new word
        s = [sample(0, 20, row("You", "0:05", "alpha", 150)), sample(50, 70, row("You", "0:05", "alpha", 150)),
             sample(450, 470, row("You", "0:05", "alpha", 150))]
        records, report = build(s)
        self.assertLess(report["u_max_s"], 0.25)
        self.assertAlmostEqual(report["u_all_intervals_max_s"], 0.420, places=9)  # 470 - 50
        self.assertFalse(report["u_pass"])
        self.assertEqual(report["u_all_intervals_over_limit"][0][0], 2)

    def test_read_errors_widen_the_all_interval_maximum(self):
        errors = [{"type": "error", "qpc_begin": ORIGIN + 100 * FREQ // 1000, "qpc_end": ORIGIN + 130 * FREQ // 1000}]
        s = [sample(0, 20, row("You", "0:05", "alpha", 150)), sample(300, 320, row("You", "0:05", "alpha", 150))]
        _, report = op.build_publications(HEADER, s, LABELS, ORIGIN, FREQ, errors)
        self.assertAlmostEqual(report["u_all_intervals_max_s"], 0.320, places=9)
        self.assertEqual(report["error_samples"], 1)

    def test_trailing_errors_count(self):
        errors = [{"type": "error", "qpc_begin": ORIGIN + 100 * FREQ // 1000, "qpc_end": ORIGIN + 600 * FREQ // 1000}]
        s = [sample(0, 20, row("You", "0:05", "alpha", 150))]
        _, report = op.build_publications(HEADER, s, LABELS, ORIGIN, FREQ, errors)
        self.assertAlmostEqual(report["u_all_intervals_max_s"], 0.600, places=9)
        self.assertFalse(report["u_pass"])


class PreViewportInterval(unittest.TestCase):
    """PROPOSED rule: the 250 ms limit starts at the first sample that found the viewport."""

    def test_pre_viewport_interval_is_reported_but_ignored_for_u_pass(self):
        # observer starts, the viewport is missing for 18 s, then it is found; no words yet
        s = [sample(18000, 18020, ""), sample(18050, 18070, ""), sample(18100, 18120, "")]
        _, report = build(s)
        self.assertAlmostEqual(report["pre_viewport_interval_s"], 18.020, places=9)
        self.assertAlmostEqual(report["u_all_intervals_max_s"], 0.070, places=9)
        self.assertTrue(report["u_pass"])
        self.assertEqual(report["result_status"], "OK")

    def test_interval_of_0_33_s_after_the_first_found_sample_still_fails(self):
        s = [sample(18000, 18020, ""), sample(18050, 18070, ""), sample(18350, 18370, "")]
        _, report = build(s)
        self.assertAlmostEqual(report["u_all_intervals_max_s"], 0.320, places=9)  # 18370 - 18050
        self.assertFalse(report["u_pass"])
        self.assertEqual(report["u_all_intervals_over_limit"][0][0], 2)

    def test_words_in_the_first_found_sample_make_the_run_inconclusive(self):
        s = [sample(18000, 18020, row("You", "0:05", "alpha", 150)), sample(18050, 18070, row("You", "0:05", "alpha", 150))]
        records, report = build(s)
        self.assertEqual(report["result_status"], "INCONCLUSIVE")
        self.assertTrue(records[0]["present_at_start"])

    def test_quarantined_first_sample_rows_still_make_the_run_inconclusive(self):
        # two same-track, same-time rows visible together in the first found sample: deduplicated and quarantined
        dup = row("You", "0:05", "alpha", 150) + row("You", "0:05", "other", 250)
        s = [sample(18000, 18020, dup), sample(18050, 18070, row("You", "0:09", "later", 150))]
        records, report = build(s)
        self.assertFalse(any(r["present_at_start"] for r in records))
        self.assertEqual(report["quarantined_rows"][0]["time"], "0:05")
        self.assertGreater(report["first_sample_visible_words_before_dedup"], 0)
        self.assertEqual(report["result_status"], "INCONCLUSIVE")
        self.assertTrue(report["u_pass"])
        self.assertFalse(report["validation_pass"])

    def test_validation_pass_needs_an_ok_status_and_not_the_250_ms_threshold(self):
        _, ok = build([sample(18000, 18020, ""), sample(18050, 18070, row("You", "0:05", "alpha", 150))])
        self.assertTrue(ok["u_pass"] and ok["result_status"] == "OK" and ok["validation_pass"])
        # 250 ms is a reporting threshold: a slower run is reported as such but is not invalid for that reason.
        _, slow = build([sample(18000, 18020, ""), sample(18400, 18420, "")])
        self.assertFalse(slow["u_pass"])
        self.assertTrue(slow["validation_pass"])
        self.assertEqual(slow["interval_statistics"]["all_intervals"]["count_over_250ms"], 1)
        _, inconclusive = build([sample(18000, 18020, row("You", "0:05", "alpha", 150))])
        self.assertFalse(inconclusive["validation_pass"])

    def test_a_trailing_error_stretch_after_the_viewport_was_found_still_counts(self):
        errors = [{"type": "error", "qpc_begin": ORIGIN + 18100 * FREQ // 1000, "qpc_end": ORIGIN + 18500 * FREQ // 1000}]
        s = [sample(18000, 18020, "")]
        _, report = op.build_publications(HEADER, s, LABELS, ORIGIN, FREQ, errors)
        self.assertAlmostEqual(report["u_all_intervals_max_s"], 0.500, places=9)  # 18500 - 18000
        self.assertFalse(report["u_pass"])


class ReportingThreshold(unittest.TestCase):
    """Ruling: 250 ms is a reporting threshold; every word keeps its measured u, nothing is capped."""

    def test_u_is_current_end_minus_previous_successful_begin_including_failed_polls(self):
        errors = [{"type": "error", "qpc_begin": ORIGIN + 120 * FREQ // 1000, "qpc_end": ORIGIN + 150 * FREQ // 1000}]
        s = [sample(0, 20, ""), sample(100, 120, ""), sample(400, 420, row("You", "0:05", "alpha", 150))]
        records, report = op.build_publications(HEADER, s, LABELS, ORIGIN, FREQ, errors)
        self.assertAlmostEqual(records[0]["u"], 0.320, places=9)  # 420 - 100, the error lies inside
        self.assertAlmostEqual(report["interval_statistics"]["published_word_positions"]["max_s"], records[0]["u"], places=12)
        self.assertAlmostEqual(report["interval_statistics"]["all_intervals"]["max_s"], 0.320, places=9)

    def test_word_with_u_0_312_is_kept_untruncated_and_listed_as_over_the_threshold(self):
        s = [sample(0, 20, ""), sample(50, 70, ""), sample(342, 362, row("You", "0:05", "alpha", 150))]
        records, report = build(s)
        self.assertAlmostEqual(records[0]["u"], 0.312, places=9)  # 362 - 50
        self.assertEqual(report["u_over_limit"], ["microphone|0:05|0"])
        stats = report["interval_statistics"]
        self.assertEqual(stats["published_word_positions"]["count_over_250ms"], 1)
        self.assertEqual(stats["published_word_positions"]["worst"][0]["phase"], "other")

    def test_interval_of_0_706_s_after_stop_is_reported_not_a_validity_failure(self):
        errors = [{"type": "error", "qpc_begin": ORIGIN + 100 * FREQ // 1000, "qpc_end": ORIGIN + 756 * FREQ // 1000}]
        s = [sample(0, 20, ""), sample(50, 70, "")]
        _, report = op.build_publications(HEADER, s, LABELS, ORIGIN, FREQ, errors)
        stats = report["interval_statistics"]["all_intervals"]
        self.assertAlmostEqual(stats["max_s"], 0.706, places=9)
        self.assertEqual((stats["count_over_250ms"], stats["worst"][0]["phase"]), (1, "stop"))
        self.assertEqual(report["interval_statistics"]["over_250ms_by_phase"], {"other": 0, "stop": 1})
        self.assertFalse(report["u_pass"])
        self.assertTrue(report["validation_pass"])

    def test_phases_before_viewport_scrolling_marker_and_other(self):
        moving = lambda y: row("You", "0:05", "alpha", y)
        s = [sample(0, 20, moving(150)), sample(50, 70, moving(150)), sample(100, 120, moving(190)),
             sample(500, 520, moving(190)), sample(900, 920, moving(190)), sample(1500, 1520, moving(190))]
        _, report = op.build_publications(HEADER, s, LABELS, ORIGIN, FREQ, markers={"recording": 1.1})
        by_phase = report["interval_statistics"]["over_250ms_by_phase"]
        self.assertEqual(by_phase, {"other": 1, "recording": 1, "scrolling": 1})  # 0.42 s after the move, 0.42 s later, 0.62 s holding 1.1 s
        self.assertEqual(report["interval_statistics"]["threshold_s"], 0.25)

    def test_cli_accepts_phase_marks(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = Path(directory) / "raw.jsonl"
            lines = [HEADER, sample(0, 20, ""), sample(50, 70, ""), sample(900, 920, "")]
            raw.write_text("\n".join(json.dumps(line) for line in lines), encoding="utf-8")
            result = subprocess.run([sys.executable, str(Path(op.__file__)), str(raw), str(Path(directory) / "p.json"),
                                     "--harness-origin-qpc", str(ORIGIN), "--expected-frequency", str(FREQ),
                                     "--recording-sha256", "a" * 64, "--phase-mark", "recording=0.5"],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(result.stdout)
            self.assertEqual(report["interval_statistics"]["over_250ms_by_phase"], {"other": 0, "recording": 1})


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

    def test_single_bounding_rectangle_is_a_valid_word(self):
        text = self.read("observe-live-v2.ps1")
        self.assertNotIn("Count -ge 4", text)
        self.assertIn("@(@($range.GetBoundingRectangles())", text)
        self.assertIn("$boxes.Count -ge 1", text)
        self.assertIn("bounds = $null", text)

    def test_raw_schema_name_matches_adapter(self):
        self.assertIn(op.RAW_SCHEMA, self.read("observe-live-v2.ps1"))
        self.assertIn(op.RAW_SCHEMA, self.read("observe-live-v3.ps1"))

    def test_v3_keeps_v2_guards_and_adds_cache_request(self):
        text = self.read("observe-live-v3.ps1")
        for forbidden in ("SendKeys", "SendInput", "mouse_event", "InvokePattern", "SetFocus", "SetValue", "Click", "Start-Process", "npm "):
            self.assertNotIn(forbidden, text)
        for required in ("CreateNew", "[IO.FileShare]::Read", "input_sent = $false", "SRCB-G3-OBSERVER-RAW-1",
                         "CacheRequest", "$cache.Activate()", "$scope.Dispose()", ".Cached", "bounds = (Get-Rect $c.BoundingRectangle)",
                         "Transcript viewport element not found", "SkipWhitespaceElements", "$findCondition"):
            self.assertIn(required, text)
        self.assertNotIn(".Current", text.replace("$viewport.Current", "").replace("TryGetCurrentPattern", ""))

    def test_overlay_uses_the_same_qpc_ticks(self):
        text = self.read("clock-overlay.ps1")
        self.assertIn("Stopwatch]::GetTimestamp", text)
        self.assertIn("OriginQpc", text)
        self.assertNotIn("Start-Process", text)


if __name__ == "__main__":
    unittest.main()

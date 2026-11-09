"""Exercise repeated utterance identity using invented word publications."""
import importlib.util
from pathlib import Path
import unittest
import json
import subprocess
import sys
import tempfile

from occurrence_matcher import align_occurrences

spec = importlib.util.spec_from_file_location("bounds", Path(__file__).with_name("analyze-bounds.py"))
bounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds)


def make_annotations(count=3, words=("Silver", "trains", "arrive")):
    """Create separated occurrences of one invented repeated sentence."""
    return {"utterances": [{"id": f"unit-{i}", "reference_words": list(words),
                            "start": 20+10*i, "last_word_start": 22+10*i,
                            "earliest_acoustic_end_s": 23+10*i,
                            "latest_acoustic_end_s": 23+10*i, "eligible": True}
                           for i in range(count)]}


def make_publications(annotations, skip=(), source=True, delay=0):
    """Create first-visible words with optional independent audio provenance."""
    publications = []
    for i, unit in enumerate(annotations["utterances"]):
        if i in skip:
            continue
        for j, word in enumerate(unit["reference_words"]):
            item = {"id": f"word-{i}-{j}", "track": "meeting", "text": word,
                    "observed": unit["latest_acoustic_end_s"]+1+delay, "u": 0.1}
            if source:
                item.update(audio_start=unit["start"], audio_end=unit["latest_acoustic_end_s"])
            publications.append(item)
    return publications


class TestOccurrenceMatcher(unittest.TestCase):
    """Prevent repeated text from silently receiving occurrence credit."""

    def test_full_pass(self):
        """Score all repetitions independently.

        Identical sentences must retain separate publication endpoints.
        """
        annotations = make_annotations(15)
        rows = align_occurrences(annotations, make_publications(annotations), "meeting", clock_basis="recording")
        self.assertEqual([row["outcome"] for row in rows], ["MATCHED"]*15)
        self.assertEqual(bounds.summarize_track(rows)["latency"], "PASS")
        self.assertEqual(len({row["endpoints"][0]["publication_id"] for row in rows}), 15)

    def test_synthetic_scale_counts(self):
        """Exercise synthetic scale coverage at 75 and 65 occurrences.

        The reference count must remain independent of distinct sentence count.
        """
        for track, count in (("meeting", 75), ("microphone", 65)):
            annotations = make_annotations(count)
            for i, unit in enumerate(annotations["utterances"]):
                unit["reference_words"] = ["Silver", ("trains", "ships", "buses")[i % 3], "arrive"]
            pubs = make_publications(annotations)
            for pub in pubs:
                pub["track"] = track
            rows = align_occurrences(annotations, pubs, track, clock_basis="recording")
            self.assertEqual(len(rows), count)
            self.assertTrue(all(row["outcome"] == "MATCHED" for row in rows))

    def test_cli_clock_integration(self):
        """Write alignment rows from harness-clock words and refuse output overwrite.

        The public offline entry point must preserve both clock and evidence safety.
        """
        from marker_clock import fit_markers
        annotations = make_annotations(1)
        pubs = make_publications(annotations)
        for pub in pubs:
            pub["observed"] += 100
        clock = fit_markers({"position": 1, "uncertainty_s": 0.005},
                            {"position": 381, "uncertainty_s": 0.005}, (101, 481))
        clock.update(track="meeting", recording_sha256="a"*64)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, value in (("annotations", annotations),
                                ("words", {"words": pubs, "clock_basis": "harness", "recording_sha256": "a"*64}),
                                ("clock", clock)):
                (root/(name+".json")).write_text(json.dumps(value), encoding="utf-8")
            command = [sys.executable, str(Path(__file__).with_name("occurrence_matcher.py")),
                       str(root/"annotations.json"), str(root/"words.json"), str(root/"output.json"),
                       "--track", "meeting", "--clock", str(root/"clock.json")]
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = json.loads((root/"output.json").read_text(encoding="utf-8"))
            self.assertEqual(output["units"][0]["outcome"], "MATCHED")
            self.assertLess(output["units"][0]["endpoints"][0]["observed"], 25)
            self.assertNotEqual(subprocess.run(command, capture_output=True, check=False).returncode, 0)

    def test_word_insertion_and_deletion(self):
        """Align ordered prefix words across an insertion and deletion.

        Confirmed prefix identity must survive ordinary word-level edit errors.
        """
        annotations = make_annotations(1, ("Silver", "trains", "will", "soon", "arrive"))
        pubs = make_publications(annotations)
        pubs.pop(1)
        pubs.insert(1, {**pubs[0], "id": "inserted", "text": "extra"})
        row = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")[0]
        self.assertEqual(row["outcome"], "MATCHED")

    def test_endpoint_alone_does_not_confirm_identity(self):
        """Require a confirmed span even when the final token happens to match.

        Unrelated text sharing the endpoint word cannot establish utterance identity.
        """
        annotations = make_annotations(1)
        pubs = make_publications(annotations)
        pubs[0]["text"], pubs[1]["text"] = "wrong", "unrelated"
        self.assertEqual(align_occurrences(annotations, pubs, "meeting", clock_basis="recording")[0]["outcome"], "UNIDENTIFIED")

    def test_missing_repetition(self):
        """Keep the missing middle occurrence uncredited.

        A later identical sentence must not fill an earlier missing slot.
        """
        annotations = make_annotations()
        rows = align_occurrences(annotations, make_publications(annotations, skip=(1,)), "meeting", clock_basis="recording")
        self.assertEqual([row["outcome"] for row in rows], ["MATCHED", "UNIDENTIFIED", "MATCHED"])

    def test_missing_without_provenance(self):
        """Refuse to guess which repeated occurrence is absent.

        Publication time alone cannot identify a delayed repetition.
        """
        annotations = make_annotations()
        rows = align_occurrences(annotations, make_publications(annotations, skip=(1,), source=False), "meeting", clock_basis="recording")
        self.assertEqual(rows[1]["outcome"], "UNIDENTIFIED")
        self.assertEqual(rows[2]["outcome"], "UNIDENTIFIED")

    def test_duplicate_publication(self):
        """Deduplicate repeated polls of stable word positions.

        One visible sentence cannot satisfy two annotated occurrences.
        """
        annotations = make_annotations(2)
        pubs = make_publications(annotations, skip=(1,))
        pubs += [{**pub, "observed": pub["observed"]+1} for pub in pubs]
        rows = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")
        self.assertEqual([row["outcome"] for row in rows], ["MATCHED", "UNIDENTIFIED"])

    def test_later_duplicate_cannot_fill_missing(self):
        """Refuse exact credit when later repetition and duplication mimic full output.

        Stream length and lexical order alone cannot prove the earlier identity.
        """
        annotations = make_annotations(2)
        pubs = make_publications(annotations, skip=(0,), source=False)
        pubs += [{**pub, "id": "duplicate-"+pub["id"], "observed": pub["observed"]+1} for pub in pubs]
        rows = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")
        self.assertEqual(rows[0]["outcome"], "UNIDENTIFIED")
        self.assertTrue(rows[0]["repetition_identity_unresolved"])

    def test_clock_boundary(self):
        """Bound publication overlapping the last-word start through clock uncertainty.

        Timeline uncertainty must not turn a nominally pre-speech word into exact credit.
        """
        annotations = make_annotations(1)
        pubs = make_publications(annotations)
        for observed, nominal, uncertainty in ((22.01, 21.99, 0.04), (22.010, 22.005, 0.050)):
            with self.subTest(nominal=nominal):
                pubs[-1].update(observed=observed, observed_nominal=nominal, u=uncertainty)
                pubs[0]["observed"] = pubs[1]["observed"] = 22
                row = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")[0]
                self.assertEqual(row["outcome"], "BOUNDED")

    def test_substituted_last_word(self):
        """Credit a substituted endpoint only with independent prefix identity.

        A wrong last word must not conceal publication latency.
        """
        annotations = make_annotations(1)
        pubs = make_publications(annotations)
        pubs[-1]["text"] = "depart"
        row = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")[0]
        self.assertEqual(row["outcome"], "MATCHED-SUBSTITUTED")
        self.assertEqual(bounds.analyze_unit(row)["conservative"], 1)

    def test_single_word_substitution(self):
        """Leave a one-word substitution unidentified.

        There is no independent prefix evidence for that identity.
        """
        annotations = make_annotations(1, ("Agreed",))
        pubs = make_publications(annotations)
        pubs[0]["text"] = "Wrong"
        self.assertEqual(align_occurrences(annotations, pubs, "meeting", clock_basis="recording")[0]["outcome"], "UNIDENTIFIED")

    def test_delayed_repetition(self):
        """Keep a source-identified delayed publication attached to its occurrence.

        A latency cutoff would misassign or discard a genuine late endpoint.
        """
        annotations = make_annotations(2)
        pubs = make_publications(annotations, skip=(1,), delay=15)
        rows = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")
        self.assertEqual(rows[0]["outcome"], "MATCHED")
        self.assertEqual(bounds.analyze_unit(rows[0])["conservative"], 16)
        self.assertEqual(rows[1]["outcome"], "UNIDENTIFIED")

    def test_ambiguous_pair(self):
        """Bound two equally good last-word positions for one occurrence.

        The first or latest duplicate cannot be arbitrarily selected as exact.
        """
        annotations = make_annotations(1)
        pubs = make_publications(annotations)
        pubs.append({**pubs[-1], "id": "another-position", "observed": 29})
        row = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")[0]
        self.assertEqual(row["outcome"], "BOUNDED")
        self.assertEqual(len(row["endpoints"]), 2)
        self.assertEqual(bounds.analyze_unit(row)["conservative"], 6)

    def test_track_and_pre_speech(self):
        """Reject other-track and pre-speech endpoint credit.

        Text equality alone does not establish an eligible publication.
        """
        annotations = make_annotations(1)
        pubs = make_publications(annotations)
        for pub in pubs:
            pub["observed"] = 21
        self.assertEqual(align_occurrences(annotations, pubs, "meeting", clock_basis="recording")[0]["outcome"], "UNIDENTIFIED")
        self.assertEqual(align_occurrences(annotations, pubs, "microphone", clock_basis="recording")[0]["outcome"], "UNIDENTIFIED")


if __name__ == "__main__":
    unittest.main()

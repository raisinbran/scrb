"""Deterministic, invented data only: no local recording or model is needed."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from evaluate_gate3 import evaluate


class Gate3EvaluationTests(unittest.TestCase):
    """Protect paired scoring and failure thresholds from false passes."""

    def setUp(self):
        """Provide disposable invented text and measurements."""
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, name, text):
        """Create a text or JSON input under the disposable directory."""
        (self.root / name).write_text(text, encoding="utf-8")

    def test_paired_errors_use_one_reference(self):
        """A long clip must not be averaged equally with a short clip."""
        self.write("ref1.txt", "cat sat on the mat")
        self.write("live1.txt", "cat sat near the mat")
        self.write("final1.txt", "cat sat on the mat")
        self.write("ref2.txt", "green")
        self.write("live2.txt", "blue")
        self.write("final2.txt", "blue")
        clips = [
            {"id": "one", "reference": "ref1.txt", "live": "live1.txt", "final": "final1.txt"},
            {"id": "two", "reference": "ref2.txt", "live": "live2.txt", "final": "final2.txt"},
        ]

        report = evaluate({"origin": "synthetic", "clips": clips}, self.root)

        self.assertEqual(report["accuracy"]["reference_words"], 6)
        self.assertEqual(report["accuracy"]["live_errors"], 2)
        self.assertEqual(report["accuracy"]["final_errors"], 1)
        self.assertEqual(report["accuracy"]["relative_error_reduction"], 0.5)
        self.assertTrue(report["accuracy"]["meets_15_percent"])

    def test_exact_accuracy_threshold_passes(self):
        """Exactly fifteen percent fewer errors must pass; less must fail."""
        reference = [f"word{i}" for i in range(20)]
        wrong = [f"wrong{i}" for i in range(20)]
        self.write("ref.txt", " ".join(reference))
        self.write("live.txt", " ".join(wrong))
        self.write("final.txt", " ".join(reference[:3] + wrong[3:]))
        clips = [{
            "id": "threshold", "reference": "ref.txt", "live": "live.txt", "final": "final.txt",
        }]

        report = evaluate({"origin": "synthetic", "clips": clips}, self.root)
        self.assertEqual(report["accuracy"]["relative_error_reduction"], 0.15)
        self.assertTrue(report["accuracy"]["meets_15_percent"])

        self.write("final.txt", " ".join(reference[:2] + wrong[2:]))
        worse = evaluate({"origin": "synthetic", "clips": clips}, self.root)
        self.assertFalse(worse["accuracy"]["meets_15_percent"])

    def test_live_absence_cannot_pass(self):
        """An empty live transcript must not pass by inflating live errors."""
        self.write("ref.txt", "one two three")
        self.write("live.txt", "")
        self.write("final.txt", "one two three")
        clips = [{"id": "silent", "reference": "ref.txt", "live": "live.txt", "final": "final.txt"}]

        report = evaluate({"origin": "synthetic", "clips": clips}, self.root)

        self.assertFalse(report["accuracy"]["meets_15_percent"])

    def test_slow_tail_fails_delay_target(self):
        """Passing the median alone must not hide a slow tail."""
        self.write("delay.json", json.dumps({"rows": [{"delay_s": 2}] * 18 + [{"delay_s": 7}] * 2}))

        report = evaluate({"origin": "synthetic", "delay_file": "delay.json"}, self.root)

        self.assertEqual(report["live_delay"]["median_delay_s"], 2)
        self.assertEqual(report["live_delay"]["p95_delay_s"], 7)
        self.assertEqual(report["live_delay"]["share_within_6s"], 0.9)
        self.assertFalse(report["live_delay"]["meets_delay_target"])

        self.write("delay.json", json.dumps({"rows": [{"delay_s": 2}] * 19 + [{"delay_s": 7}]}))
        boundary = evaluate({"origin": "synthetic", "delay_file": "delay.json"}, self.root)
        self.assertTrue(boundary["live_delay"]["meets_delay_target"])

    def test_worker_gap_fails_isolation(self):
        """A recording with saved audio lost cannot count as worker isolation."""
        base = {"id": "kill", "killed_during_audible_capture": True,
                "recording_continued": True, "saved_audio_lost_ms": 0,
                "audio_continuity_verified": True, "live_lag_or_failure_visible": True,
                "restart_attempts": 1}
        self.write("worker.json", json.dumps({
            "cases": [base, {**base, "id": "gap", "saved_audio_lost_ms": 40}],
        }))

        report = evaluate({"origin": "synthetic", "worker_file": "worker.json"}, self.root)

        outcomes = [x["passes_worker_isolation"] for x in report["worker_failure"]["cases"]]
        self.assertEqual(outcomes, [True, False])
        self.assertFalse(report["worker_failure"]["all_pass"])

        self.write("worker.json", json.dumps({"cases": [{**base, "restart_attempts": 4}]}))
        over_budget = evaluate({"origin": "synthetic", "worker_file": "worker.json"}, self.root)
        self.assertFalse(over_budget["worker_failure"]["all_pass"])

    def test_invalid_manifest_exits_without_score(self):
        """Invalid evidence cannot look like a successful report.
        
        A malformed object and oversized integer must produce CLI errors.
        """
        script = Path(__file__).with_name("evaluate_gate3.py")
        for invalid in ([], {"origin": "synthetic", "peak_app_memory_mib": 10 ** 400}):
            self.write("invalid.json", json.dumps(invalid))
            result = subprocess.run(
                [sys.executable, str(script), str(self.root / "invalid.json")],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertIn("error:", result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    def test_missing_evidence_is_not_passed(self):
        """Unavailable measurements must stay absent, not become zero-valued passes."""
        report = evaluate({"origin": "synthetic"}, self.root)

        self.assertIsNone(report["accuracy"])
        self.assertIsNone(report["live_delay"])
        self.assertIsNone(report["worker_failure"])
        self.assertIsNone(report["peak_app_memory_mib"])


if __name__ == "__main__":
    unittest.main()

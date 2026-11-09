"""Run the two identity regressions against current or pinned historical matcher code."""
import argparse
import io
from pathlib import Path
import subprocess
import sys
import types
import unittest

HISTORICAL_SHA = "9a4d5a135b5e68fc07c51b4d3c005ebe7315a331"


def run_regressions(historical=False):
    """Execute the current assertions with the selected matcher's actual API.

    The adapter removes the new clock_basis keyword only for the historical
    three-argument matcher; fixture data and assertions remain unchanged.
    """
    directory = Path(__file__).resolve().parent
    sys.path.insert(0, str(directory))
    import test_occurrence_matcher
    import test_review_fixes

    label = "current worktree matcher"
    if historical:
        source = subprocess.run(
            ["git", "show", f"{HISTORICAL_SHA}:scripts/gate3-retest/occurrence_matcher.py"],
            cwd=directory.parents[1], capture_output=True, text=True, encoding="utf-8", check=True).stdout
        module = types.ModuleType("historical_occurrence_matcher")
        exec(compile(source, f"git:{HISTORICAL_SHA}:occurrence_matcher.py", "exec"), module.__dict__)

        def call_historical_matcher(annotations, publications, track, *, clock_basis):
            """Call the old three-argument matcher without a clock_basis keyword."""
            if clock_basis != "recording":
                raise ValueError("Regression fixtures must use recording time")
            return module.align_occurrences(annotations, publications, track)

        test_occurrence_matcher.align_occurrences = call_historical_matcher
        test_review_fixes.align_occurrences = call_historical_matcher
        label = f"historical matcher {HISTORICAL_SHA}; original three-argument API"
    suite = unittest.TestSuite([
        test_review_fixes.TestReviewFixes("test_broad_provenance_cannot_confirm_repeats"),
        test_occurrence_matcher.TestOccurrenceMatcher("test_clock_boundary"),
    ])
    output = io.StringIO()
    result = unittest.TextTestRunner(stream=output, verbosity=2).run(suite)
    return result.wasSuccessful(), f"Matcher under test: {label}\n\n"+output.getvalue()


def main():
    """Print actual unittest output and optionally preserve it without overwriting."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--historical", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    passed, output = run_regressions(args.historical)
    if args.output:
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(output)
    print(output, end="")
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()

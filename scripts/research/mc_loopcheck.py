"""Loop/skip check for the -mc hint test (docs/plans/vocabulary-hint-context-fix.md).

For each meeting: word-count ratio vs the baseline (-mc 0) output, longest consecutive repeat of a 4+ word
phrase (count of repeats), WER vs the AMI reference, and learned-term events. Reuses score_vocab_eval.py.

  python3 -I mc_loopcheck.py --ann <ann/words> --terms terms.json --base <dir> --test <dir> MEETING...
"""
import argparse
import importlib.util
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("sv", os.path.join(HERE, "score_vocab_eval.py"))
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)


def longest_repeat(words, min_len=4, max_len=12):
    """(phrase length, repeats, phrase) of the most-repeated consecutive phrase of >= min_len words; (0, 1, '') if none."""
    best = (0, 1, "")
    for n in range(min_len, max_len + 1):
        for i in range(len(words) - 2 * n + 1):
            p = words[i:i + n]
            r = 1
            while words[i + r * n:i + (r + 1) * n] == p:
                r += 1
            if r > best[1] or (r == best[1] and r > 1 and n > best[0]):
                best = (n, r, " ".join(p))
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ann")
    ap.add_argument("--terms")
    ap.add_argument("--base")
    ap.add_argument("--test")
    ap.add_argument("--wer-margin", type=float, default=0.01)
    ap.add_argument("meetings", nargs="+")
    a = ap.parse_args()
    raw = json.load(open(a.terms, encoding="utf-8"))
    terms = [sv.norm_words(t) for t in (raw["terms"] if isinstance(raw, dict) else raw)]
    rows, flags = [], []
    for m in a.meetings:
        ref = sv.parse_ref(a.ann, m)
        base, test = sv.parse_hyp(f"{a.base}/{m}.json"), sv.parse_hyp(f"{a.test}/{m}.json")
        wb, _ = sv.wer(ref, sv.align(ref, base))
        wt, _ = sv.wer(ref, sv.align(ref, test))
        rb, rt = longest_repeat(base), longest_repeat(test)
        row = {"meeting": m, "words_base": len(base), "words_test": len(test),
               "ratio": round(len(test) / max(1, len(base)), 4), "wer_base": round(wb, 4), "wer_test": round(wt, 4),
               "repeat_base": rb, "repeat_test": rt, "term_events_test": len(sv.negative_events(test, terms))}
        reasons = []
        if rt[1] >= 3 and rt[1] > rb[1]:
            reasons.append("new repeated phrase")
        if wt - wb > a.wer_margin:
            reasons.append("WER worse by more than margin")
        row["flags"] = reasons
        if reasons:
            flags.append(m)
        rows.append(row)
    print(json.dumps({"rows": rows, "flagged": flags}, indent=1))


if __name__ == "__main__":
    main()

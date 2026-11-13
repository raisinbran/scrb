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


def repeated_phrases(words, min_len=4, max_len=12, min_repeats=3):
    """{phrase: max consecutive repeats} for every phrase of min_len..max_len words repeated >= min_repeats times in a row."""
    out = {}
    for n in range(min_len, max_len + 1):
        for i in range(len(words) - min_repeats * n + 1):
            p = words[i:i + n]
            r = 1
            while words[i + r * n:i + (r + 1) * n] == p:
                r += 1
            if r >= min_repeats:
                k = " ".join(p)
                out[k] = max(out.get(k, 0), r)
    return out


def new_repeats(base, test, min_repeats=3):
    """Phrases repeated >= min_repeats times in test whose baseline repeat count is below min_repeats (by phrase identity)."""
    b = repeated_phrases(base, min_repeats=min_repeats)
    return {k: r for k, r in repeated_phrases(test, min_repeats=min_repeats).items() if b.get(k, 0) < min_repeats}


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
        nr = new_repeats(base, test)
        row["new_repeats"] = nr
        if nr:
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

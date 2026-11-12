"""Offline scorer for the Gate 5 vocabulary evaluation (docs/plans/vocabulary-gate5-evaluation.md, step 7).
Stdlib only. Reads text files only; no audio is decoded or played.

Usage:
  python3 score_vocab_eval.py --ann ANN_WORDS_DIR --ref-id TS3003a --terms terms.json \
      --off off/TS3003a.json --on on/TS3003a.json [--neg HYP.json,WAV[,REFID]]... [--out result.json]
  python3 score_vocab_eval.py --selftest

terms.json: a JSON list of phrases, or {"terms": [...]}.
--neg: hint-on output of a negative-control file, its wav (duration from the header), and optionally its AMI id
       (reference checked for learned terms; a hit is reported and that file should be excluded by the caller).
"""
import sys, re, json, wave, glob, argparse, unicodedata
import xml.etree.ElementTree as ET


# ---------- normalization and parsing ----------
def norm_words(text):
    """NFC, lowercase, curly apostrophes to ', hyphens to spaces, drop everything but letters/digits/'."""
    t = unicodedata.normalize("NFC", text).lower().replace("’", "'").replace("‘", "'")
    t = t.replace("-", " ").replace("_", " ")
    t = re.sub(r"[^\w' ]", " ", t)
    out = []
    for w in t.split():
        w = w.strip("'")
        if w:
            out.append(w)
    return out


def parse_ref(ann_dir, meeting):
    """Time-ordered word list over all speakers. Only <w> without punc="true"; gap/vocalsound/etc. skipped."""
    items = []
    files = sorted(glob.glob(f"{ann_dir}/{meeting}.[A-Z].words.xml"))
    if not files:
        raise SystemExit(f"no reference files for {meeting} in {ann_dir}")
    for f in files:
        for el in ET.parse(f).getroot():
            tag = el.tag.split("}")[-1]
            if tag != "w" or el.get("punc") == "true" or el.get("starttime") is None:
                continue
            for k, w in enumerate(norm_words(el.text or "")):
                items.append((float(el.get("starttime")), len(items), w))
    items.sort()  # by start time, then file/doc order
    return [w for _, _, w in items]


def parse_hyp(path):
    """Words from whisper-cli -ojf: segment texts; [..] and (..) annotations removed."""
    d = json.load(open(path, encoding="utf-8"))
    words = []
    for seg in d["transcription"]:
        t = re.sub(r"\[[^\]]*\]|\([^)]*\)", " ", seg.get("text", ""))
        words += norm_words(t)
    return words


# ---------- alignment ----------
def align(ref, hyp):
    """Levenshtein alignment. Returns ops [(op, ri, hi)] op in M(atch) S(ub) D(el: ref only) I(ns: hyp only)."""
    n, m = len(ref), len(hyp)
    prev = list(range(m + 1))
    back = [bytearray(m + 1) for _ in range(n + 1)]  # 0 diag, 1 up(del), 2 left(ins)
    for j in range(1, m + 1):
        back[0][j] = 2
    for i in range(1, n + 1):
        cur = [i] + [0] * m
        back[i][0] = 1
        r = ref[i - 1]
        for j in range(1, m + 1):
            d = prev[j - 1] + (r != hyp[j - 1])
            u = prev[j] + 1
            l = cur[j - 1] + 1
            if d <= u and d <= l:
                cur[j], back[i][j] = d, 0
            elif u <= l:
                cur[j], back[i][j] = u, 1
            else:
                cur[j], back[i][j] = l, 2
        prev = cur
    ops, i, j = [], n, m
    while i or j:
        b = back[i][j]
        if b == 0:
            ops.append(("M" if ref[i - 1] == hyp[j - 1] else "S", i - 1, j - 1)); i -= 1; j -= 1
        elif b == 1:
            ops.append(("D", i - 1, None)); i -= 1
        else:
            ops.append(("I", None, j - 1)); j -= 1
    ops.reverse()
    return ops


def wer(ref, ops):
    e = sum(1 for o in ops if o[0] != "M")
    return e / max(1, len(ref)), e


def find_phrase(words, phrase):
    n = len(phrase)
    return [i for i in range(len(words) - n + 1) if words[i:i + n] == phrase]


# ---------- term metrics ----------
def term_recall(ref, ops, terms):
    """Occurrence in ref is recalled when every one of its words is a Match in the alignment."""
    matched_ref = {o[1] for o in ops if o[0] == "M"}
    per, tot_n, tot_hit = {}, 0, 0
    for t in terms:
        occ = find_phrase(ref, t)
        hit = sum(1 for s in occ if all(k in matched_ref for k in range(s, s + len(t))))
        per[" ".join(t)] = {"ref_occurrences": len(occ), "recalled": hit}
        tot_n += len(occ); tot_hit += hit
    return {"occurrences": tot_n, "recalled": tot_hit, "recall": tot_hit / tot_n if tot_n else None, "per_term": per}


def hyp_ref_spans(ops):
    """For each hyp index, the closed ref-index interval it is aligned to. A hyp word with no ref partner
    (insertion) gets the point of the next ref word (the place it sits at)."""
    span, cursor = {}, 0
    for op, ri, hi in ops:
        if ri is not None:
            cursor = ri + 1
        if hi is None:
            continue
        span[hi] = (ri, ri) if ri is not None else (cursor, cursor)
    return span


def heldout_false_replacements(ref, ops_on, hyp_on, ops_off, hyp_off, terms):
    """Plan bullet (b): learned term in hint-on output not matching the reference words at that place
    (some word of the occurrence is not a Match) AND hint-off output has no occurrence of the term at the same ref place.
    'Same place' = the closed ref intervals overlap."""
    son, soff = hyp_ref_spans(ops_on), hyp_ref_spans(ops_off)
    match_on = {o[2] for o in ops_on if o[0] == "M"}
    events = []
    for t in terms:
        n = len(t)
        def interval(spans, s):
            iv = [spans[k] for k in range(s, s + n)]
            return min(a for a, _ in iv), max(b for _, b in iv)
        off_ivs = [interval(soff, s) for s in find_phrase(hyp_off, t)]
        for s in find_phrase(hyp_on, t):
            if all(k in match_on for k in range(s, s + n)):
                continue  # reference has the term there: a correct recognition, not a replacement
            lo, hi = interval(son, s)
            if any(a <= hi and lo <= b for a, b in off_ivs):
                continue  # hint-off output already had it there: not caused by the hint
            events.append({"term": " ".join(t), "hyp_index": s, "ref_interval": [lo, hi],
                           "hyp_context": " ".join(hyp_on[max(0, s - 4):s + n + 4]),
                           "ref_context": " ".join(ref[max(0, lo - 4):hi + 5])})
    return events


def negative_events(hyp, terms):
    """Plan bullet (a): every whole-phrase occurrence of a learned term is one event."""
    ev = []
    for t in terms:
        for s in find_phrase(hyp, t):
            ev.append({"term": " ".join(t), "hyp_index": s, "hyp_context": " ".join(hyp[max(0, s - 4):s + len(t) + 4])})
    return ev


# ---------- statistics and verdict ----------
def poisson_upper95(k, hours):
    """One-sided 95% upper bound on the rate: lambda with P(X<=k)=0.05, divided by hours (exact; 3/h for k=0)."""
    import math
    lo, hi = 0.0, 100.0 + 10 * k
    for _ in range(200):
        mid = (lo + hi) / 2
        cdf = sum(math.exp(-mid) * mid ** i / math.factorial(i) for i in range(k + 1))
        lo, hi = (mid, hi) if cdf > 0.05 else (lo, mid)
    return lo / hours if hours else None


def verdict(recall_off, recall_on, wer_off, wer_on, events):
    """Mapping from the plan's pass/fail table. 'Improvement within noise' is not decidable here: reviewer judgment."""
    if events >= 4 or wer_on > wer_off or recall_on is None or recall_off is None or recall_on <= recall_off:
        return "fail"
    return "pass" if events == 0 else "inconclusive"


def wav_hours(path):
    w = wave.open(path)
    return w.getnframes() / w.getframerate() / 3600


# ---------- orchestration ----------
def score(ref, hyp_off, hyp_on, terms):
    ops_off, ops_on = align(ref, hyp_off), align(ref, hyp_on)
    w_off, e_off = wer(ref, ops_off)
    w_on, e_on = wer(ref, ops_on)
    r_off, r_on = term_recall(ref, ops_off, terms), term_recall(ref, ops_on, terms)
    held = heldout_false_replacements(ref, ops_on, hyp_on, ops_off, hyp_off, terms)
    return {"ref_words": len(ref), "wer_off": w_off, "wer_on": w_on, "errors_off": e_off, "errors_on": e_on,
            "recall_off": r_off, "recall_on": r_on, "heldout_events": held, "ops_off": ops_off, "ops_on": ops_on}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ann"); ap.add_argument("--ref-id"); ap.add_argument("--terms")
    ap.add_argument("--off"); ap.add_argument("--on"); ap.add_argument("--heldout-wav")
    ap.add_argument("--neg", action="append", default=[]); ap.add_argument("--out")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    raw = json.load(open(a.terms, encoding="utf-8"))
    terms = [norm_words(t) for t in (raw["terms"] if isinstance(raw, dict) else raw)]
    terms = [t for t in terms if t]
    ref = parse_ref(a.ann, a.ref_id)
    r = score(ref, parse_hyp(a.off), parse_hyp(a.on), terms)
    held_hours = wav_hours(a.heldout_wav) if a.heldout_wav else None
    negs, neg_events, neg_hours, warnings = [], [], 0.0, []
    for spec in a.neg:
        parts = spec.split(",")
        hyp_path, wav = parts[0], parts[1]
        h = wav_hours(wav)
        ev = negative_events(parse_hyp(hyp_path), terms)
        entry = {"hyp": hyp_path, "hours": h, "events": ev}
        if len(parts) > 2:
            rf = parse_ref(a.ann, parts[2])
            hits = {" ".join(t): len(find_phrase(rf, t)) for t in terms if find_phrase(rf, t)}
            entry["ref_contains_terms"] = hits
            if hits:
                warnings.append(f"negative-control reference {parts[2]} contains learned terms {hits}: exclude this file")
        negs.append(entry)
        neg_events += ev; neg_hours += h
    heldout_events = r["heldout_events"]
    tot_ev = len(neg_events) + len(heldout_events)
    tot_h = neg_hours + (held_hours or 0)
    out = {"terms": [" ".join(t) for t in terms], "ref_words": r["ref_words"],
           "wer_off": r["wer_off"], "wer_on": r["wer_on"], "errors_off": r["errors_off"], "errors_on": r["errors_on"],
           "recall_off": r["recall_off"], "recall_on": r["recall_on"],
           "heldout_events": heldout_events, "heldout_hours_on": held_hours,
           "negatives": negs, "negative_events": len(neg_events), "negative_hours_on": neg_hours,
           "total_events": tot_ev, "total_hours_on": tot_h,
           "rate_per_hour": tot_ev / tot_h if tot_h else None,
           "rate_upper95_per_hour": poisson_upper95(tot_ev, tot_h) if tot_h else None,
           "warnings": warnings,
           "verdict": verdict(r["recall_off"]["recall"], r["recall_on"]["recall"], r["wer_off"], r["wer_on"], tot_ev)}
    if a.out:
        json.dump(out, open(a.out, "w"), indent=2)
    ro, rn = out["recall_off"], out["recall_on"]
    print(f"terms {len(terms)}; ref words {out['ref_words']}")
    print(f"term recall off {ro['recalled']}/{ro['occurrences']}  on {rn['recalled']}/{rn['occurrences']}")
    print(f"WER off {out['wer_off']:.4f}  on {out['wer_on']:.4f}")
    print(f"false replacements: held-out {len(heldout_events)}, negatives {len(neg_events)}; "
          f"hours on {tot_h:.3f}; rate {out['rate_per_hour']}/h; 95% upper {out['rate_upper95_per_hour']}/h")
    for w in warnings:
        print("WARNING:", w)
    print("verdict (table mapping; 'within noise' needs human judgment):", out["verdict"])


# ---------- synthetic self-test ----------
def selftest():
    def run(ref, off, on, terms, neg=None):
        ref, off, on = norm_words(ref), norm_words(off), norm_words(on)
        T = [norm_words(t) for t in terms]
        oo, on_ops = align(ref, off), align(ref, on)
        return {"wer_off": wer(ref, oo)[0], "wer_on": wer(ref, on_ops)[0],
                "rec_off": term_recall(ref, oo, T)["recalled"], "rec_on": term_recall(ref, on_ops, T)["recalled"],
                "held": heldout_false_replacements(ref, on_ops, on, oo, off, T),
                "neg": negative_events(norm_words(neg), T) if neg is not None else None}

    ref = "we met Dr. Zhang's team about the Kestrel project today"
    # 1. clean pass: recall gain, WER down, no events
    r = run(ref, "we met doctor jang's team about the kessel project today",
            "we met Dr. Zhang's team about the Kestrel project today", ["Kestrel", "Zhang's"], neg="nothing relevant here")
    assert r["rec_off"] == 0 and r["rec_on"] == 2 and r["wer_on"] < r["wer_off"], r
    assert r["held"] == [] and r["neg"] == []
    assert verdict(0, 2, r["wer_off"], r["wer_on"], 0) == "pass"
    # 2. false replacement: hint turns "castle" into Kestrel; off said castle
    r = run("the old castle on the hill is closed", "the old castle on the hill is closed",
            "the old Kestrel on the hill is closed", ["Kestrel"])
    assert len(r["held"]) == 1 and r["held"][0]["term"] == "kestrel", r
    # 2b. not an event when off output already had the term at that place (not hint-caused)
    r = run("the old castle on the hill", "the old kestrel on the hill", "the old kestrel on the hill", ["Kestrel"])
    assert r["held"] == []
    # 2c. insertion event (term appears where reference has nothing)
    r = run("the plan is ready", "the plan is ready", "the plan is Kestrel ready", ["Kestrel"])
    assert len(r["held"]) == 1, r
    # 3. negative control: term in output is an event, whole word only, case-insensitive, phrases
    r = run("a b", "a b", "a b", ["Kestrel", "blue sky"], neg="Kestrel was kestrels; the Blue Sky and kestrel.")
    assert [e["term"] for e in r["neg"]] == ["kestrel", "kestrel", "blue sky"] or len(r["neg"]) == 3, r["neg"]
    assert len(r["neg"]) == 3  # "kestrels" must not count
    # 4. WER regression with recall gain -> fail
    r = run("one two three four five six", "one two three four five six", "one X three Y five Z Kestrel", ["Kestrel"])
    assert r["wer_on"] > r["wer_off"]
    assert verdict(0, 1, r["wer_off"], r["wer_on"], 0) == "fail"
    # verdict boundaries
    assert verdict(0.1, 0.5, 0.2, 0.2, 2) == "inconclusive" and verdict(0.1, 0.5, 0.2, 0.2, 4) == "fail"
    assert verdict(0.5, 0.5, 0.2, 0.1, 0) == "fail"
    # statistics
    assert abs(poisson_upper95(0, 3.6) - 3 / 3.6) < 0.01 * (3 / 3.6) + 1e-3  # exact 2.996/3.6
    # normalization and punctuation
    assert norm_words("Don’t, T-shirt! 3.5") == ["don't", "t", "shirt", "3", "5"]
    print("selftest OK")


if __name__ == "__main__":
    main()

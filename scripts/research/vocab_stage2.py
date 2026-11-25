"""Gate 5 Stage 2 term selection and scoring (docs/gates/vocab-gate5-stage2-results-20261125.md). Stdlib only, offline.
  python3 vocab_stage2.py select --s2 DIR --ann ANN_WORDS_DIR   # after the hint-off decodes: terms/, plan.json
  python3 vocab_stage2.py score  --s2 DIR --ann ANN_WORDS_DIR   # after on/ and neg/ decodes: score.json, score.md
DIR holds meetings.json (ordered ids), off/ on/ neg/ (whisper-cli -ojf output). Reuses score_vocab_eval.py unchanged."""
import sys, os, re, json, wave, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_vocab_eval as sv

STOP = set("""a about above after again all also am an and any are as at be because been before being below between both but by can
could did do does doing down during each few for from further get got had has have having he her here hers him his how i if in into
is it its just like me more most my no nor not now of off on once only or other our out over own really same she should so some such
than that the their them then there these they this those through to too under until up very was we well were what when where which
while who why will with would yeah yes you your okay oh mm uh um hmm right think know mean going gonna want need say said one two
three four five six seven eight nine ten thing things stuff kind lot bit something anything everything little""".split())
NUM = re.compile(r"\d")
NUMW = set("""eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty
ninety hundred thousand point first second third fourth fifth sixth tenth twelfth eighteenth twelve""".split())
try:
    DICT = {w.strip().lower() for w in open("/usr/share/dict/words", encoding="latin-1")}
except OSError:
    DICT = set()


def real_word(w):
    """Terms must be dictionary words (British spellings mapped), so reference fragments like 'contr' or 'sli' are not used."""
    v = {w, w.replace("our", "or"), w.replace("ise", "ize").replace("yse", "yze"), w.replace("mme", "m"), w.replace("centre", "center"),
         w[:-1] if w.endswith("s") else w, w[:-2] if w.endswith("es") else w, w[:-3] if w.endswith("ing") else w, w[:-2] if w.endswith("ed") else w}
    return any(x in DICT for x in v)


def series(m):
    return m[:6] if m[:6] in ("ES2004", "IS1009", "TS3003") else m


def hint_text(terms):
    return ", ".join(terms)


def select(a):
    ids = json.load(open(f"{a.s2}/meetings.json"))
    refs = {m: sv.parse_ref(a.ann, m) for m in ids}
    os.makedirs(f"{a.s2}/terms", exist_ok=True)
    sets, report = {}, {}
    for m in ids:
        ref, hyp = refs[m], sv.parse_hyp(f"{a.s2}/off/{m}.json")
        ops = sv.align(ref, hyp)
        cands = {}
        for n in (1, 2, 3):
            for i in range(len(ref) - n + 1):
                t = tuple(ref[i:i + n])
                if any(w in STOP or w in NUMW or NUM.search(w) or "'" in w or not real_word(w) for w in t) or max(map(len, t)) < 4:
                    continue
                cands[t] = None
        rows = []
        for t in map(list, cands):
            occ = sv.find_phrase(ref, t)
            if len(occ) < 2:
                continue
            rec = sv.term_recall(ref, ops, [t])["recalled"]
            wrong = len(occ) - rec
            if wrong < 2 or any(sv.find_phrase(refs[o], t) for o in ids if series(o) != series(m)):
                continue
            rows.append((-wrong, -len(occ), " ".join(t)))
        rows.sort()
        chosen = []
        for _, _, t in rows:
            if any(t in c or c in t for c in chosen):
                continue
            chosen.append(t)
            if len(chosen) == 10:
                break
        sets[m] = chosen
        report[m] = {"eligible": len(rows), "chosen": len(chosen)}
        json.dump({"rule": "see vocab_stage2.py select", "terms": chosen}, open(f"{a.s2}/terms/{m}.json", "w"), indent=1)
        open(f"{a.s2}/terms/{m}.hint.txt", "w").write(hint_text(chosen))
    ok = [m for m in ids if len(sets[m]) >= 3]
    plan = {"on": [{"out": m, "meeting": m, "hint": f"terms/{m}.hint.txt"} for m in ok], "neg": []}
    for k, m in enumerate(ok):
        picked = []
        for d in range(1, len(ok)):
            src = ok[(k + d * 5) % len(ok)]  # fixed stride, deterministic
            if src == m or series(src) == series(m) or src in picked:
                continue
            if any(sv.find_phrase(refs[m], sv.norm_words(t)) for t in sets[src]):
                continue  # a negative control's reference must contain none of the hint's terms
            picked.append(src)
            if len(picked) == 3:
                break
        for src in picked:
            plan["neg"].append({"out": f"{m}__{src}", "meeting": m, "hint": f"terms/{src}.hint.txt", "source": src})
    json.dump(plan, open(f"{a.s2}/plan.json", "w"), indent=1)
    json.dump(report, open(f"{a.s2}/select-report.json", "w"), indent=1)
    for m in ids:
        print(m, report[m], "|", hint_text(sets[m]))


def hours(m, a):
    for d in (f"{a.assets}/downloads/ami", f"{a.assets}/eval-vocab/neg"):
        p = f"{d}/{m}.Mix-Headset.wav"
        if os.path.exists(p):
            return sv.wav_hours(p)
    raise SystemExit("no wav for " + m)


def sc(a):
    plan = json.load(open(f"{a.s2}/plan.json"))
    ids = [j["meeting"] for j in plan["on"]]
    refs = {m: sv.parse_ref(a.ann, m) for m in ids}
    terms = {m: [sv.norm_words(t) for t in json.load(open(f"{a.s2}/terms/{m}.json"))["terms"]] for m in ids}
    per, tot = {}, dict(ro=0, rn=0, occ=0, eo=0, en=0, words=0, held=0, neg=0, uhours=0.0, nhours=0.0)
    for m in ids:
        off, on = sv.parse_hyp(f"{a.s2}/off/{m}.json"), sv.parse_hyp(f"{a.s2}/on/{m}.json")
        r = sv.score(refs[m], off, on, terms[m])
        h = hours(m, a)
        negs = []
        for j in plan["neg"]:
            if j["meeting"] != m:
                continue
            src = j["source"]
            hyp = sv.parse_hyp(f"{a.s2}/neg/{j['out']}.json")
            clash = {" ".join(t): len(sv.find_phrase(refs[m], t)) for t in terms[src] if sv.find_phrase(refs[m], t)}
            negs.append({"source": src, "events": sv.negative_events(hyp, terms[src]), "ref_clash": clash})
        nev = sum(len(n["events"]) for n in negs)
        per[m] = {"hours": h, "ref_words": r["ref_words"], "occurrences": r["recall_off"]["occurrences"],
                  "recall_off": r["recall_off"]["recalled"], "recall_on": r["recall_on"]["recalled"],
                  "wer_off": r["wer_off"], "wer_on": r["wer_on"], "errors_off": r["errors_off"], "errors_on": r["errors_on"],
                  "heldout_events": r["heldout_events"], "neg": negs, "neg_events": nev}
        t = tot
        t["ro"] += r["recall_off"]["recalled"]; t["rn"] += r["recall_on"]["recalled"]; t["occ"] += r["recall_off"]["occurrences"]
        t["eo"] += r["errors_off"]; t["en"] += r["errors_on"]; t["words"] += r["ref_words"]
        t["held"] += len(r["heldout_events"]); t["neg"] += nev; t["uhours"] += h; t["nhours"] += h * len(negs)
    exp = tot["uhours"] + tot["nhours"]
    ev = tot["held"] + tot["neg"]
    tot.update(wer_off=tot["eo"] / tot["words"], wer_on=tot["en"] / tot["words"], events=ev, exposure_hours=exp,
               rate_per_exposure_hour=ev / exp, upper95_per_exposure_hour=sv.poisson_upper95(ev, exp),
               rate_per_unique_hour=ev / tot["uhours"], upper95_per_unique_hour=sv.poisson_upper95(ev, tot["uhours"]))
    worse = [m for m in ids if (per[m]["wer_on"] - per[m]["wer_off"]) > 0.01]
    clash = [(m, n["source"]) for m in ids for n in per[m]["neg"] if n["ref_clash"]]
    if tot["rn"] <= tot["ro"] or tot["wer_on"] > tot["wer_off"] or tot["rate_per_exposure_hour"] >= 1:
        v = "FAIL"
    elif tot["upper95_per_exposure_hour"] < 1 and not worse:
        v = "PASS"
    else:
        v = "INCONCLUSIVE"
    out = {"per_meeting": per, "total": tot, "meetings_wer_worse_over_1pt": worse, "negative_ref_clashes": clash, "verdict": v}
    json.dump(out, open(f"{a.s2}/score.json", "w"), indent=1)
    L = ["| Meeting | h | Recall off to on | WER off to on | Held-out events | Neg events (3 hints) |", "|---|---|---|---|---|---|"]
    for m in ids:
        p = per[m]
        L.append(f"| {m} | {p['hours']:.3f} | {p['recall_off']} to {p['recall_on']} of {p['occurrences']} | "
                 f"{p['wer_off']*100:.2f}% to {p['wer_on']*100:.2f}% | {len(p['heldout_events'])} | {p['neg_events']} |")
    t = tot
    L.append(f"| **All** | {t['uhours']:.3f} | {t['ro']} to {t['rn']} of {t['occ']} | {t['wer_off']*100:.2f}% to {t['wer_on']*100:.2f}% | {t['held']} | {t['neg']} |")
    L.append("")
    L.append(f"events {ev} over {exp:.2f} exposure hours (own-hint {t['uhours']:.2f} + negatives {t['nhours']:.2f}): "
             f"{t['rate_per_exposure_hour']:.3f}/h, 95% upper {t['upper95_per_exposure_hour']:.3f}/h; per unique audio hour "
             f"{t['rate_per_unique_hour']:.3f}/h, 95% upper {t['upper95_per_unique_hour']:.3f}/h. Meetings with WER worse by over 1 point: {worse or 'none'}. "
             f"Reference clashes: {clash or 'none'}. Verdict: {v}")
    open(f"{a.s2}/score.md", "w").write("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["select", "score"]); ap.add_argument("--s2", required=True); ap.add_argument("--ann", required=True)
    ap.add_argument("--assets", default=os.path.expanduser("~/scrb-dev-assets"))
    a = ap.parse_args()
    select(a) if a.cmd == "select" else sc(a)

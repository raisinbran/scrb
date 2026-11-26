"""Word error rate of a whisper transcript against AMI manual words.

Usage: python -I score_ami_wer.py [--speaker A] [--from SEC] [--to SEC] <ami_annotation_dir> <meeting> <hyp.txt> [...]

--speaker keeps one speaker's words; --from/--to keep words whose start time is in [from, to).
Use them to score a near-end voice against its own isolated reference.

The reference is every speaker's words merged in start-time order (punctuation
and non-word events dropped).  Both sides are lowercased, with punctuation and
hyphens removed and common filler words dropped, since AMI transcribes fillers
that whisper usually omits.  Digits are not spelled out, so absolute WER is
pessimistic; the comparison between models is what matters here.
"""

import glob
import html
import json
import os
import re
import sys

FILLERS = {"um", "uh", "mm", "hmm", "mm-hmm", "uh-huh", "huh", "ah", "oh", "er", "erm"}


def normalize(text):
    text = text.lower().replace("-", " ").replace("_", " ")
    text = re.sub(r"[^a-z0-9' ]+", " ", text)
    return [w for w in text.split() if w.strip("'") and w not in FILLERS]


def reference(ann, meeting, speaker="*", start=0.0, end=float("inf")):
    words = []
    for path in glob.glob(os.path.join(ann, "words", f"{meeting}.{speaker}.words.xml")):
        for m in re.finditer(r'<w [^>]*starttime="([\d.]+)"[^>]*>([^<]*)</w>', open(path, encoding="latin-1").read()):
            if 'punc="true"' not in m.group(0):
                if start <= float(m.group(1)) < end:
                    words.append((float(m.group(1)), html.unescape(m.group(2))))
    words.sort()
    return normalize(" ".join(w for _, w in words))


def errors(ref, hyp):
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i] + [0] * len(hyp)
        for j, h in enumerate(hyp, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return prev[-1]


def main():
    args = sys.argv[1:]
    opts = {"--speaker": "*", "--from": 0.0, "--to": float("inf")}
    while args and args[0] in opts:
        opts[args[0]] = args[1] if args[0] == "--speaker" else float(args[1])
        args = args[2:]
    ann, meeting = args[:2]
    ref = reference(ann, meeting, opts["--speaker"], opts["--from"], opts["--to"])
    for path in args[2:]:
        hyp = normalize(open(path, encoding="utf-8").read())
        e = errors(ref, hyp)
        print(json.dumps({"meeting": meeting, "hypothesis": os.path.basename(path),
                          "ref_words": len(ref), "hyp_words": len(hyp), "wer": round(e / len(ref), 4)}))


if __name__ == "__main__":
    main()

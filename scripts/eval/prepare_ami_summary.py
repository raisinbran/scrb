"""Build timestamped transcripts and reference action/decision lists from AMI.

Usage: python -I prepare_ami_summary.py <ami_annotation_dir> <out_dir> <meeting> [...]

Writes <meeting>.transcript.txt with lines "[mm:ss] A: words" (one line per
speaker turn, split on pauses over 1 s) and <meeting>.reference.json with the
abstractive-summary action and decision sentences.
"""

import glob
import html
import json
import os
import re
import sys


def load_words(ann, meeting):
    words = []
    for path in glob.glob(os.path.join(ann, "words", f"{meeting}.*.words.xml")):
        speaker = path.split(".")[-3]
        text = open(path, encoding="latin-1").read()
        for m in re.finditer(r'<w [^>]*starttime="([\d.]+)"[^>]*>([^<]*)</w>', text):
            punc = 'punc="true"' in m.group(0)
            words.append((float(m.group(1)), speaker, html.unescape(m.group(2)), punc))
    words.sort(key=lambda w: w[0])
    return words


def build_turns(words):
    turns = []
    for start, speaker, token, punc in words:
        if turns and turns[-1]["speaker"] == speaker and start - turns[-1]["last"] <= 1.0:
            turn = turns[-1]
        elif punc:
            continue
        else:
            turn = {"speaker": speaker, "start": start, "last": start, "text": []}
            turns.append(turn)
        if punc and turn["text"]:
            turn["text"][-1] += token
        else:
            turn["text"].append(token)
        turn["last"] = start
    return turns


def load_reference(ann, meeting):
    text = open(os.path.join(ann, "abstractive", f"{meeting}.abssumm.xml"), encoding="latin-1").read()
    out = {}
    for tag in ("actions", "decisions"):
        m = re.search(r"<%s[^>]*>(.*?)</%s>" % (tag, tag), text, re.S)
        items = re.findall(r"<sentence[^>]*>(.*?)</sentence>", m.group(1), re.S) if m else []
        out[tag] = [i.strip() for i in items if i.strip() not in ("NA.", "NA")]
    return out


def main():
    ann, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for meeting in sys.argv[3:]:
        turns = build_turns(load_words(ann, meeting))
        with open(os.path.join(out, f"{meeting}.transcript.txt"), "w", encoding="utf-8") as f:
            for t in turns:
                minutes, seconds = divmod(int(t["start"]), 60)
                f.write(f"[{minutes:02d}:{seconds:02d}] {t['speaker']}: {' '.join(t['text'])}\n")
        with open(os.path.join(out, f"{meeting}.reference.json"), "w", encoding="utf-8") as f:
            json.dump(load_reference(ann, meeting), f, indent=2)
        print(meeting, len(turns), "turns")


if __name__ == "__main__":
    main()

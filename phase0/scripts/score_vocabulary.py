"""Score whisper.cpp transcripts of the vocabulary fixture.

Usage: python -I score_vocabulary.py <terms.json> <hypothesis.txt> [<hypothesis.txt> ...]

For each hypothesis file prints JSON with term recall (strict, and lenient with
spaces/hyphens ignored), word error rate against the fixture sentences, and
glossary terms that appear more often than they were spoken (false insertions).
"""

import json
import re
import sys


def normalize(text):
    """Lowercase, drop punctuation except digits/letters, collapse spaces."""
    text = text.lower().replace("-", " ")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return " ".join(text.split())


def word_errors(ref_words, hyp_words):
    """Levenshtein distance over word lists."""
    prev = list(range(len(hyp_words) + 1))
    for i, r in enumerate(ref_words, 1):
        cur = [i] + [0] * len(hyp_words)
        for j, h in enumerate(hyp_words, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h))
        prev = cur
    return prev[-1]


def score(terms, hypothesis):
    reference = normalize(" ".join(t["sentence"] for t in terms))
    hyp = normalize(hypothesis)
    hyp_compact = hyp.replace(" ", "")
    strict, lenient, missed, inserted = 0, 0, [], []
    for t in terms:
        term = normalize(t["term"])
        spoken = reference.count(term)
        found = len(re.findall(r"\b" + re.escape(term) + r"\b", hyp))
        if found >= 1:
            strict += 1
        else:
            missed.append(t["term"])
        if term.replace(" ", "") in hyp_compact:
            lenient += 1
        if found > spoken:
            inserted.append(t["term"])
    ref_words = reference.split()
    return {
        "term_recall_strict": strict / len(terms),
        "term_recall_lenient": lenient / len(terms),
        "wer": word_errors(ref_words, hyp.split()) / len(ref_words),
        "missed": missed,
        "false_insertions": inserted,
    }


def main():
    terms = json.load(open(sys.argv[1], encoding="utf-8"))["terms"]
    results = {}
    for path in sys.argv[2:]:
        results[path] = score(terms, open(path, encoding="utf-8").read())
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()

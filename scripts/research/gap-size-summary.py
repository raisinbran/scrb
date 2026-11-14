"""Summarize results.json from gap-size-test.py as markdown tables.

  python3 -I scripts/research/gap-size-summary.py <work dir>
"""
import json, sys

rows = json.load(open(sys.argv[1] + '/results.json'))


def stats(rs):
    n = len(rs)
    if not n:
        return None
    ch = sum(r['changed'] for r in rs)
    wer = [100 * (r['sub'] + r['dele'] + r['ins']) / max(1, r['base_words']) for r in rs]
    lost = sum(r['dele'] for r in rs)
    shifted = [r for r in rs if r.get('max_shift_ms', 0) > 100]
    nshift = sum(1 for r in rs if 'max_shift_ms' in r)
    return dict(n=n, changed=ch, frac=ch / n, mean=sum(wer) / n, worst=max(wer),
                worst_words=max(r['sub'] + r['dele'] + r['ins'] for r in rs),
                lost=lost, shifted=len(shifted), nshift=nshift)


print('| mode | kind | gap ms | runs | any word change | mean WER diff % | worst WER diff % | worst words | words deleted (sum) | >100 ms timestamp shift |')
print('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
for mode in ['control', 'zero', 'remove']:
    for kind in ['all', 'free', 'boundary']:
        if mode == 'control' and kind != 'all':
            continue
        sizes = sorted({r['size'] for r in rows if r['mode'] == mode})
        for size in sizes:
            rs = [r for r in rows if r['mode'] == mode and r['size'] == size and (kind == 'all' or r['kind'] == kind)]
            s = stats(rs)
            print(f"| {mode} | {kind} | {size} | {s['n']} | {s['changed']} ({100*s['frac']:.0f}%) | {s['mean']:.2f} | "
                  f"{s['worst']:.1f} | {s['worst_words']} | {s['lost']} | {s['shifted']}/{s['nshift']} |")

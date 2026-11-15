"""Markdown tables from the results.json that gap-size-test.py writes.

  python3 -I scripts/research/gap-size-summary.py <results.json>

"Edit %" is word edit distance to Whisper's own output on the unmodified window,
divided by that output's word count.  It is not accuracy against a reference.
"""
import json, sys

rows = json.load(open(sys.argv[1]))
SIZES = sorted({r['size_ms'] for r in rows if r['mode'] != 'control'})


def sel(mode, lo, hi=None, placement=None):
    hi = lo if hi is None else hi
    return [r for r in rows if r['mode'] == mode and lo <= r['size_ms'] <= hi
            and (placement is None or r['placement'] == placement)]


def pct(r):
    return 100 * r['edit_distance'] / r['base_words']


def cell(rs):
    n = len(rs)
    ch = sum(r['changed'] for r in rs)
    return (f"{ch}/{n} ({100 * ch // n}%) | {sum(map(pct, rs)) / n:.2f} | {max(map(pct, rs)):.0f} | "
            f"{max(r['edit_distance'] for r in rs)}")


print('| gap ms | zero-filled: runs with any word change | mean edit % | max edit % | max words | '
      'removed: runs with any word change | mean edit % | max edit % | max words |')
print('|---:|---|---:|---:|---:|---|---:|---:|---:|')
print('| 0 (control) | ' + cell(sel('control', 0)) + ' | n/a | n/a | n/a | n/a |')
for z in SIZES:
    print(f"| {z} | {cell(sel('zero', z))} | {cell(sel('remove', z))} |")
print()
print('| mode | gap ms | runs | any word change | mean edit % | 5+ words changed | words deleted per run |')
print('|---|---|---:|---:|---:|---:|---:|')
for mode in ['zero', 'remove']:
    for lo, hi in [(1, 15), (20, 200)]:
        rs = sel(mode, lo, hi)
        n = len(rs)
        print(f"| {mode} | {lo}-{hi} | {n} | {100 * sum(r['changed'] for r in rs) / n:.0f}% | "
              f"{sum(map(pct, rs)) / n:.2f} | {100 * sum(r['edit_distance'] >= 5 for r in rs) / n:.0f}% | "
              f"{sum(r['dele'] for r in rs) / n:.2f} |")

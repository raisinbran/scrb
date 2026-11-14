"""Gate 8 gap-size test: how much does one short gap hurt the transcript?

AMI audio only.  Cuts 30 s windows, inserts one gap (zeroed, or removed) and
runs whisper-cli with the final-pass settings (wholeFileArgs in
packages/transcription/src/whisper.ts).  Compares each variant with the
unmodified window.  Nothing is written to the repo; results go to <work>.

  python3 -I scripts/research/gap-size-test.py <work dir> [workers]
"""
import json, os, random, re, subprocess, sys, wave
from concurrent.futures import ThreadPoolExecutor

SEED = 20261114
RATE = 16000
WIN_S = 30
SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 200]
MODES = ['zero', 'remove']
CLIPS = ['ES2004a', 'IS1009a', 'TS3003a']
PER_CLIP = [7, 7, 7]          # 21 free positions
BOUNDARY = {'ES2004a': 2, 'IS1009a': 1, 'TS3003a': 1}  # gaps exactly on a 5 s boundary
assets = os.path.expanduser('~/scrb-dev-assets')
BIN = f'{assets}/upstream/whisper.cpp/build/bin/whisper-cli'
MODEL = f'{assets}/models/whisper/ggml-large-v3-turbo-q5_0.bin'
VAD = f'{assets}/models/whisper/ggml-silero-v6.2.0.bin'

work = sys.argv[1]
workers = int(sys.argv[2]) if len(sys.argv) > 2 else 2
os.makedirs(work + '/wav', exist_ok=True)
os.makedirs(work + '/out', exist_ok=True)


def read(clip):
    w = wave.open(f'{assets}/downloads/ami/{clip}.Mix-Headset.wav')
    assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2
    return w.readframes(w.getnframes())


def rms(b, i, n):
    s = [int.from_bytes(b[2 * k:2 * k + 2], 'little', signed=True) for k in range(i, i + n)]
    return (sum(x * x for x in s) / max(1, len(s))) ** 0.5


def pcm_window(clip_pcm, ws_s):
    a = ws_s * RATE * 2
    return clip_pcm[a:a + WIN_S * RATE * 2]


LEVEL = {}


def clip_level(clip, pcm):
    """Median RMS of 100 ms frames, sampled; the speech threshold is relative to it."""
    if clip not in LEVEL:
        fr = sorted(rms(pcm, i, 1600) for i in range(0, len(pcm) // 2 - 1600, 16000))
        LEVEL[clip] = fr[len(fr) // 2]
    return LEVEL[clip]


def is_speech(win, g_ms, ref):
    """Speech around the whole gap, even for the 200 ms size."""
    a = int((g_ms - 150) * RATE / 1000)
    n = int((200 + 300) * RATE / 1000)
    return rms(win, a, n) > ref and rms(win, a, int(150 * RATE / 1000)) > 0.7 * ref \
        and rms(win, a + int(350 * RATE / 1000), int(150 * RATE / 1000)) > 0.7 * ref


def write(path, pcm):
    o = wave.open(path, 'wb'); o.setnchannels(1); o.setsampwidth(2); o.setframerate(RATE)
    o.writeframes(pcm); o.close()


def make_positions():
    rng = random.Random(SEED)
    pos = []
    for clip, n in zip(CLIPS, PER_CLIP):
        pcm = read(clip)
        dur = len(pcm) // 2 // RATE
        ref = clip_level(clip, pcm)
        for kind, count in (('free', n), ('boundary', BOUNDARY[clip])):
            got = 0
            while got < count:
                ws = rng.randrange(60, dur - 90, 5)       # window starts on a 5 s boundary
                win = pcm_window(pcm, ws)
                if kind == 'free':
                    g = rng.randrange(5000, 24000)        # ms into the window
                else:
                    g = rng.choice([10000, 15000, 20000])  # exactly on a 5 s chunk boundary
                if is_speech(win, g, ref):
                    pos.append(dict(clip=clip, ws=ws, g=g, kind=kind))
                    got += 1
    return pos


def variant(win, g_ms, size_ms, mode):
    a = int(g_ms * RATE / 1000) * 2
    n = int(size_ms * RATE / 1000) * 2
    if mode == 'zero':
        return win[:a] + bytes(n) + win[a + n:]
    return win[:a] + win[a + n:]


def run(name, pcm):
    wav = f'{work}/wav/{name}.wav'
    out = f'{work}/out/{name}'
    if os.path.exists(out + '.json'):
        return out
    write(wav, pcm)
    subprocess.run([BIN, '-m', MODEL, '-f', wav, '-t', '4', '-l', 'en', '--vad', '--vad-model', VAD,
                    '-mc', '0', '-ml', '1', '-sow', '-ojf', '-of', out, '-np', '-pp'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(wav)
    return out


def words(out):
    j = json.load(open(out + '.json'))
    r = []
    for t in j['transcription']:
        w = re.sub(r"[^a-z0-9']", '', t['text'].lower())
        if w:
            r.append((w, t['offsets']['from']))
    return r


def edits(a, b):
    """Word edit counts (sub, del, ins) turning a into b."""
    n, m = len(a), len(b)
    d = [[(0, 0, 0)] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): d[i][0] = (0, i, 0)
    for j in range(1, m + 1): d[0][j] = (0, 0, j)
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                d[i][j] = d[i - 1][j - 1]; continue
            s, dl, ins = d[i - 1][j - 1], d[i - 1][j], d[i][j - 1]
            c = [(sum(s) + 1, (s[0] + 1, s[1], s[2])), (sum(dl) + 1, (dl[0], dl[1] + 1, dl[2])),
                 (sum(ins) + 1, (ins[0], ins[1], ins[2] + 1))]
            d[i][j] = min(c, key=lambda x: x[0])[1]
    return d[n][m]


def compare(base, var, g_ms, size_ms, mode):
    bw, vw = [w for w, _ in base], [w for w, _ in var]
    s, dl, ins = edits(bw, vw)
    res = dict(base_words=len(bw), sub=s, dele=dl, ins=ins, changed=s + dl + ins > 0)
    # timestamp shift: pair words by index when the word lists are identical
    if bw == vw:
        sh = 0
        for (w, t0), (_, t1) in zip(base, var):
            exp = size_ms if (mode == 'remove' and t0 >= g_ms + size_ms) else 0
            sh = max(sh, abs((t1 + exp) - t0))
        res['max_shift_ms'] = sh
    return res


def main():
    pos = make_positions()
    json.dump(dict(seed=SEED, positions=pos), open(work + '/positions.json', 'w'))
    pcms = {c: read(c) for c in CLIPS}
    jobs = []   # (name, pcm)
    meta = []
    for i, p in enumerate(pos):
        win = pcm_window(pcms[p['clip']], p['ws'])
        jobs.append((f'p{i}-base', win)); jobs.append((f'p{i}-ctrl', win))
        for size in SIZES:
            for mode in MODES:
                jobs.append((f'p{i}-{mode}-{size}', variant(win, p['g'], size, mode)))
    print(len(pos), 'positions,', len(jobs), 'runs', flush=True)
    done = 0
    with ThreadPoolExecutor(workers) as ex:
        for _ in ex.map(lambda j: run(*j), jobs):
            done += 1
            if done % 50 == 0: print(done, flush=True)
    rows = []
    for i, p in enumerate(pos):
        base = words(f'{work}/out/p{i}-base')
        ctrl = compare(base, words(f'{work}/out/p{i}-ctrl'), p['g'], 0, 'zero')
        rows.append(dict(pos=i, kind=p['kind'], size=0, mode='control', **ctrl))
        for size in SIZES:
            for mode in MODES:
                r = compare(base, words(f'{work}/out/p{i}-{mode}-{size}'), p['g'], size, mode)
                rows.append(dict(pos=i, kind=p['kind'], size=size, mode=mode, **r))
    json.dump(rows, open(work + '/results.json', 'w'))


main()

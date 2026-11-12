"""Offline check of sherpa's pyannote count rule on ES2004a (research only, no audio played).
Usage: python overlap_count_experiment.py MODEL.onnx WAV RTTM RAW_CACHE.json OUT.npz"""
import sys, json, wave, time
import numpy as np, onnxruntime as ort

model, wav, rttm, cache, out = sys.argv[1:6]
w = wave.open(wav); sr = w.getframerate(); assert sr == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768.0
n = len(x)
s = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
md = s.get_modelmeta().custom_metadata_map
WS = int(md["window_size"]); SHIFT = int(0.1 * WS)          # sherpa window_shift_ratio 0.1 (default)
RFS, RFH = int(md["receptive_field_size"]), int(md["receptive_field_shift"])
ncls, maxc, nspk = int(md["num_classes"]), int(md["powerset_max_classes"]), int(md["num_speakers"])
pm = np.zeros((ncls, nspk), np.int32); k = 1                  # powerset mapping as in InitPowersetMapping
for j in range(nspk): pm[k, j] = 1; k += 1
for j in range(nspk):
    for m in range(j + 1, nspk): pm[k, j] = pm[k, m] = 1; k += 1
nch = (n - WS) // SHIFT + 1; last = (n - WS) % SHIFT > 0
starts = [i * SHIFT for i in range(nch)]
chunks = [x[p:p + WS] for p in starts]
if last: b = np.zeros(WS, np.float32); b[:n - starts[-1] - SHIFT] = x[starts[-1] + SHIFT:]; chunks.append(b); starts.append(starts[-1] + SHIFT)
t0 = time.time(); labs = []
inp = s.get_inputs()[0].name
for c in chunks:
    o = s.run(None, {inp: c[None, None, :]})[0][0]            # (frames, classes)
    labs.append(pm[o.argmax(1)])                              # (frames, spk) 0/1
print("chunks", len(chunks), "secs", round(time.time() - t0, 1))
nf = (WS + (len(chunks) - 1) * SHIFT) // RFH + 1
cnt = np.zeros(nf); wt = np.zeros(nf)
for i, l in enumerate(labs):
    st = int(i * SHIFT / RFH + 0.5); cnt[st:st + len(l)] += l.sum(1); wt[st:st + len(l)] += 1
mean = cnt / (wt + 1e-12)
scale, off = RFH / sr, 0.5 * RFS / sr
# 10 ms grid -> nearest model frame
T = int(n / sr * 100); tg = np.arange(T) * 0.01 + 0.005
fi = np.clip(np.round((tg - off) / scale).astype(int), 0, nf - 1)
M = mean[fi]
# reference: >=2 speakers, away from 0.25 s collars around every reference segment boundary
ref = []
for ln in open(rttm):
    p = ln.split()
    if p and p[0] == "SPEAKER": ref.append((float(p[3]), float(p[3]) + float(p[4]), p[7]))
rc = np.zeros(T, int); near = np.zeros(T, bool)
for a, b_, _ in ref:
    ia, ib = int(round(a * 100)), int(round(b_ * 100)); rc[ia:ib] += 1
    near[max(0, ia - 25):ia + 25] = True; near[max(0, ib - 25):ib + 25] = True
ovl = (rc >= 2) & ~near
raw = np.zeros(T, int)
for sg in json.load(open(cache))["raw"]:
    raw[int(round(sg["start"] * 100)):int(round(sg["end"] * 100))] += 1
np.savez(out, mean=mean, M=M, ovl=ovl, raw=raw)
def sec(m): return round(m.sum() * 0.01, 2)
print("ref overlap s", sec(ovl), "| raw 0/1/2+:", sec(ovl & (raw == 0)), sec(ovl & (raw == 1)), sec(ovl & (raw >= 2)))
one, two = ovl & (raw == 1), ovl & (raw >= 2)
print("== sanity: raw>=2 set (%.2fs): frames with mean>=1.5 / >=1.0 / <0.5" % sec(two), sec(two & (M >= 1.5)), sec(two & (M >= 1.0)), sec(two & (M < .5)))
print("== sanity: raw==1 set (%.2fs): mean<1.5 (agree)" % sec(one), sec(one & (M < 1.5)))
for name, st in (("raw==1", one), ("raw==0", ovl & (raw == 0))):
    print("==", name, "set %.2fs; mean count >=" % sec(st))
    for th in (1.5, 1.3, 1.1, 1.0): print("  ", th, sec(st & (M >= th)))
    print("   mean<0.5", sec(st & (M < .5)), " mean in [0.5,1.0)", sec(st & (M >= .5) & (M < 1.0)))
print("== would-be 2nd-speaker runs (consecutive 10 ms grid frames with mean>=th) touching the raw==1 set")
for th in (1.5, 1.3, 1.1, 1.0):
    m = M >= th; d = np.diff(np.r_[0, m.astype(int), 0]); a, b_ = np.where(d == 1)[0], np.where(d == -1)[0]
    L = (b_ - a) * 0.01; touch = np.array([one[i:j].any() for i, j in zip(a, b_)])
    sh = L <= 0.3
    print("  th", th, "runs", int(touch.sum()), "<=0.3s:", int((touch & sh).sum()), "their secs inside raw==1 set:",
          round(sum(one[i:j].sum() for i, j, t, q in zip(a, b_, touch, sh) if t and q) * .01, 2))

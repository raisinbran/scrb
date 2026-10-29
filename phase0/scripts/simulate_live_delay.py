"""Simulate live transcription delay with whisper-server on VAD segments.

Usage: python -I simulate_live_delay.py <whisper-server.exe> <model.bin> <wav 16k mono>
       <vad_segments.txt> <out.json> [threads] [max_audio_seconds] [silence_wait_s] [audio_ctx]

Replays the recording in real time.  Each VAD segment is sent to whisper-server
once it would be complete live: at its end plus the VAD's silence wait (or
immediately at a forced split, but this simple replay always waits).  Segments
are transcribed one at a time in order, as a bounded single-worker queue would.
Delay = time text is returned - time the speech ended in the replayed audio.
"""

import io
import json
import re
import statistics
import subprocess
import sys
import time
import urllib.request
import uuid
import wave

PORT = 8092


def read_segments(path):
    out = []
    for m in re.finditer(r"start = ([\d.]+), end = ([\d.]+)", open(path).read()):
        out.append((float(m.group(1)) / 100, float(m.group(2)) / 100))
    return out


def segment_wav(frames, rate, start, end):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames[int(start * rate) * 2:int(end * rate) * 2])
    return buf.getvalue()


def transcribe(audio):
    boundary = uuid.uuid4().hex
    body = b"".join([
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"s.wav\"\r\n"
        "Content-Type: audio/wav\r\n\r\n".encode(), audio, b"\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"temperature\"\r\n\r\n0.0\r\n".encode(),
        f"--{boundary}--\r\n".encode(),
    ])
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/inference", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r).get("text", "")


def main():
    server, model, wav_path, seg_path, out_path = sys.argv[1:6]
    threads = sys.argv[6] if len(sys.argv) > 6 else "8"
    limit = float(sys.argv[7]) if len(sys.argv) > 7 else 1e9
    wait = float(sys.argv[8]) if len(sys.argv) > 8 else 0.3
    # Encoder context in 20 ms frames; 0 = the full 30 s window whisper normally encodes.
    audio_ctx = sys.argv[9] if len(sys.argv) > 9 else "0"
    with wave.open(wav_path, "rb") as w:
        rate = w.getframerate()
        frames = w.readframes(w.getnframes())
    segments = [s for s in read_segments(seg_path) if s[1] <= limit]
    proc = subprocess.Popen([server, "-m", model, "-t", threads, "--port", str(PORT), "-nt", "-ac", audio_ctx],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(120):
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=2)
                break
            except Exception:
                time.sleep(1)
        transcribe(segment_wav(frames, rate, 0, 1.0))  # warm-up
        t0 = time.time()
        rows = []
        for start, end in segments:
            ready = t0 + end + wait
            now = time.time()
            if wait >= 0 and now < ready:  # a negative wait replays as fast as possible
                time.sleep(ready - now)
            sent = time.time()
            text = transcribe(segment_wav(frames, rate, start, end))
            done = time.time()
            rows.append({"start": start, "end": end, "queue_s": round(sent - (t0 + end), 3),
                         "process_s": round(done - sent, 3), "delay_s": round(done - (t0 + end), 3),
                         "words": len(text.split()), "text": text.strip()})
        delays = sorted(r["delay_s"] for r in rows)
        summary = {
            "model": model.replace("\\", "/").split("/")[-1], "threads": threads, "audio_ctx": audio_ctx, "segments": len(rows),
            "audio_s": segments[-1][1] if segments else 0,
            "median_delay_s": round(statistics.median(delays), 3),
            "p95_delay_s": round(delays[int(0.95 * (len(delays) - 1))], 3),
            "max_delay_s": round(delays[-1], 3),
            "share_within_6s": round(sum(d <= 6 for d in delays) / len(delays), 4),
            "mean_process_s": round(statistics.mean(r["process_s"] for r in rows), 3),
        }
        json.dump({"summary": summary, "rows": rows}, open(out_path, "w"), indent=1)
        with open(out_path.replace(".json", ".txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(r["text"] for r in rows) + "\n")
        print(json.dumps(summary))
    finally:
        proc.terminate()


if __name__ == "__main__":
    main()

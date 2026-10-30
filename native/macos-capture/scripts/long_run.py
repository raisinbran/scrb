#!/usr/bin/env python3
"""Long-run test: a tone plus the default mic through the real helper, with timed pauses.

Run from the Claude app's terminal pane under phase0/scripts/run-muted.sh. Prints a line a minute
with the chunks on disk, so a silent failure shows at once. A stream that stops is reported.
Usage: long_run.py <helper> <work dir> <seconds> <pause every seconds> <pause length seconds>
"""
import json, math, os, struct, subprocess, sys, threading, time, wave

helper, work, seconds, every, length = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:6])
os.makedirs(work, exist_ok=True)
tone = os.path.join(work, "tone")
rate = 8000
one = struct.pack("<%dh" % rate, *(int(9000 * math.sin(2 * math.pi * 880 * i / rate)) for i in range(rate)))
with wave.open(tone + ".wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    for _ in range(seconds + 120):
        w.writeframes(one)
subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", tone + ".wav", tone + ".m4a"], check=True)
os.remove(tone + ".wav")

player = subprocess.Popen(["afplay", tone + ".m4a"])
time.sleep(2)
worker = subprocess.Popen(["caffeinate", "-i", helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
events = open(os.path.join(work, "events.jsonl"), "a")
acks = {}

def read():
    for line in worker.stdout:
        message = json.loads(line)
        if message.get("type") == "ack":
            acks[message["id"]] = message
        elif message.get("event") != "health":
            events.write(line); events.flush()
            print("EVENT", line.strip(), flush=True)

threading.Thread(target=read, daemon=True).start()

def send(id_, **fields):
    worker.stdin.write(json.dumps({"id": id_, **fields}) + "\n"); worker.stdin.flush()
    for _ in range(500):
        if id_ in acks:
            return acks[id_]
        time.sleep(0.01)
    raise SystemExit("no reply to " + id_)

send("o", name="open", sessionId="long", outputDir=work, source=[player.pid], mic="default")
send("s", name="start")
started = time.time()
next_pause, pauses = every, 0
last_counts = None
while (elapsed := time.time() - started) < seconds:
    if elapsed >= next_pause:
        pauses += 1
        send(f"p{pauses}", name="pause"); time.sleep(length); send(f"r{pauses}", name="resume")
        next_pause += every
    if int(elapsed) % 60 == 0:
        counts = {t: len([f for f in os.listdir(os.path.join(work, "audio", t)) if f.endswith(".opus")]) for t in ("microphone", "meeting")}
        print(time.strftime("%H:%M:%S"), f"{int(elapsed)} s", counts, "STALLED" if counts == last_counts else "ok", flush=True)
        last_counts = counts
        time.sleep(1)
    time.sleep(0.2)
send("x", name="stop")
worker.wait(); player.kill()
print("run finished", pauses, "pauses")

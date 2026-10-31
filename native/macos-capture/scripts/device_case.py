#!/usr/bin/env python3
"""Hands-on device switches or sleep during a recording, with a floating countdown window.

Run from the Claude app's terminal pane, under phase0/scripts/run-muted.sh. Plays a quiet tone,
because a switch to headphones can leave the mute behind. Reports each track's chunks and gaps.
Usage: device_case.py <helper> <work dir> [devices|sleep]
"""
import json, math, os, struct, subprocess, sys, threading, time, wave

helper, work = sys.argv[1:3]
mode = sys.argv[3] if len(sys.argv) > 3 else "devices"
os.makedirs(work, exist_ok=True)
STEPS = [(30, "Put the AirPods in your ears"),
         (75, "In System Settings > Sound > Input, choose the MacBook microphone"),
         (120, "Put the AirPods back in their case")]
READY = "Put the AirPods in their case and set Input to the MacBook microphone. Then press Start."
END = 165
if mode == "sleep":
    STEPS = [(30, "Close the lid. Wait until the minute on your phone changes twice, then open it")]
    READY = "Leave the lid open. Then press Start."
    END = 45  # counted again from waking
DO_SECONDS = 15  # how long a step's instruction stays up as NOW

RATE = 8000
tone_file = os.path.join(work, "tone.wav")
with wave.open(tone_file, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    one = struct.pack("<%dh" % RATE, *(int(9000 * math.sin(2 * math.pi * 880 * i / RATE)) for i in range(RATE)))
    for _ in range(END + 600):
        w.writeframes(one)

window = subprocess.Popen([os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build", "countdown")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)


def show(status, big, action, following, step=-1):
    listed = "|".join(("> " if i == step else "   ") + "At %d s: %s" % (at, text) for i, (at, text) in enumerate(STEPS))
    window.stdin.write("\t".join([status, big, action, following, listed]) + "\n")
    window.stdin.flush()


show("Not started", "Ready", READY, "The window tells you each step.")
print("Press Start in the floating window.", flush=True)
window.stdout.readline()
player = subprocess.Popen(["afplay", "-v", "0.05", tone_file])
time.sleep(0.5)
worker = subprocess.Popen([helper], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
acks = {}
started = None


def read():
    for line in worker.stdout:
        message = json.loads(line)
        if message.get("type") == "ack":
            acks[message["id"]] = message
        elif message.get("event") != "health":
            at = time.time() - started if started else 0
            print("\n%6.1f s EVENT %s" % (at, line.strip()), flush=True)


threading.Thread(target=read, daemon=True).start()


def send(id_, **fields):
    worker.stdin.write(json.dumps({"id": id_, **fields}) + "\n")
    worker.stdin.flush()
    for _ in range(1000):
        if id_ in acks:
            return acks[id_]
        time.sleep(0.01)
    raise SystemExit("no reply to " + id_)


send("o", name="open", sessionId="s", outputDir=work, source=[player.pid], mic="default")
send("s", name="start")
started = time.time()
for index, (at, text) in enumerate(STEPS):
    following = "Then: " + STEPS[index + 1][1] if index + 1 < len(STEPS) else "Then: nothing more, the test stops itself"
    if mode == "sleep":
        following = "Then: leave the lid open while the test finishes"
    while (left := at - (time.time() - started)) > 0:
        show("Step %d of %d comes next" % (index + 1, len(STEPS)), "%d s" % math.ceil(left), "NEXT: " + text, following, index)
        time.sleep(0.2)
    print("%6.1f s NOW: %s" % (time.time() - started, text), flush=True)
    if mode == "sleep":
        # time.monotonic stops during sleep and time.time does not.
        offset = time.time() - time.monotonic()
        limit = time.time() + 300
        while time.time() - time.monotonic() - offset < 20 and time.time() < limit:
            show("Step 1 of 1", "NOW", "DO THIS NOW: " + text, following, index)
            time.sleep(0.2)
        slept = time.time() - time.monotonic() - offset
        print("%6.1f s slept for %.1f s" % (time.time() - started, slept), flush=True)
        END += time.time() - started
        break
    while (left := at + DO_SECONDS - (time.time() - started)) > 0:
        show("Step %d of %d" % (index + 1, len(STEPS)), "NOW", "DO THIS NOW: " + text, following, index)
        time.sleep(0.2)
while (left := END - (time.time() - started)) > 0:
    show("All steps done", "%d s" % math.ceil(left), "Nothing to do. The test stops itself.", "")
    time.sleep(0.2)
show("Finished", "Done", "You can tell Claude it finished.", "")
stop = send("x", name="stop")
worker.wait(); player.kill()

for track in ("microphone", "meeting"):
    lines = [json.loads(l) for l in open(os.path.join(work, "audio", track, "chunks.log"))]
    breaks = [(l["file"], l["openReason"], l["closeReason"], round(l["startNs"] / 1e9, 2)) for l in lines
              if l["openReason"] != "rollover" or l["closeReason"] != "rollover"]
    gaps = [(round(a["endNs"] / 1e9, 2), round((b["startNs"] - a["endNs"]) / 1e6)) for a, b in zip(lines, lines[1:])
            if b["startNs"] - a["endNs"] > 1e6]
    print(track, "chunks", len(lines), "end s", round(lines[-1]["endNs"] / 1e9, 2))
    print("  breaks", breaks)
    print("  gaps (at s, ms)", gaps, "total ms", sum(g[1] for g in gaps))
    print("  overlaps over 1 ms", len([1 for a, b in zip(lines, lines[1:]) if a["endNs"] - b["startNs"] > 1e6]))
print("stop at s", round(stop["atNs"] / 1e9, 2), "active", stop["activeTracks"])
print("FINISHED")
time.sleep(3)
window.stdin.close()

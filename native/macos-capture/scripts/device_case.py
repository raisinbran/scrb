#!/usr/bin/env python3
"""Hands-on device switches, sleep or permission changes during a recording, with a floating countdown window.

Run from the Claude app's terminal pane, under native/macos-capture/scripts/run-muted.sh. Plays a quiet tone,
because a switch to headphones can leave the mute behind. Reports each track's chunks and gaps.
Usage: device_case.py <helper> <work dir> [devices|sleep|permission|reopen|service|restart|call]
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
if mode == "permission":
    STEPS = [(30, "Microphone list: turn Claude OFF. If asked, choose Later"),
             (60, "Microphone list: turn Claude back ON. If asked, choose Later"),
             (90, "Go back. Open Screen & System Audio Recording. Turn Claude OFF. If asked, choose Later"),
             (120, "Same list: turn Claude back ON. If asked, choose Later")]
    READY = "Open System Settings > Privacy & Security > Microphone. Then press Start."
    END = 150
SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_%s"
# Owner-paced: each step opens its own Settings page and waits for Done. The reopen command, if any,
# follows the switch, so timing can't miss it. Each entry: page, instruction, reopen, seconds to record after.
PACED = []
if mode == "reopen":
    MIC = "Turn Claude %s here. If there are two Claude rows, do both. If asked, choose Later. Then press Done"
    AUDIO = "Under System Audio Recording, turn Claude %s. If asked, choose Later. Then press Done"
    PACED = [("Microphone", MIC % "OFF", "selectMic", 15),
             ("Microphone", MIC % "back ON", None, 15),
             ("ScreenCapture", AUDIO % "OFF", "selectSource", 20),
             ("ScreenCapture", AUDIO % "back ON", None, 20)]
    STEPS = []
    READY = "No rush: this test waits for you. It opens each Settings page itself. Press Start."
    END = 0
if mode == "service":
    STEPS = [(30, "In the Terminal app, press Return on: sudo killall coreaudiod")]
    READY = "Nothing else playing. In the Terminal app type: sudo killall coreaudiod  and do not press Return. Then press Start."
    END = 90
if mode == "restart":
    STEPS = [(30, "Apple menu > Restart. Untick Reopen windows, then click Restart")]
    READY = "Save your work and close other apps. Then press Start."
    END = 0
if mode == "call":
    STEPS = [(45, "Take the phone to another room, shut the door, and read aloud for 10 minutes")]
    READY = "Teams call running on the Mac and phone. Mac muted in Teams, phone unmuted, Mac volume at half, no headphones. Then press Start."
    END = 660

RATE = 8000
tone_file = os.path.join(work, "tone.wav")
with wave.open(tone_file, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    one = struct.pack("<%dh" % RATE, *(int(9000 * math.sin(2 * math.pi * 880 * i / RATE)) for i in range(RATE)))
    for _ in range(END + 600):
        w.writeframes(one)

window = subprocess.Popen([os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build", "countdown")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)


def show(status, big, action, following, step=-1, button=None):
    listed = "|".join(("> " if i == step else "   ") + "At %d s: %s" % (at, text) for i, (at, text) in enumerate(STEPS))
    parts = [status, big, action, following, listed] + ([button] if button else [])
    window.stdin.write("\t".join(parts) + "\n")
    window.stdin.flush()


show("Not started", "Ready", READY, "The window tells you each step.")
print("Press Start in the floating window.", flush=True)
window.stdout.readline()
player = subprocess.Popen(["afplay", "-v", "0.05", tone_file]) if mode != "call" else None
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


# The tone may not survive the audio service, and a whole-computer track needs no process to follow.
source = [player.pid] if player and mode != "service" else []
if mode == "call":
    apps = [a for a in send("l", name="listApps").get("apps", []) if "teams" in a["name"].lower() and a["pids"]]
    print("Teams processes", apps, flush=True)
    if not apps:
        show("Stopped", "No call", "Teams has no audio running. Start the call, then tell Claude.", "")
        time.sleep(30)
        raise SystemExit("no Teams audio")
    source = [pid for a in apps for pid in a["pids"]]
send("o", name="open", sessionId="s", outputDir=work, source=source, mic="default")
send("s", name="start")
started = time.time()

def record_for(seconds, status):
    until = time.time() + seconds
    while (left := until - time.time()) > 0:
        show(status, "%d s" % math.ceil(left), "Nothing to do. The test is recording.", "")
        time.sleep(0.2)


if PACED:
    record_for(12, "Getting started")
for index, (page, text, reopen, after) in enumerate(PACED):
    subprocess.run(["open", SETTINGS % page])
    show("Step %d of %d" % (index + 1, len(PACED)), "NOW", text, "Take as long as you need", button="Done")
    window.stdout.readline()
    print("%6.1f s switch done: %s" % (time.time() - started, text), flush=True)
    if reopen:
        record_for(5, "Step %d of %d done" % (index + 1, len(PACED)))
        fields = {"mic": "default"} if reopen == "selectMic" else {"source": source}
        print("%6.1f s %s %s" % (time.time() - started, reopen, send("r%d" % index, name=reopen, **fields)), flush=True)
    record_for(after, "Step %d of %d done" % (index + 1, len(PACED)))
for index, (at, text) in enumerate(STEPS):
    following = "Then: " + STEPS[index + 1][1] if index + 1 < len(STEPS) else "Then: nothing more, the test stops itself"
    if mode == "sleep":
        following = "Then: leave the lid open while the test finishes"
    if mode == "call":
        following = "Then: come back when you finish. The test stops itself"
    while (left := at - (time.time() - started)) > 0:
        show("Step %d of %d comes next" % (index + 1, len(STEPS)), "%d s" % math.ceil(left), "NEXT: " + text, following, index)
        time.sleep(0.2)
    print("%6.1f s NOW: %s" % (time.time() - started, text), flush=True)
    if mode == "restart":
        following = "After restart: open Claude and tell it you are back"
        while time.time() - started < at + 300:  # normally ended by the restart
            show("Step 1 of 1", "NOW", "DO THIS NOW: " + text, following, index)
            time.sleep(0.2)
        break
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
worker.wait()
if player:
    player.kill()

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

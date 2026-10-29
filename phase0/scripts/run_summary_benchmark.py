"""Benchmark local summary models on AMI action-item and decision extraction.

Usage: python -I run_summary_benchmark.py <llama-server.exe> <fixtures_dir> <out_dir>
       <threads> <model.gguf> [<model.gguf> ...] -- <meeting> [<meeting> ...]

For each model, starts llama-server, sends each transcript with a JSON schema
response format, saves the extracted items, and records wall time, token
counts, peak server working set, and the share of evidence timestamps that
match a transcript line.  Recall/precision against the AMI reference is judged
separately from the saved outputs.
"""

import ctypes
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

PORT = 8091
SYSTEM = (
    "You extract structured notes from meeting transcripts. Each transcript line is "
    "'[mm:ss] SPEAKER: words'. List every action item (a task someone agreed or was "
    "assigned to do after the meeting) and every decision (something the group agreed "
    "or settled). Use only what the transcript supports; do not invent items. For each "
    "item give the [mm:ss] timestamp of the transcript line that best supports it, "
    "copied exactly as it appears."
)
# Optional cap on list length (SUMMARY_MAX_ITEMS) guards against repetition loops.
MAX_ITEMS = int(os.environ.get("SUMMARY_MAX_ITEMS", "0"))
SCHEMA = {
    "type": "object",
    "properties": {
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "owner": {"type": "string"},
                    "timestamp": {"type": "string", "pattern": "^[0-9]{2}:[0-9]{2}$"},
                },
                "required": ["text", "owner", "timestamp"],
            },
        },
        "decisions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "timestamp": {"type": "string", "pattern": "^[0-9]{2}:[0-9]{2}$"},
                },
                "required": ["text", "timestamp"],
            },
        },
    },
    "required": ["action_items", "decisions"],
}


def memory_mib(pid):
    """Return (peak working set, peak private bytes) in MiB for a process.

    On macOS both values are the lifetime peak physical footprint, which on
    Apple Silicon includes Metal (unified) memory.
    """
    if sys.platform == "darwin":
        info = (ctypes.c_uint64 * 64)()  # rusage_info_v4 is 16 uuid bytes + uint64 fields
        ctypes.CDLL("/usr/lib/libproc.dylib").proc_pid_rusage(pid, 4, ctypes.byref(info))
        peak = info[2 + 28] / 2**20  # ri_lifetime_max_phys_footprint
        return peak, peak
    import ctypes.wintypes as wt

    class PROCESS_MEMORY_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("cb", wt.DWORD), ("PageFaultCount", wt.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    handle = ctypes.windll.kernel32.OpenProcess(0x0410, False, pid)
    counters = PROCESS_MEMORY_COUNTERS()
    counters.cb = ctypes.sizeof(counters)
    ctypes.windll.psapi.GetProcessMemoryInfo(handle, ctypes.byref(counters), counters.cb)
    ctypes.windll.kernel32.CloseHandle(handle)
    return counters.PeakWorkingSetSize / 2**20, counters.PeakPagefileUsage / 2**20


def post(path, body, timeout=3600):
    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}{path}", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


SECTION_CHARS = 40000  # about 15k tokens at ~2.6 chars/token for these transcripts


if MAX_ITEMS:
    for key in ("action_items", "decisions"):
        SCHEMA["properties"][key]["maxItems"] = MAX_ITEMS


def split_sections(transcript):
    """Split on line boundaries into the fewest roughly equal sections under the limit."""
    count = -(-len(transcript) // SECTION_CHARS)
    target = len(transcript) / count
    sections, current = [], []
    size = 0
    for line in transcript.splitlines(keepends=True):
        if current and size + len(line) > target and len(sections) < count - 1:
            sections.append("".join(current))
            current, size = [], 0
        current.append(line)
        size += len(line)
    sections.append("".join(current))
    return sections


def wait_ready(proc):
    for _ in range(600):
        if proc.poll() is not None:
            raise RuntimeError("llama-server exited")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=2) as r:
                if r.status == 200:
                    return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("llama-server not ready")


def main():
    server, fixtures, out, threads = sys.argv[1:5]
    rest = sys.argv[5:]
    split = rest.index("--")
    models, meetings = rest[:split], rest[split + 1:]
    os.makedirs(out, exist_ok=True)
    results = []
    for model in models:
        name = os.path.basename(model).replace(".gguf", "")
        log = open(os.path.join(out, f"{name}.server.log"), "w")
        proc = subprocess.Popen(
            [server, "-m", model, "-c", "24576", "-fa", "on", "-ctk", "q8_0", "-ctv", "q8_0",
             "-t", threads, "-np", "1",
             "--port", str(PORT), "--host", "127.0.0.1"]
            # Extra llama-server flags, e.g. LLAMA_EXTRA_ARGS="-ngl 99" for GPU offload.
            + os.environ.get("LLAMA_EXTRA_ARGS", "").split(),
            stdout=log, stderr=subprocess.STDOUT)
        try:
            load_start = time.time()
            wait_ready(proc)
            load_seconds = time.time() - load_start
            for meeting in meetings:
                row_path = os.path.join(out, f"{name}.{meeting}.row.json")
                if os.path.exists(row_path):
                    results.append(json.load(open(row_path, encoding="utf-8")))
                    continue
                transcript = open(os.path.join(fixtures, f"{meeting}.transcript.txt"), encoding="utf-8").read()
                stamps = set(re.findall(r"^\[(\d{2}:\d{2})\]", transcript, re.M))
                started = time.time()
                items = {"action_items": [], "decisions": []}
                prompt_tokens = completion_tokens = 0
                json_valid = True
                sections = split_sections(transcript)
                retries = 0

                def extract(system, user):
                    """One schema-constrained request; on a loop (token limit or bad JSON)
                    retry once with sampling and DRY, which greedy decoding ignores."""
                    nonlocal prompt_tokens, completion_tokens, retries
                    body = {
                        "messages": [{"role": "system", "content": system},
                                     {"role": "user", "content": user}],
                        "temperature": 0,
                        "max_tokens": 4096,
                        "response_format": {"type": "json_schema", "json_schema": {"name": "notes", "schema": SCHEMA}},
                        # Qwen needs thinking disabled; Ministral's template breaks on this
                        # kwarg in newer llama.cpp builds (SUMMARY_NO_TEMPLATE_KWARGS=1).
                        **({} if os.environ.get("SUMMARY_NO_TEMPLATE_KWARGS")
                           else {"chat_template_kwargs": {"enable_thinking": False}}),
                        # Extra sampling fields as JSON, e.g. '{"dry_multiplier": 0.8}'.
                        **json.loads(os.environ.get("SUMMARY_SAMPLING", "{}")),
                    }
                    for attempt in range(2):
                        resp = post("/v1/chat/completions", body)
                        prompt_tokens += resp.get("usage", {}).get("prompt_tokens", 0)
                        completion_tokens += resp.get("usage", {}).get("completion_tokens", 0)
                        choice = resp["choices"][0]
                        content = choice["message"]["content"]
                        try:
                            if choice.get("finish_reason") == "length":
                                raise json.JSONDecodeError("token limit", content or "", 0)
                            return json.loads(content), None
                        except json.JSONDecodeError:
                            if attempt == 0 and os.environ.get("SUMMARY_RETRY"):
                                retries += 1
                                body.update({"temperature": 0.4, "seed": 1, "dry_multiplier": 0.8,
                                             "dry_base": 1.75, "dry_allowed_length": 4})
                                continue
                            return None, content

                coverage_system = SYSTEM + (
                    " A first pass already extracted the items listed after the transcript. "
                    "Return ONLY action items and decisions that the first pass missed; "
                    "return empty lists if nothing is missing. Do not repeat or rephrase listed items.")
                for section in sections:
                    part, bad = extract(SYSTEM, section)
                    if part is None:
                        json_valid = False
                        items.setdefault("invalid_json", []).append(bad)
                        continue
                    items["action_items"] += part.get("action_items", [])
                    items["decisions"] += part.get("decisions", [])
                    if os.environ.get("SUMMARY_COVERAGE"):
                        listed = json.dumps(part, indent=1)
                        extra, bad = extract(coverage_system,
                                             section + "\n\nAlready extracted:\n" + listed)
                        if extra is None:
                            items.setdefault("invalid_json", []).append(bad)
                            continue
                        for key in ("action_items", "decisions"):
                            for item in extra.get(key, []):
                                item["pass"] = "coverage"
                                items[key].append(item)
                seconds = time.time() - started
                all_items = items["action_items"] + items["decisions"]
                valid = sum(1 for i in all_items if i.get("timestamp") in stamps)
                with open(os.path.join(out, f"{name}.{meeting}.json"), "w", encoding="utf-8") as f:
                    json.dump(items, f, indent=2)
                row = {
                    "model": name, "meeting": meeting, "load_seconds": round(load_seconds, 1),
                    "seconds": round(seconds, 1), "sections": len(sections), "retries": retries,
                    "coverage_items": sum(1 for i in all_items if i.get("pass") == "coverage"),
                    "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens,
                    "actions": len(items["action_items"]),
                    "decisions": len(items["decisions"]),
                    "valid_timestamps": f"{valid}/{len(all_items)}",
                    "json_valid": json_valid,
                }
                with open(row_path, "w", encoding="utf-8") as f:
                    json.dump(row, f)
                results.append(row)
                print(json.dumps(row), flush=True)
            peak_ws, peak_private = memory_mib(proc.pid)
            for row in results:
                if row["model"] == name:
                    row["peak_working_set_mib"] = round(peak_ws)
                    row["peak_private_mib"] = round(peak_private)
            print(json.dumps({"model": name, "peak_working_set_mib": round(peak_ws),
                              "peak_private_mib": round(peak_private)}), flush=True)
        finally:
            proc.terminate()
            proc.wait()
            log.close()
    with open(os.path.join(out, "results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()

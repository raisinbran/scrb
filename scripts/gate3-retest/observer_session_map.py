"""Convert observer publication times (harness Stopwatch/QPC) to the session timestamped-capture timeline.

One conversion, no marker fit: session_s = ticks / frequency - session_origin_s. Every input is bound to
evidence and re-verified here; anything missing or inconsistent raises ValueError and nothing is scored.

Scorer convention: a publication's true appearance lies in [observed - u, observed]. A symmetric
conversion error of +/- e therefore moves the latest possible appearance to nominal + e and the earliest
to nominal - polling_u - e, so observed = nominal + e and u = polling_u + 2e.

The origin is the "reconstructed effective origin" (device stamp minus embedded START_NS, constant across
every chunk of the track). It is not a logged clockOriginNs; the app at 553dd90 does not persist one. A
logged value may be supplied and must then equal the reconstruction.
"""
import hashlib
import json
import math

SCHEMA = "SRCB-G3-OBSERVER-SESSION-MAP-2"
# observer_publications.load_raw adds these to the header it returns; they are not in the first line of the file.
HEADER_DERIVED_KEYS = ("errors", "error_samples")


def canonical_sha256(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def need(condition, message):
    if not condition:
        raise ValueError(message)


def is_int(value):
    return type(value) is int


def verify_chunk_evidence(gap_map, track, logged_clock_origin_ns=None):
    """Recompute the effective origin and identity from the chunk rows; compare with the stored context."""
    need(isinstance(gap_map, dict) and gap_map.get("valid") is True and gap_map.get("track") == track,
         "Gap map missing, invalid or for a different track")
    context = gap_map.get("clock_context")
    need(isinstance(context, dict) and context.get("schema_version") == 1, "Missing or unsupported clock context")
    identity = context.get("track_identity") or {}
    need(identity.get("track") == track, "Clock context belongs to a different track")
    basis = context.get("qpc_basis") or {}
    need(basis.get("capture_units") == "ns" and basis.get("nanoseconds_per_second") == 1_000_000_000,
         "Capture clock units are not nanoseconds")
    rows = gap_map.get("chunks")
    need(isinstance(rows, list) and rows, "No chunk rows")
    for row in rows:
        need(is_int(row.get("device_stamp_ns")) and is_int(row.get("start_ns")) and isinstance(row.get("session_id"), str)
             and row["session_id"], "A chunk lacks its device stamp, start or session id")
    sessions = {row["session_id"] for row in rows}
    need(len(sessions) == 1 and context.get("session_id") in sessions and identity.get("session_id") in sessions,
         "Session identity differs between chunks and clock context")
    origins = {row["device_stamp_ns"] - row["start_ns"] for row in rows}
    need(len(origins) == 1, "Device stamp minus start is not constant across the track's chunks")
    origin = next(iter(origins))
    need(origin > 0 and context.get("session_origin_ns") == origin
         and context.get("origin_status") == "RECONSTRUCTED_CONSTANT"
         and context.get("origin_evidence_chunks") == len(rows),
         "Stored origin differs from the reconstruction from the chunk stamps")
    hashes = [row["source_sha256"] for row in rows]
    need(hashes == identity.get("ordered_source_sha256"), "Source chunk hashes differ from the clock context")
    need(gap_map.get("metadata_sha256") == identity.get("chunks_metadata_sha256"), "Chunk metadata hash differs")
    rebuilt = {k: identity[k] for k in ("track", "session_id", "chunks_metadata_sha256", "ordered_source_sha256")}
    need(canonical_sha256(rebuilt) == identity.get("sha256"), "Track identity hash does not match its contents")
    kind = "reconstructed effective origin (device stamp minus embedded start, constant across chunks)"
    if logged_clock_origin_ns is not None:
        need(is_int(logged_clock_origin_ns) and logged_clock_origin_ns > 0, "Invalid logged clockOriginNs")
        need(logged_clock_origin_ns == origin, "Logged clockOriginNs disagrees with the reconstructed effective origin")
        kind = "logged clockOriginNs (equal to the reconstructed effective origin)"
    return {"origin_ns": origin, "origin_kind": kind, "session_id": next(iter(sessions)), "track": track,
            "chunk_count": len(rows), "ordered_source_sha256": hashes,
            "chunks_metadata_sha256": gap_map["metadata_sha256"], "track_identity_sha256": identity["sha256"]}


def verify_clock_logs(doc, raw_header, harness_events):
    """Origin ticks and frequency must agree across the publications, the observer header and the harness log."""
    need(isinstance(raw_header, dict) and raw_header.get("type") == "header", "Missing observer raw header")
    frequency, origin = raw_header.get("qpc_frequency"), raw_header.get("origin_qpc")
    need(is_int(frequency) and frequency > 0 and is_int(origin) and origin >= 0, "Observer header lacks origin ticks or frequency")
    need(doc.get("qpc_frequency") == frequency and doc.get("harness_origin_qpc") == origin,
         "Publication file origin ticks or frequency differ from the observer header")
    need(isinstance(harness_events, list) and harness_events, "Missing harness log")
    devices = [e for e in harness_events if isinstance(e, dict) and e.get("event") == "devices"]
    need(len(devices) == 1 and (devices[0].get("data") or {}).get("stopwatch_frequency") == frequency,
         "Harness log frequency differs from the observer header")
    ticks = []
    for event in harness_events:
        stamp = event.get("stamp") if isinstance(event, dict) else None
        need(isinstance(stamp, dict) and is_int(stamp.get("qpc_ticks")), "Harness log event without QPC ticks")
        ticks.append(stamp["qpc_ticks"])
    need(ticks == sorted(ticks) and ticks[0] >= origin,
         "Harness log ticks are not on the observer's counter (before its origin or out of order)")
    return {"observer_header_origin_qpc": origin, "observer_header_frequency_hz": frequency,
            "observer_header_sha256": canonical_sha256({k: v for k, v in raw_header.items() if k not in HEADER_DERIVED_KEYS}),
            "harness_log_frequency_hz": frequency, "harness_log_events": len(harness_events),
            "harness_log_first_qpc": ticks[0], "harness_log_last_qpc": ticks[-1],
            "harness_log_sha256": canonical_sha256(harness_events)}


def publications_to_timestamped(doc, gap_map, *, track, raw_header, harness_events, conversion_u_s,
                                conversion_u_basis, logged_clock_origin_ns=None):
    """Return a recording-basis publication document in timestamped capture seconds, with its evidence record.

    `doc` is observer_publications.py output (clock_basis harness, seconds since harness_origin_qpc, carrying
    harness_origin_qpc and qpc_frequency). `conversion_u_s` bounds the observer-to-capture QPC mismatch
    (the raw capture frequency is not logged); it must be at least one counter tick, and its basis is recorded.
    """
    need(doc.get("clock_basis") == "harness", "Publications must be on the harness clock")
    logs = verify_clock_logs(doc, raw_header, harness_events)
    chunks = verify_chunk_evidence(gap_map, track, logged_clock_origin_ns)
    frequency = logs["observer_header_frequency_hz"]
    e = conversion_u_s
    need(isinstance(e, (int, float)) and not isinstance(e, bool) and math.isfinite(e) and e >= 1 / frequency,
         "Conversion uncertainty is missing or below one counter tick")
    need(isinstance(conversion_u_basis, str) and conversion_u_basis.strip(), "The basis of the conversion uncertainty must be stated")
    shift_s = (doc["harness_origin_qpc"] * 1_000_000_000 // frequency - chunks["origin_ns"]) / 1e9
    words = []
    for word in doc["words"]:
        if word["track"] != track:
            continue
        # [observed - u, observed] is where the row may have appeared; +/- e widens both ends.
        words.append({**word, "observed": word["observed"] + shift_s + e, "u": word["u"] + 2 * e})
    return {"schema": SCHEMA, "clock_basis": "recording", "publication_basis": "timestamped-capture",
            "track": track, "recording_sha256": doc.get("recording_sha256"), "words": words,
            "quarantined_rows": doc.get("quarantined_rows", []),
            "conversion": {**chunks, **logs, "harness_origin_qpc": doc["harness_origin_qpc"], "shift_s": shift_s,
                           "conversion_u_s": e, "conversion_u_basis": conversion_u_basis,
                           "observed_rule": "observed = nominal + e; u = polling_u + 2e",
                           "assumption": "Stopwatch ticks and the capture helper's QPC nanoseconds count the same counter; "
                                         "raw capture frequency is not logged",
                           "marker_fit_used": False}}

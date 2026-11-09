"""Convert observer publication times (harness Stopwatch/QPC) to the session timestamped-capture timeline.

One conversion, no marker fit: session_ns = qpc_ns - session_origin_ns, where qpc_ns = ticks * 1e9 / frequency.
The origin comes from the capture clock context in the v3a clock report or gap map (schema 1). A logged
clockOriginNs (the helper's start acknowledgement) is preferred when the caller supplies one and must
equal the reconstruction when both exist. The affine marker fit is never used here.
"""
import math

SCHEMA = "SRCB-G3-OBSERVER-SESSION-MAP-1"


def session_origin(context, logged_clock_origin_ns=None):
    """Return (origin_ns, method). Refuse missing, inconsistent or conflicting origin evidence."""
    if not isinstance(context, dict) or context.get("schema_version") != 1:
        raise ValueError("Missing or unsupported clock context")
    basis = context.get("qpc_basis") or {}
    if basis.get("capture_units") != "ns" or basis.get("nanoseconds_per_second") != 1_000_000_000:
        raise ValueError("Capture clock units are not nanoseconds")
    reconstructed = context.get("session_origin_ns")
    if reconstructed is not None and context.get("origin_status") != "RECONSTRUCTED_CONSTANT":
        raise ValueError("Origin evidence is not a consistent constant")
    if logged_clock_origin_ns is not None:
        if type(logged_clock_origin_ns) is not int or logged_clock_origin_ns <= 0:
            raise ValueError("Invalid logged clockOriginNs")
        if reconstructed is not None and reconstructed != logged_clock_origin_ns:
            raise ValueError("Logged clockOriginNs disagrees with the reconstruction")
        return logged_clock_origin_ns, "LOGGED_CLOCK_ORIGIN_NS"
    if type(reconstructed) is not int:
        raise ValueError("No session origin available; observer times cannot be placed")
    return reconstructed, "RECONSTRUCTED_FROM_CHUNK_STAMPS"


def publications_to_timestamped(doc, context, *, track, harness_origin_qpc, frequency,
                                conversion_u_s, logged_clock_origin_ns=None):
    """Return a recording-basis publication document in timestamped capture seconds.

    `doc` is observer_publications.py output (clock_basis harness, seconds since harness_origin_qpc).
    `conversion_u_s` is the caller's explicit bound on the observer-to-capture QPC mismatch (the raw
    capture frequency is not logged, so none is assumed); it is added to every `u`.
    """
    if doc.get("clock_basis") != "harness":
        raise ValueError("Publications must be on the harness clock")
    if not (type(frequency) is int and frequency > 0 and type(harness_origin_qpc) is int):
        raise ValueError("Harness origin ticks and observer frequency must be integers")
    if not (isinstance(conversion_u_s, (int, float)) and math.isfinite(conversion_u_s) and conversion_u_s >= 0):
        raise ValueError("An explicit non-negative conversion uncertainty is required")
    identity = (context or {}).get("track_identity") or {}
    if identity.get("track") != track:
        raise ValueError("Clock context belongs to a different track")
    origin_ns, method = session_origin(context, logged_clock_origin_ns)
    shift_s = (harness_origin_qpc * 1_000_000_000 // frequency - origin_ns) / 1e9
    words = []
    for word in doc["words"]:
        if word["track"] != track:
            continue
        words.append({**word, "observed": word["observed"] + shift_s, "u": word["u"] + conversion_u_s})
    return {"schema": SCHEMA, "clock_basis": "recording", "publication_basis": "timestamped-capture",
            "track": track, "recording_sha256": doc.get("recording_sha256"), "words": words,
            "quarantined_rows": doc.get("quarantined_rows", []),
            "conversion": {"origin_ns": origin_ns, "origin_method": method, "observer_frequency_hz": frequency,
                           "harness_origin_qpc": harness_origin_qpc, "shift_s": shift_s,
                           "conversion_u_s": conversion_u_s,
                           "assumption": "Stopwatch ticks and the capture helper's QPC nanoseconds count the same counter; "
                                         "raw capture frequency is not logged",
                           "marker_fit_used": False}}

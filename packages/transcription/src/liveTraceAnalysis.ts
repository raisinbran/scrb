import type { TraceRecord } from './liveTrace.js';

export interface TraceAnalysis {
  streams: { stream: string; complete: boolean; dropped: number; ioFailures: number }[];
  observations: {
    session: string;
    workerRun: number;
    track?: string;
    evaluation?: number;
    call?: number;
    spanId?: string;
    state: string;
    diagnosis: string;
    elapsedMs?: number;
    queueDelayMs?: number;
    deliveryMs?: number;
    delayed?: boolean;
  }[];
  unknown: boolean;
}

/** Pure metadata analysis. Absence is never a cause when telemetry is incomplete. */
export function analyzeLiveTrace(
  records: TraceRecord[],
  malformed = false,
  delayedMs = 6000,
): TraceAnalysis {
  const groups = new Map<string, TraceRecord[]>();
  for (const r of records) {
    const key = `${r.session}/${r.stream}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const complete = new Map<string, boolean>();
  const streams = [...groups.values()].map((rows) => {
    rows.sort((a, b) => a.serial - b.serial);
    const start = rows[0]!,
      end = rows.at(-1)!;
    const clean =
      !malformed &&
      start.stage === 'trace_start' &&
      end.stage === 'trace_end' &&
      (end.dropped ?? 0) === 0 &&
      (end.ioFailures ?? 0) === 0 &&
      rows.every((r, i) => r.serial === i && Number.isFinite(r.monoMs));
    complete.set(start.stream, clean);
    return {
      stream: start.stream,
      complete: clean,
      dropped: end.dropped ?? 0,
      ioFailures: end.ioFailures ?? 0,
    };
  });
  const wall = (r: TraceRecord): number | undefined => {
    const anchor = groups.get(`${r.session}/${r.stream}`)?.find((x) => x.stage === 'trace_start');
    if (
      !anchor ||
      ![anchor.anchorWallMs, anchor.anchorBeforeMs, anchor.anchorAfterMs].every(
        (x) => typeof x === 'number' && Number.isFinite(x),
      )
    )
      return undefined;
    return anchor.anchorWallMs! + r.monoMs - (anchor.anchorBeforeMs! + anchor.anchorAfterMs!) / 2;
  };
  const observations: TraceAnalysis['observations'] = [];
  for (const start of records.filter((r) => r.stage === 'vad_start')) {
    const scope = records.filter(
      (r) => r.stream === start.stream && r.evaluation === start.evaluation,
    );
    const end = scope.find((r) => r.stage === 'vad_end');
    const deferred = scope.filter((r) => r.stage === 'defer' && r.reason === 'settle');
    if (end?.spanCount === 0 || deferred.length || !end)
      observations.push({
        session: start.session,
        workerRun: start.workerRun ?? 0,
        ...(start.track ? { track: start.track } : {}),
        evaluation: start.evaluation!,
        state: !end ? 'VAD_ENTERED_NO_EXIT' : end.spanCount === 0 ? 'VAD_EMPTY' : 'SPEECH_DEFERRED',
        diagnosis:
          !end || !complete.get(start.stream)
            ? 'UNKNOWN'
            : end.spanCount === 0
              ? 'EMPTY_VAD_RESULT'
              : 'SETTLE_DEFERRAL',
        ...(end ? { elapsedMs: end.monoMs - start.monoMs } : {}),
      });
  }
  for (const start of records.filter((r) => r.stage === 'model_start')) {
    const scope = records.filter((r) => r.stream === start.stream && r.call === start.call);
    const end = scope.find((r) => r.stage === 'model_end');
    const emitted = scope.find((r) => r.stage === 'segment_emit');
    const joined = records.filter(
      (r) =>
        r.session === start.session &&
        r.workerRun === start.workerRun &&
        r.segmentKey !== undefined &&
        r.segmentKey === emitted?.segmentKey,
    );
    const receipt = joined.find((r) => r.stage === 'segment_received');
    const delivered = joined.find((r) => r.stage === 'segment_delivered');
    const queue = records.find(
      (r) =>
        r.stage === 'frame_dequeue' &&
        r.session === start.session &&
        r.workerRun === start.workerRun &&
        r.track === start.track &&
        r.generation === start.generation &&
        r.sequence === start.sequence,
    );
    const clean =
      complete.get(start.stream) &&
      (!receipt || complete.get(receipt.stream)) &&
      (!delivered || complete.get(delivered.stream));
    const state = !end
      ? 'MODEL_ENTERED_NO_EXIT'
      : end.wordCount === 0
        ? 'RECOGNITION_EMPTY'
        : !emitted
          ? 'NONEMPTY_NO_EMISSION'
          : !receipt
            ? 'EMITTED_NO_RECEIPT'
            : !delivered
              ? 'RECEIVED_NO_DELIVERY'
              : 'DELIVERED';
    const stopped = records.some(
      (r) => r.stream === start.stream && r.stage === 'engine_stop' && r.monoMs >= start.monoMs,
    );
    // A missing peer file or footer cannot demonstrate a transport/delivery failure.
    const peerPresent = records.some(
      (r) =>
        r.session === start.session && r.role === 'supervisor' && r.workerRun === start.workerRun,
    );
    const diagnosis =
      !clean ||
      !end ||
      (emitted && (!peerPresent || !delivered)) ||
      (!emitted && stopped && end.wordCount! > 0)
        ? 'UNKNOWN'
        : state;
    const a = emitted && wall(emitted),
      b = delivered && wall(delivered);
    const elapsed = end ? end.monoMs - start.monoMs : undefined;
    observations.push({
      session: start.session,
      workerRun: start.workerRun ?? 0,
      ...(start.track ? { track: start.track } : {}),
      ...(start.spanId ? { spanId: start.spanId } : {}),
      call: start.call!,
      state: !end && stopped ? 'STOPPED_DURING_MODEL' : state,
      diagnosis,
      ...(elapsed !== undefined
        ? {
            elapsedMs: elapsed,
            delayed:
              elapsed +
                (queue?.queueDelayMs ?? 0) +
                (typeof a === 'number' && typeof b === 'number' ? Math.max(0, b - a) : 0) >
              delayedMs,
          }
        : {}),
      ...(queue?.queueDelayMs !== undefined ? { queueDelayMs: queue.queueDelayMs } : {}),
      ...(typeof a === 'number' && typeof b === 'number' ? { deliveryMs: b - a } : {}),
    });
  }
  return {
    streams,
    observations,
    unknown:
      malformed ||
      !streams.length ||
      streams.some((s) => !s.complete) ||
      observations.some((o) => o.diagnosis === 'UNKNOWN'),
  };
}

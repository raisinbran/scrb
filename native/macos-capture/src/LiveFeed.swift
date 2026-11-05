import AVFoundation
import Darwin

/// Owns a separate inherited descriptor; no live I/O or converter runs on the durable writer.
/// Failed or stalled readers lose only live audio. Stop never joins this thread.
final class LiveFeed {
    let rings: [OpaquePointer]
    private let fd: Int32

    init?(fd: Int32) {
        guard fd >= 3,
              fcntl(fd, F_SETNOSIGPIPE, 1) == 0,
              fcntl(fd, F_SETFL, fcntl(fd, F_GETFL) | O_NONBLOCK) == 0,
              let mic = live_ring_create() else { return nil }
        guard let meeting = live_ring_create() else { live_ring_destroy(mic); return nil }
        self.fd = fd
        rings = [mic, meeting]
    }

    deinit { for ring in rings { live_ring_destroy(ring) } }

    func start() {
        let thread = Thread { [self] in export() }
        thread.qualityOfService = .utility
        thread.start()
    }

    func stop() { for ring in rings { live_request_stop(ring) } }

    private func export() {
        defer { stop(); Darwin.close(fd) }
        let tracks = [LiveTrackEncoder(track: 0), LiveTrackEncoder(track: 1)]
        var pending: [Data] = []
        var offset = 0
        while !live_is_stopped(rings[0]) {
            if pending.isEmpty {
                for index in rings.indices {
                    guard let slot = live_peek(rings[index]) else { continue }
                    guard let frames = tracks[index].encode(slot) else { return }
                    pending += frames
                    live_advance(rings[index])
                }
                if pending.isEmpty { Thread.sleep(forTimeInterval: 0.002); continue }
            }
            let sent = pending[0].withUnsafeBytes { bytes in
                Darwin.write(fd, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
            }
            if sent > 0 {
                offset += sent
                if offset == pending[0].count { pending.removeFirst(); offset = 0 }
            } else if sent < 0 && errno == EINTR {
                continue
            } else if sent < 0 && (errno == EAGAIN || errno == EWOULDBLOCK) {
                // Keep the in-progress frame intact; producer overflow drops only queued live input.
                Thread.sleep(forTimeInterval: 0.002)
            } else {
                return
            }
        }
    }
}

/// Export-thread-only state. Host stamps anchor generations; output sample counts place frames.
final class LiveTrackEncoder {
    private let track: UInt8
    private var generation: UInt32?
    private var nextAttempt: UInt64 = 0
    private var sequence: UInt32 = 0
    private var endNs: Int64 = 0
    private var rate = 0.0
    private var converter: LiveRateConverter?
    private var closed = false
    private var pendingSamples: [Int16] = []

    init(track: UInt8) { self.track = track }

    func encode(_ pointer: UnsafePointer<LiveSlot>) -> [Data]? {
        let slot = pointer.pointee
        let missing = slot.attempt != nextAttempt
        nextAttempt = slot.attempt + 1
        if missing {
            // A missing boundary or input slot must break model context, without compressing time.
            sequence &+= 1
            converter = nil
            pendingSamples.removeAll(keepingCapacity: true)
            rate = 0
        }
        var frames: [Data] = []
        if generation != slot.generation || missing || rate != slot.rate && !slot.boundary {
            if !missing, generation != nil, !closed {
                guard flush(into: &frames) else { return nil }
                frames.append(frame(samples: [], boundary: true))
            }
            generation = slot.generation
            converter = nil
            rate = slot.rate
            endNs = max(endNs, slot.startNs)
            closed = false
        }
        if slot.boundary {
            guard !closed else { return frames }
            guard flush(into: &frames) else { return nil }
            frames.append(frame(samples: [], boundary: true))
            closed = true
            return frames
        }
        guard !closed, slot.count > 0, slot.count <= LIVE_SLOT_SAMPLES,
              slot.rate >= 8000, slot.rate <= 192000 else { return nil }
        if converter == nil { converter = LiveRateConverter(rate: slot.rate) }
        guard let converter else { return nil }
        let output = withUnsafePointer(to: slot.samples) { raw in
            raw.withMemoryRebound(to: Int16.self, capacity: Int(slot.count)) {
                converter.convert(UnsafeBufferPointer(start: $0, count: Int(slot.count)))
            }
        }
        guard let output else { return nil }
        append(output, into: &frames)
        return frames
    }

    private func flush(into frames: inout [Data]) -> Bool {
        if let converter {
            guard let tail = converter.convert(nil) else { return false }
            append(tail, into: &frames)
        }
        converter = nil
        if !pendingSamples.isEmpty {
            frames.append(frame(samples: pendingSamples, boundary: false))
            pendingSamples.removeAll(keepingCapacity: true)
        }
        return true
    }

    private func append(_ samples: [Int16], into frames: inout [Data]) {
        pendingSamples += samples
        while pendingSamples.count >= 1600 {
            frames.append(frame(samples: Array(pendingSamples.prefix(1600)), boundary: false))
            pendingSamples.removeFirst(1600)
        }
    }

    private func frame(samples: [Int16], boundary: Bool) -> Data {
        var bytes = Data([0x53, 0x4c, 0x50, 0x31, 1, track, boundary ? 1 : 0, 0])
        func put<T: FixedWidthInteger>(_ value: T) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { bytes.append(contentsOf: $0) }
        }
        put(sequence); put(generation ?? 0); put(UInt64(max(0, endNs)))
        put(UInt32(16000)); put(UInt32(samples.count))
        for sample in samples { put(sample) }
        sequence &+= 1
        endNs += Int64(samples.count) * 62_500
        return bytes
    }
}

/// Separate 16 kHz conversion. Normal priming compensates filter delay before output is timestamped.
/// Flushing keeps the filter tail within its generation; overflow discards it instead.
final class LiveRateConverter {
    private let converter: AVAudioConverter
    private let input: AVAudioFormat
    private let output: AVAudioFormat
    private let inputRate: Double
    private var inputCount: Int64 = 0
    private var outputCount: Int64 = 0
    private var buffered: [Int16] = []

    init?(rate: Double) {
        guard let input = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: rate, channels: 1, interleaved: true),
              let output = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: input, to: output) else { return nil }
        converter.primeMethod = .normal
        converter.sampleRateConverterQuality = AVAudioQuality.high.rawValue
        self.input = input
        self.output = output
        self.converter = converter
        self.inputRate = rate
    }

    func convert(_ samples: UnsafeBufferPointer<Int16>?) -> [Int16]? {
        var source: AVAudioPCMBuffer?
        if let samples {
            inputCount += Int64(samples.count)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: input, frameCapacity: AVAudioFrameCount(samples.count)) else { return nil }
            buffer.frameLength = AVAudioFrameCount(samples.count)
            buffer.int16ChannelData![0].update(from: samples.baseAddress!, count: samples.count)
            source = buffer
        }
        var result: [Int16] = []
        while true {
            guard let target = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: 8192) else { return nil }
            var failure: NSError?
            let status = converter.convert(to: target, error: &failure) { _, state in
                if let buffer = source { source = nil; state.pointee = .haveData; return buffer }
                state.pointee = samples == nil ? .endOfStream : .noDataNow
                return nil
            }
            if status == .error { return nil }
            result.append(contentsOf: UnsafeBufferPointer(start: target.int16ChannelData![0], count: Int(target.frameLength)))
            if status != .haveData {
                // AVAudioConverter flush includes padded tail samples. Keep only the input duration.
                buffered += result
                let allowed = Int(Double(inputCount) * 16000 / inputRate) - Int(outputCount)
                let count = min(allowed, buffered.count)
                let ready = Array(buffered.prefix(count))
                buffered.removeFirst(count)
                outputCount += Int64(count)
                return ready
            }
        }
    }
}

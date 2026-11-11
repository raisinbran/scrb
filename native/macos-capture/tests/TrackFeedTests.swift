import Foundation
import CoreAudio
import Darwin

func require(_ ok: @autoclosure () -> Bool, _ label: String) {
    if !ok() { fputs("FAIL \(label)\n", stderr); exit(1) }
}
func normalizeOgg(_ data: Data) -> Data {
    var out = Data()
    var at = 0
    while at < data.count {
        require(String(data: data[at..<(at + 4)], encoding: .ascii) == "OggS", "parse durable pages")
        let segments = Int(data[at + 26])
        let size = (0..<segments).reduce(0) { $0 + Int(data[at + 27 + $1]) }
        let end = at + 27 + segments + size
        let body = at + 27 + segments
        // Tags contain the run's host timestamp; serial and CRC also vary between runs.
        if data.subdata(in: body..<min(body + 8, end)) != Data("OpusTags".utf8) {
            var page = data.subdata(in: at..<end)
            for index in [14, 15, 16, 17, 22, 23, 24, 25] { page[index] = 0 }
            out.append(page)
        }
        at = end
    }
    return out
}
func inject(_ track: Track, host: UInt64, value: Float = 0.2) {
    var samples = [Float](repeating: value, count: 2048)
    samples.withUnsafeMutableBytes { raw in
        var list = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(mNumberChannels: 1, mDataByteSize: UInt32(raw.count), mData: raw.baseAddress))
        rt_capture(track.ring, &list, host)
    }
}
@main
struct TrackFeedTests {
    static func main() throws {
        rt_init()
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let session = Session()
        var recorded: [Data] = []
        for enabled in [false, true] {
            let directory = root.appendingPathComponent(enabled ? "live" : "durable")
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let track = Track(name: "microphone")
            track.writer = ChunkWriter(directory: directory.path)
            track.ring.pointee.rate = 48000
            let ring = enabled ? live_ring_create()! : nil
            track.liveRing = ring
            _ = rt_gate_open()
            track.generation = rt_gate_generation()
            let base = mach_absolute_time()
            for index in 0..<144 {
                inject(track, host: base + UInt64(Double(index * 2048) / 48000 * rtTicksPerSecond))
                track.drain(session: session)
            }
            let cutoff = rt_gate_close()
            let begin = Date()
            track.drain(session: session)
            require(Date().timeIntervalSince(begin) < 0.2, "full live ring cannot delay pause")
            inject(track, host: cutoff + UInt64(rtTicksPerSecond))
            track.drain(session: session)
            if let ring {
                var count = 0
                while let entry = live_peek(ring) {
                    require(!entry.pointee.boundary, "filled ring retains only original PCM")
                    count += 1
                    live_advance(ring)
                }
                require(count == 64, "live queue stays bounded")
                live_ring_destroy(ring)
            }
            let files = try FileManager.default.contentsOfDirectory(atPath: directory.path).filter { $0.hasSuffix(".opus") }.sorted()
            require(files.count == 2, "durable five-second rollover")
            recorded.append(try files.reduce(into: Data()) { result, name in
                result.append(normalizeOgg(try Data(contentsOf: directory.appendingPathComponent(name))))
            })
        }
        require(recorded[0] == recorded[1], "live overflow leaves durable encoded audio unchanged")
        print("PASS durable bytes unchanged during full live queue; pause remains bounded")

        let track = Track(name: "microphone")
        let ring = live_ring_create()!
        defer { live_ring_destroy(ring) }
        track.liveRing = ring
        track.ring.pointee.rate = 48000
        let directory = root.appendingPathComponent("boundaries")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        track.writer = ChunkWriter(directory: directory.path)
        _ = rt_gate_open()
        track.generation = rt_gate_generation()
        var previous: UInt32 = 0
        for reason in ["pause", "stop", "permission", "deviceChanged", "sourceChanged", "sleep", "wake", "streamDead", "workerRestarted"] {
            inject(track, host: mach_absolute_time())
            track.drain(session: session)
            guard let pcm = live_peek(ring) else { require(false, "PCM before boundary"); return }
            require(!pcm.pointee.boundary, "accepted PCM")
            let current = pcm.pointee.generation
            require(current >= previous, "generations never decrease")
            live_advance(ring)
            if reason == "permission" { track.block() } else { track.close(reason: reason) }
            guard let boundary = live_peek(ring) else { require(false, "non-rollover boundary"); return }
            require(boundary.pointee.boundary && boundary.pointee.generation == current, "boundary closes old generation")
            live_advance(ring)
            previous = current + 1
            if reason == "permission" {
                inject(track, host: mach_absolute_time(), value: 0)
                track.drain(session: session)
                require(live_peek(ring) == nil, "blocked exact zeros never exported")
                track.unblock()
            }
        }
        _ = rt_gate_close()
        inject(track, host: mach_absolute_time() + 1)
        track.drain(session: session)
        require(live_peek(ring) == nil, "closed gate never exports PCM")
        print("PASS production drain boundaries, permission filter, closed-gate cutoff")
    }
}

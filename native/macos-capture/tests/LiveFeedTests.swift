import Foundation
import Darwin

func require(_ condition: @autoclosure () -> Bool, _ label: String) {
    if !condition() { fputs("FAIL \(label)\n", stderr); exit(1) }
}
func number(_ bytes: Data, _ start: Int, _ count: Int) -> UInt64 {
    (0..<count).reduce(0) { $0 | UInt64(bytes[start + $1]) << ($1 * 8) }
}
func submit(_ ring: OpaquePointer, samples: [Int16], at: Int64, rate: Double, generation: UInt32 = 0, boundary: Bool = false) -> Bool {
    samples.withUnsafeBufferPointer { live_offer(ring, $0.baseAddress, UInt32($0.count), at, rate, generation, boundary) }
}
func consume(_ ring: OpaquePointer, _ encoder: LiveTrackEncoder) -> [Data] {
    var output: [Data] = []
    while let slot = live_peek(ring) {
        guard let frames = encoder.encode(slot) else { require(false, "encode input"); return [] }
        output += frames
        live_advance(ring)
    }
    return output
}
func verifyContinuity(_ frames: [Data], expected: Int, anchor: Int64 = 1000000000) {
    var end = UInt64(anchor)
    var total = 0
    for (sequence, frame) in frames.enumerated() {
        require(frame.prefix(4) == Data("SLP1".utf8), "wire signature")
        require(number(frame, 8, 4) == sequence, "sequence increments")
        require(number(frame, 16, 8) == end, "sample-count continuity")
        let count = Int(number(frame, 28, 4))
        require(count <= 1600, "frame sample bound")
        require(number(frame, 24, 4) == 16000, "wire sample rate")
        end += UInt64(count) * 62500
        total += count
    }
    require(total == expected, "converted duration \(total), expected \(expected)")
    require(frames.last![6] == 1, "boundary follows converter tail")
}
@main
struct LiveFeedTests {
    static func main() {
        if CommandLine.arguments.count > 1 {
            emitFixture()
            return
        }
        for rate in [48000.0, 44100.0, 16000.0] {
            let ring = live_ring_create()!
            let encoder = LiveTrackEncoder(track: 0)
            let count = rate == 16000 ? 2048 : Int(rate * 60)
            var output: [Data] = []
            for start in stride(from: 0, to: count, by: 2048) {
                let size = min(2048, count - start)
                let samples = (start..<(start + size)).map { Int16(9000 * sin(Double($0) * 2 * .pi * 1000 / rate)) }
                require(submit(ring, samples: samples, at: 1000000000 + Int64(Double(start) / rate * 1e9), rate: rate), "enqueue continuous audio")
                output += consume(ring, encoder)
            }
            require(submit(ring, samples: [], at: 0, rate: rate, boundary: true), "enqueue boundary")
            output += consume(ring, encoder)
            verifyContinuity(output, expected: rate == 16000 ? 2048 : 960000)
            if rate == 16000 { require(output.filter { $0[6] == 0 }.count == 2, "split native 2048 samples") }
            live_ring_destroy(ring)
            print("PASS \(rate) duration, timestamps, frame split, boundary")
        }
        testImpulseTiming()
        testOverflow()
        testPipeWrites()
        testPipeFailure()
    }

    static func testImpulseTiming() {
        for rate in [48000.0, 44100.0] {
            let converter = LiveRateConverter(rate: rate)!
            var samples = [Int16](repeating: 0, count: 4096)
            samples[0] = 30000
            var output = samples.withUnsafeBufferPointer { converter.convert($0)! }
            output += converter.convert(nil)!
            let peak = output.indices.max { abs(Int(output[$0])) < abs(Int(output[$1])) }!
            require(peak == 0, "converter compensates impulse delay (peak \(peak))")
        }
        print("PASS converter impulse aligns to input anchor")
    }

    static func testOverflow() {
        let ring = live_ring_create()!
        defer { live_ring_destroy(ring) }
        let encoder = LiveTrackEncoder(track: 0)
        let samples = [Int16](repeating: 100, count: 1600)
        for i in 0..<64 { require(submit(ring, samples: samples, at: Int64(i) * 100000000, rate: 16000), "bounded ring accepts capacity") }
        require(!submit(ring, samples: samples, at: 6400000000, rate: 16000), "full live ring drops input")
        let before = consume(ring, encoder).last!
        require(submit(ring, samples: samples, at: 6500000000, rate: 16000), "resume after live drop")
        let after = consume(ring, encoder).first!
        require(number(after, 8, 4) > number(before, 8, 4) + 1, "drop leaves sequence gap")
        require(number(after, 16, 8) == 6500000000, "drop does not compress timeline")
        require(submit(ring, samples: [], at: 0, rate: 16000, boundary: true), "close generation")
        let boundary = consume(ring, encoder).last!
        require(submit(ring, samples: samples, at: 1, rate: 16000, generation: 1), "new generation")
        let resumed = consume(ring, encoder).first!
        require(number(resumed, 12, 4) == 1, "independent generation")
        require(number(resumed, 16, 8) >= number(boundary, 16, 8), "new anchor never goes backwards")
        print("PASS live overflow, reanchor, generation reset")
    }

    static func testPipeWrites() {
        var descriptors = [Int32](repeating: -1, count: 2)
        require(pipe(&descriptors) == 0, "create fragmented pipe")
        let feed = LiveFeed(fd: descriptors[1])!
        let samples = [Int16](repeating: 234, count: 2048)
        for i in 0..<32 {
            require(submit(feed.rings[0], samples: samples, at: Int64(i) * 128000000, rate: 16000), "queue pipe frames")
        }
        require(submit(feed.rings[0], samples: [], at: 0, rate: 16000, boundary: true), "pipe boundary")
        feed.start()
        _ = fcntl(descriptors[0], F_SETFL, O_NONBLOCK)
        var received = Data()
        var chunk = [UInt8](repeating: 0, count: 113)
        let deadline = Date().addingTimeInterval(5)
        let expected = 65536 * 2 + 42 * 32
        while received.count < expected && Date() < deadline {
            let count = read(descriptors[0], &chunk, chunk.count)
            if count > 0 { received.append(contentsOf: chunk.prefix(count)) }
            Thread.sleep(forTimeInterval: 0.001)
        }
        feed.stop()
        close(descriptors[0])
        require(received.count == expected, "stalled pipe preserves every frame byte")
        var frames: [Data] = []
        var at = 0
        while at < received.count {
            let size = 32 + Int(number(received, at + 28, 4)) * 2
            frames.append(received.subdata(in: at..<(at + size)))
            at += size
        }
        verifyContinuity(frames, expected: 65536, anchor: 0)
        print("PASS slow fragmented pipe preserves complete frames")
    }

    static func testPipeFailure() {
        var descriptors = [Int32](repeating: -1, count: 2)
        require(pipe(&descriptors) == 0, "create pipe")
        let feed = LiveFeed(fd: descriptors[1])!
        require(fcntl(descriptors[1], F_GETFL) & O_NONBLOCK != 0, "nonblocking before first write")
        close(descriptors[0])
        require(submit(feed.rings[0], samples: [Int16](repeating: 100, count: 1600), at: 0, rate: 16000), "broken reader input")
        feed.start()
        let deadline = Date().addingTimeInterval(2)
        while !live_is_stopped(feed.rings[0]) && Date() < deadline { Thread.sleep(forTimeInterval: 0.001) }
        require(live_is_stopped(feed.rings[0]), "EPIPE disables only exporter")
        print("PASS EPIPE survives without SIGPIPE")

        require(pipe(&descriptors) == 0, "create stalled pipe")
        let stalled = LiveFeed(fd: descriptors[1])!
        stalled.start()
        let samples = [Int16](repeating: 123, count: 2048)
        for i in 0..<10000 { _ = submit(stalled.rings[0], samples: samples, at: Int64(i) * 128000000, rate: 16000) }
        let before = Date()
        stalled.stop()
        require(Date().timeIntervalSince(before) < 0.05, "stalled reader cannot delay stop")
        close(descriptors[0])
        print("PASS stalled consumer bounds stop")
    }

    static func emitFixture() {
        let rate = Double(CommandLine.arguments[1])!
        let input = try! Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))
        let ring = live_ring_create()!
        let encoder = LiveTrackEncoder(track: 0)
        var result = Data()
        let count = input.count / 2
        for start in stride(from: 0, to: count, by: 512) {
            let size = min(512, count - start)
            let samples = (start..<(start + size)).map { Int16(bitPattern: UInt16(input[$0 * 2]) | UInt16(input[$0 * 2 + 1]) << 8) }
            require(submit(ring, samples: samples, at: Int64(Double(start) / rate * 1e9), rate: rate), "fixture enqueue")
            for frame in consume(ring, encoder) { result.append(frame) }
        }
        _ = submit(ring, samples: [], at: 0, rate: rate, boundary: true)
        for frame in consume(ring, encoder) { result.append(frame) }
        live_ring_destroy(ring)
        try! result.write(to: URL(fileURLWithPath: CommandLine.arguments[3]))
    }
}

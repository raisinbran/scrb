// Checks RateConverter: length, pitch and continuity of a 1 kHz tone across 60 s of slot-sized
// blocks, flushed at the end, and refusal of a bad rate.
// Build from native/macos-capture: swiftc -parse-as-library src/Resample.swift scripts/resample_check.swift -o <out>
import Foundation

@main
struct Check {
    static func main() {
        var failed = false
        for rate in [22050.0, 32000, 44100, 88200, 96000, 192000] {
            guard let converter = RateConverter(deviceRate: rate) else { print(rate, "no converter"); failed = true; continue }
            let total = Int(rate * 60)
            let input = (0..<total).map { Int16(10000 * sin(2 * .pi * 1000 * Double($0) / rate)) }
            var output: [Int16] = []
            for start in stride(from: 0, to: total, by: 512) {
                let end = min(start + 512, total)
                output += input[start..<end].withUnsafeBufferPointer { converter.convert($0) } ?? []
            }
            output += converter.convert(nil) ?? []
            var crossings = 0
            var largestStep = 0
            for index in 1..<output.count {
                if output[index - 1] < 0 && output[index] >= 0 { crossings += 1 }
                if index > 1000 && index < output.count - 1000 {
                    largestStep = max(largestStep, abs(Int(output[index]) - Int(output[index - 1])))
                }
            }
            let hz = Double(crossings) / (Double(output.count) / 48000)
            // A 1 kHz sine at this level moves at most 1309 per sample at 48 kHz.
            let good = abs(output.count - 2_880_000) <= 48 && abs(hz - 1000) < 0.5 && largestStep < 1400
            print(rate, "frames", output.count, "pitch", hz, "largest step", largestStep, good ? "ok" : "FAILED")
            failed = failed || !good
        }
        if RateConverter(deviceRate: 0) != nil { print("rate 0 accepted"); failed = true }
        exit(failed ? 1 : 0)
    }
}

import AVFoundation

/// Converts mono audio to 48 kHz, for device rates Opus cannot use. Runs on the writer thread and
/// lives across rollovers, so its filter never drops audio between chunks.
final class RateConverter {
    static let outputRate = 48000
    private let converter: AVAudioConverter
    private let input: AVAudioFormat
    private let output: AVAudioFormat

    init?(deviceRate: Double) {
        guard deviceRate > 0,
              let input = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: deviceRate, channels: 1, interleaved: true),
              let output = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: Double(RateConverter.outputRate), channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: input, to: output) else { return nil }
        converter.sampleRateConverterQuality = AVAudioQuality.high.rawValue
        self.input = input
        self.output = output
        self.converter = converter
    }

    /// Passing nil flushes the audio still in the filter. The converter cannot be used after that.
    /// Returns nil if conversion failed.
    func convert(_ samples: UnsafeBufferPointer<Int16>?) -> [Int16]? {
        var source: AVAudioPCMBuffer?
        if let samples {
            guard let buffer = AVAudioPCMBuffer(pcmFormat: input, frameCapacity: AVAudioFrameCount(samples.count)) else { return nil }
            buffer.frameLength = AVAudioFrameCount(samples.count)
            buffer.int16ChannelData![0].update(from: samples.baseAddress!, count: samples.count)
            source = buffer
        }
        let ending = samples == nil
        var result: [Int16] = []
        while true {
            guard let target = AVAudioPCMBuffer(pcmFormat: output, frameCapacity: 8192) else { return nil }
            var failure: NSError?
            let status = converter.convert(to: target, error: &failure) { _, state in
                if let buffer = source {
                    source = nil
                    state.pointee = .haveData
                    return buffer
                }
                state.pointee = ending ? .endOfStream : .noDataNow
                return nil
            }
            if status == .error { return nil }
            result.append(contentsOf: UnsafeBufferPointer(start: target.int16ChannelData![0], count: Int(target.frameLength)))
            if status != .haveData { return result }
        }
    }
}

import AVFoundation
import CoreAudio

/// Mic stream through Apple's voice-processing unit (echo cancellation against the system output).
/// Feeds the same `RtRing` as `MicStream`; the ring rate is set from the format the unit delivers.
/// Ducking of other audio is switched off; if that cannot be done, open fails and the caller uses the raw path.
final class VoiceMicStream {
    private let ring: UnsafeMutablePointer<RtRing>
    private var engine: AVAudioEngine?
    /// Last delivered format, for the spike log and format regression.
    private(set) var deliveredRate = 0.0
    private(set) var deliveredChannels = 0
    private(set) var duckingReport = ""

    init(ring: UnsafeMutablePointer<RtRing>) { self.ring = ring }

    func open(mic: String) -> String? {
        let engine = AVAudioEngine()
        let input = engine.inputNode
        if mic != "default" {
            guard let device = audioDevices().first(where: { deviceUID($0) == mic }),
                  let unit = input.audioUnit else { return "no such mic" }
            var id = device
            AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &id,
                                 UInt32(MemoryLayout<AudioObjectID>.size))
        }
        do { try input.setVoiceProcessingEnabled(true) } catch { return "voice processing: \(error)" }
        guard #available(macOS 14.0, *) else { return "ducking control needs macOS 14" }
        input.voiceProcessingOtherAudioDuckingConfiguration =
            AVAudioVoiceProcessingOtherAudioDuckingConfiguration(enableAdvancedDucking: false, duckingLevel: .min)
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return "no voice format" }
        deliveredRate = format.sampleRate
        deliveredChannels = Int(format.channelCount)
        ring.pointee.rate = format.sampleRate
        let ring = self.ring
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, time in
            // rt_capture reads the first buffer as interleaved Float32, which is channel 0 for planar mono/stereo.
            if buffer.format.sampleRate != ring.pointee.rate { ring.pointee.rate = buffer.format.sampleRate }
            self?.deliveredRate = buffer.format.sampleRate
            let host = time.isHostTimeValid ? time.hostTime : mach_absolute_time()
            var list = buffer.audioBufferList.pointee
            if buffer.format.isInterleaved == false, list.mNumberBuffers > 0 {
                list.mNumberBuffers = 1
                list.mBuffers.mNumberChannels = 1
            }
            rt_capture(ring, &list, host)
        }
        engine.prepare()
        do { try engine.start() } catch { return "start: \(error)" }
        self.engine = engine
        // The AVAudioEngine property can be dropped when the unit initialises at start, so set it again on the
        // unit itself (property 2108) and read it back for the log. Level .min is the lowest macOS offers.
        if let unit = input.audioUnit {
            var config = AUVoiceIOOtherAudioDuckingConfiguration(mEnableAdvancedDucking: false, mDuckingLevel: .min)
            let set = AudioUnitSetProperty(unit, kAUVoiceIOProperty_OtherAudioDuckingConfiguration, kAudioUnitScope_Global, 0,
                                           &config, UInt32(MemoryLayout.size(ofValue: config)))
            var back = AUVoiceIOOtherAudioDuckingConfiguration(mEnableAdvancedDucking: true, mDuckingLevel: .max)
            var size = UInt32(MemoryLayout.size(ofValue: back))
            let got = AudioUnitGetProperty(unit, kAUVoiceIOProperty_OtherAudioDuckingConfiguration, kAudioUnitScope_Global, 0, &back, &size)
            duckingReport = "set \(set) get \(got) advanced \(back.mEnableAdvancedDucking) level \(back.mDuckingLevel.rawValue)"
        }
        return nil
    }

    func close() {
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
    }
}

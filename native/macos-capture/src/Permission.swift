import AudioToolbox
import CoreAudio
import Foundation

/// macOS gives no reliable signal for a denied tap: it delivers on-time silence, like an app with
/// nothing to say (check S6). So this plays a tone too quiet to hear from this process, taps this
/// process, and sees whether the tone comes back. Only a tone that arrives proves permission.
func checkSystemAudioPermission() -> String {
    let own = processObject(getpid())
    var outputProc: AudioDeviceIOProcID?
    let output: AudioObjectID = readProperty(systemObject, kAudioHardwarePropertyDefaultOutputDevice, AudioObjectID(0))
    guard output != kAudioObjectUnknown else { return "unknown" }

    // Registering output first gives this process an audio object for the tap to name.
    var phase: Float = 0
    let status = AudioDeviceCreateIOProcIDWithBlock(&outputProc, output, nil) { _, _, _, buffers, _ in
        for buffer in UnsafeMutableAudioBufferListPointer(buffers) {
            guard let data = buffer.mData else { continue }
            let samples = data.bindMemory(to: Float.self, capacity: Int(buffer.mDataByteSize) / 4)
            for i in 0..<(Int(buffer.mDataByteSize) / 4) {
                phase += 0.06
                samples[i] = 0.0002 * sin(phase)
            }
        }
    }
    guard status == noErr, AudioDeviceStart(output, outputProc) == noErr else { return "unknown" }
    defer {
        AudioDeviceStop(output, outputProc)
        AudioDeviceDestroyIOProcID(output, outputProc!)
    }

    Thread.sleep(forTimeInterval: 0.2)
    let object = own != kAudioObjectUnknown ? own : processObject(getpid())
    guard object != kAudioObjectUnknown else { return "unknown" }
    let description = CATapDescription(stereoMixdownOfProcesses: [object])
    description.uuid = UUID()
    description.isPrivate = true
    description.muteBehavior = .unmuted
    var tap = AudioObjectID(kAudioObjectUnknown)
    guard AudioHardwareCreateProcessTap(description, &tap) == noErr else { return "unknown" }
    defer { AudioHardwareDestroyProcessTap(tap) }
    let clock = deviceUID(tapClockDevice())
    let spec: [String: Any] = [
        kAudioAggregateDeviceNameKey: "MeetingScribePermissionCheck",
        kAudioAggregateDeviceUIDKey: UUID().uuidString,
        kAudioAggregateDeviceMainSubDeviceKey: clock,
        kAudioAggregateDeviceIsPrivateKey: true,
        kAudioAggregateDeviceTapAutoStartKey: true,
        kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: clock]],
        kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true,
                                           kAudioSubTapUIDKey: description.uuid.uuidString]],
    ]
    var aggregate = AudioObjectID(kAudioObjectUnknown)
    guard AudioHardwareCreateAggregateDevice(spec as CFDictionary, &aggregate) == noErr else { return "unknown" }
    defer { AudioHardwareDestroyAggregateDevice(aggregate) }

    let lock = NSLock()
    var packets = 0
    var heard = false
    var proc: AudioDeviceIOProcID?
    guard AudioDeviceCreateIOProcIDWithBlock(&proc, aggregate, nil, { _, input, _, _, _ in
        var loud = false
        for buffer in UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input)) {
            guard let data = buffer.mData else { continue }
            let samples = data.bindMemory(to: Float.self, capacity: Int(buffer.mDataByteSize) / 4)
            for i in 0..<(Int(buffer.mDataByteSize) / 4) where samples[i] != 0 { loud = true }
        }
        lock.lock(); packets += 1; heard = heard || loud; lock.unlock()
    }) == noErr, AudioDeviceStart(aggregate, proc) == noErr else { return "unknown" }
    defer {
        AudioDeviceStop(aggregate, proc)
        AudioDeviceDestroyIOProcID(aggregate, proc!)
    }

    Thread.sleep(forTimeInterval: 0.6)
    lock.lock()
    defer { lock.unlock() }
    if heard { return "granted" }
    return packets > 0 ? "denied" : "unknown"
}

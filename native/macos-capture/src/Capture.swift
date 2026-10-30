import AudioToolbox
import CoreAudio
import Foundation

func address(_ selector: AudioObjectPropertySelector,
             _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func readProperty<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ initial: T,
                     scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> T {
    var value = initial
    var size = UInt32(MemoryLayout<T>.size)
    var location = address(selector, scope)
    _ = withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(object, &location, 0, nil, &size, $0) }
    return value
}

let systemObject = AudioObjectID(kAudioObjectSystemObject)

func audioDevices() -> [AudioObjectID] {
    var size: UInt32 = 0
    var location = address(kAudioHardwarePropertyDevices)
    AudioObjectGetPropertyDataSize(systemObject, &location, 0, nil, &size)
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(systemObject, &location, 0, nil, &size, &ids)
    return ids
}

func deviceUID(_ device: AudioObjectID) -> String {
    readProperty(device, kAudioDevicePropertyDeviceUID, "" as CFString) as String
}

/// Clocks the tap from the built-in output when there is one, so a headset in hands-free mode
/// cannot halve the meeting track (check S1).
func tapClockDevice() -> AudioObjectID {
    let builtIn = audioDevices().first {
        readProperty($0, kAudioDevicePropertyTransportType, UInt32(0)) == kAudioDeviceTransportTypeBuiltIn
            && deviceUID($0).contains("Speaker")
    }
    return builtIn ?? readProperty(systemObject, kAudioHardwarePropertyDefaultOutputDevice, AudioObjectID(0))
}

func processObject(_ pid: pid_t) -> AudioObjectID {
    var input = pid
    var output = AudioObjectID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var location = address(kAudioHardwarePropertyTranslatePIDToProcessObject)
    AudioObjectGetPropertyData(systemObject, &location, UInt32(MemoryLayout<pid_t>.size), &input, &size, &output)
    return output
}

/// The meeting track: a process tap read through a private aggregate device.
final class MeetingStream {
    private var tap = AudioObjectID(kAudioObjectUnknown)
    private var aggregate = AudioObjectID(kAudioObjectUnknown)
    private var proc: AudioDeviceIOProcID?
    private let ring: UnsafeMutablePointer<RtRing>

    init(ring: UnsafeMutablePointer<RtRing>) { self.ring = ring }

    func open(source: [Int32]) -> String? {
        let objects = source.map(processObject).filter { $0 != kAudioObjectUnknown }
        let description = source.isEmpty
            ? CATapDescription(stereoGlobalTapButExcludeProcesses: [])
            : CATapDescription(stereoMixdownOfProcesses: objects)
        if !source.isEmpty && objects.isEmpty { return "no audio process for the meeting app" }
        description.uuid = UUID()
        description.isPrivate = true
        description.muteBehavior = .unmuted
        var status = AudioHardwareCreateProcessTap(description, &tap)
        guard status == noErr else { return "create tap: \(status)" }
        let clock = deviceUID(tapClockDevice())
        let spec: [String: Any] = [
            kAudioAggregateDeviceNameKey: "MeetingScribeCapture",
            kAudioAggregateDeviceUIDKey: UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: clock,
            kAudioAggregateDeviceIsPrivateKey: true,
            kAudioAggregateDeviceTapAutoStartKey: true,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: clock]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true,
                                               kAudioSubTapUIDKey: description.uuid.uuidString]],
        ]
        status = AudioHardwareCreateAggregateDevice(spec as CFDictionary, &aggregate)
        guard status == noErr else { close(); return "create aggregate: \(status)" }
        ring.pointee.rate = readProperty(aggregate, kAudioDevicePropertyNominalSampleRate, 0.0)
        let ring = self.ring
        status = AudioDeviceCreateIOProcIDWithBlock(&proc, aggregate, nil) { _, input, time, _, _ in
            rt_capture(ring, input, time.pointee.mHostTime)
        }
        guard status == noErr else { close(); return "create io proc: \(status)" }
        status = AudioDeviceStart(aggregate, proc)
        guard status == noErr else { close(); return "start: \(status)" }
        return nil
    }

    func close() {
        if let proc {
            AudioDeviceStop(aggregate, proc)
            AudioDeviceDestroyIOProcID(aggregate, proc)
        }
        proc = nil
        if aggregate != kAudioObjectUnknown { AudioHardwareDestroyAggregateDevice(aggregate) }
        if tap != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tap) }
        aggregate = AudioObjectID(kAudioObjectUnknown)
        tap = AudioObjectID(kAudioObjectUnknown)
    }
}

/// The mic track, on the device's own real-time thread.
final class MicStream {
    private var device = AudioObjectID(kAudioObjectUnknown)
    private var proc: AudioDeviceIOProcID?
    private let ring: UnsafeMutablePointer<RtRing>

    init(ring: UnsafeMutablePointer<RtRing>) { self.ring = ring }

    func open(mic: String) -> String? {
        device = mic == "default"
            ? readProperty(systemObject, kAudioHardwarePropertyDefaultInputDevice, AudioObjectID(0))
            : audioDevices().first { deviceUID($0) == mic } ?? AudioObjectID(kAudioObjectUnknown)
        guard device != kAudioObjectUnknown else { return "no such mic" }
        ring.pointee.rate = readProperty(device, kAudioDevicePropertyNominalSampleRate, 0.0)
        let ring = self.ring
        var status = AudioDeviceCreateIOProcIDWithBlock(&proc, device, nil) { _, input, time, _, _ in
            rt_capture(ring, input, time.pointee.mHostTime)
        }
        guard status == noErr else { return "create io proc: \(status)" }
        status = AudioDeviceStart(device, proc)
        guard status == noErr else { close(); return "start: \(status)" }
        return nil
    }

    func close() {
        if let proc {
            AudioDeviceStop(device, proc)
            AudioDeviceDestroyIOProcID(device, proc)
        }
        proc = nil
    }
}

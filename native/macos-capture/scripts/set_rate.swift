// Sets a device's sample rate by name, or lists its rates, for the unsupported-rate runs.
// Build: swiftc set_rate.swift -o set_rate. Usage: set_rate "<device name>" [rate]
import CoreAudio
import Foundation

func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}

let system = AudioObjectID(kAudioObjectSystemObject)
var devices = address(kAudioHardwarePropertyDevices)
var size: UInt32 = 0
AudioObjectGetPropertyDataSize(system, &devices, 0, nil, &size)
var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
AudioObjectGetPropertyData(system, &devices, 0, nil, &size, &ids)

for id in ids {
    var nameAddress = address(kAudioObjectPropertyName)
    var name: Unmanaged<CFString>?
    var nameSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &nameAddress, 0, nil, &nameSize, &name) == noErr,
          name?.takeRetainedValue() as String? == CommandLine.arguments[1] else { continue }
    var rateAddress = address(kAudioDevicePropertyNominalSampleRate)
    if CommandLine.arguments.count > 2 {
        var rate = Double(CommandLine.arguments[2])!
        let status = AudioObjectSetPropertyData(id, &rateAddress, 0, nil, 8, &rate)
        sleep(1)
        guard status == noErr else { exit(1) }
    }
    var rate = 0.0
    var rateSize: UInt32 = 8
    AudioObjectGetPropertyData(id, &rateAddress, 0, nil, &rateSize, &rate)
    var listAddress = address(kAudioDevicePropertyAvailableNominalSampleRates)
    AudioObjectGetPropertyDataSize(id, &listAddress, 0, nil, &size)
    var ranges = [AudioValueRange](repeating: AudioValueRange(), count: Int(size) / MemoryLayout<AudioValueRange>.size)
    AudioObjectGetPropertyData(id, &listAddress, 0, nil, &size, &ranges)
    print(CommandLine.arguments[1], "now", rate, "available", ranges.map(\.mMinimum))
    exit(0)
}
exit(2)

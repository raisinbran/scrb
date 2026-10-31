// Sets the default input device by name, for unattended device changes in long_run_app.mjs.
// Build: swiftc set_input.swift -o set_input. Usage: set_input "<device name>"
import CoreAudio
import Foundation

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

let system = AudioObjectID(kAudioObjectSystemObject)
var devices = address(kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal)
var size: UInt32 = 0
AudioObjectGetPropertyDataSize(system, &devices, 0, nil, &size)
var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
AudioObjectGetPropertyData(system, &devices, 0, nil, &size, &ids)

for var id in ids {
    var nameAddress = address(kAudioObjectPropertyName, kAudioObjectPropertyScopeGlobal)
    var name: Unmanaged<CFString>?
    var nameSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &nameAddress, 0, nil, &nameSize, &name) == noErr,
          name?.takeRetainedValue() as String? == CommandLine.arguments[1] else { continue }
    var input = address(kAudioHardwarePropertyDefaultInputDevice, kAudioObjectPropertyScopeGlobal)
    let status = AudioObjectSetPropertyData(system, &input, 0, nil, UInt32(MemoryLayout<AudioDeviceID>.size), &id)
    exit(status == noErr ? 0 : 1)
}
exit(2)

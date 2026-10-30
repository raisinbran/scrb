// Phase 0 helper: list audio devices or set the default output or input device
// by name, so device-change cases happen at an exact time.
// Usage: SetDefaultDevice list | SetDefaultDevice output|input "<device name>"
import CoreAudio
import Foundation

func deviceIDs() -> [AudioObjectID] {
    var address = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices,
                                             mScope: kAudioObjectPropertyScopeGlobal,
                                             mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size)
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &size, &ids)
    return ids
}

func name(_ id: AudioObjectID) -> String {
    var address = AudioObjectPropertyAddress(mSelector: kAudioObjectPropertyName,
                                             mScope: kAudioObjectPropertyScopeGlobal,
                                             mElement: kAudioObjectPropertyElementMain)
    var value: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value)
    return value?.takeRetainedValue() as String? ?? "?"
}

func hasStreams(_ id: AudioObjectID, _ scope: AudioObjectPropertyScope) -> Bool {
    var address = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: scope,
                                             mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size)
    return size > 0
}

let args = CommandLine.arguments
if args.count == 2 && args[1] == "list" {
    for id in deviceIDs() {
        let roles = [hasStreams(id, kAudioObjectPropertyScopeOutput) ? "output" : nil,
                     hasStreams(id, kAudioObjectPropertyScopeInput) ? "input" : nil].compactMap { $0 }
        print("\(name(id))\t\(roles.joined(separator: ","))")
    }
    exit(0)
}
guard args.count == 3, args[1] == "output" || args[1] == "input" else {
    fputs("usage: SetDefaultDevice list | output|input \"<device name>\"\n", stderr)
    exit(2)
}
let isOutput = args[1] == "output"
let scope = isOutput ? kAudioObjectPropertyScopeOutput : kAudioObjectPropertyScopeInput
guard var target = deviceIDs().first(where: { name($0) == args[2] && hasStreams($0, scope) }) else {
    fputs("no \(args[1]) device named \(args[2])\n", stderr)
    exit(1)
}
var address = AudioObjectPropertyAddress(
    mSelector: isOutput ? kAudioHardwarePropertyDefaultOutputDevice : kAudioHardwarePropertyDefaultInputDevice,
    mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
let status = AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil,
                                        UInt32(MemoryLayout<AudioObjectID>.size), &target)
if status != noErr { fputs("set failed: \(status)\n", stderr); exit(1) }
print("default \(args[1]) is now \(args[2])")

// Mac adapter check S1 from docs/plans/macos-capture-adapter.md. With the default output in
// hands-free mode, compares a tap aggregate clocked by that device with one clocked by the
// built-in output. Usage: HandsFreeClock <file> <default|builtin> <seconds>
import AudioToolbox
import CoreAudio
import Foundation

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}
func read<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ initial: T, scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> T {
    var value = initial
    var size = UInt32(MemoryLayout<T>.size)
    var where_ = address(selector, scope)
    _ = withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(object, &where_, 0, nil, &size, $0) }
    return value
}
func allDevices() -> [AudioObjectID] {
    var size: UInt32 = 0
    var where_ = address(kAudioHardwarePropertyDevices)
    let system = AudioObjectID(kAudioObjectSystemObject)
    AudioObjectGetPropertyDataSize(system, &where_, 0, nil, &size)
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(system, &where_, 0, nil, &size, &ids)
    return ids
}
func uid(_ device: AudioObjectID) -> String { read(device, kAudioDevicePropertyDeviceUID, "" as CFString) as String }
func rate(_ device: AudioObjectID) -> Double { read(device, kAudioDevicePropertyNominalSampleRate, 0.0) }

let system = AudioObjectID(kAudioObjectSystemObject)
let file = CommandLine.arguments[1]
let useBuiltIn = CommandLine.arguments[2] == "builtin"
let seconds = Int(CommandLine.arguments[3]) ?? 10
let output: AudioObjectID = read(system, kAudioHardwarePropertyDefaultSystemOutputDevice, 0)
let input: AudioObjectID = read(system, kAudioHardwarePropertyDefaultInputDevice, 0)
let builtIn = allDevices().first {
    read($0, kAudioDevicePropertyTransportType, UInt32(0)) == kAudioDeviceTransportTypeBuiltIn
        && uid($0).contains("Speaker")
}!
print("output \(uid(output)) \(rate(output)) Hz, input \(uid(input)) \(rate(input)) Hz, built-in \(uid(builtIn))")

// Opening the headset mic is what forces hands-free mode.
var micProc: AudioDeviceIOProcID?
AudioDeviceCreateIOProcIDWithBlock(&micProc, input, nil) { _, _, _, _, _ in }
AudioDeviceStart(input, micProc)
Thread.sleep(forTimeInterval: 3)
print("after opening the mic: output \(rate(output)) Hz, input \(rate(input)) Hz")

let player = Process()
player.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
player.arguments = ["-v", "0.05", file]
try! player.run()
var object = AudioObjectID(kAudioObjectUnknown)
for _ in 0..<50 where object == kAudioObjectUnknown {
    var pid = player.processIdentifier
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var where_ = address(kAudioHardwarePropertyTranslatePIDToProcessObject)
    AudioObjectGetPropertyData(system, &where_, UInt32(MemoryLayout<pid_t>.size), &pid, &size, &object)
    Thread.sleep(forTimeInterval: 0.1)
}
let description = CATapDescription(stereoMixdownOfProcesses: [object])
description.uuid = UUID()
description.isPrivate = true
description.muteBehavior = .unmuted
var tap = AudioObjectID(kAudioObjectUnknown)
print("create tap \(AudioHardwareCreateProcessTap(description, &tap))")
let clock = useBuiltIn ? uid(builtIn) : uid(output)
let spec: [String: Any] = [
    kAudioAggregateDeviceNameKey: "MeetingScribeHandsFree",
    kAudioAggregateDeviceUIDKey: UUID().uuidString,
    kAudioAggregateDeviceMainSubDeviceKey: clock,
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceTapAutoStartKey: true,
    kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: clock]],
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true,
                                       kAudioSubTapUIDKey: description.uuid.uuidString]],
]
var aggregate = AudioObjectID(kAudioObjectUnknown)
print("create aggregate \(AudioHardwareCreateAggregateDevice(spec as CFDictionary, &aggregate))")
let format: AudioStreamBasicDescription = read(tap, kAudioTapPropertyFormat, AudioStreamBasicDescription())
print("clock \(clock), tap reports \(format.mSampleRate) Hz, aggregate \(rate(aggregate)) Hz")

let lock = NSLock()
var frames = 0
var peak: Float = 0
var proc: AudioDeviceIOProcID?
AudioDeviceCreateIOProcIDWithBlock(&proc, aggregate, nil) { _, buffers, _, _, _ in
    var loudest: Float = 0
    var count = 0
    for buffer in UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffers)) {
        guard let data = buffer.mData else { continue }
        let samples = data.bindMemory(to: Float.self, capacity: Int(buffer.mDataByteSize) / 4)
        count = Int(buffer.mDataByteSize) / 4 / Int(max(1, buffer.mNumberChannels))
        for i in 0..<(Int(buffer.mDataByteSize) / 4) { loudest = max(loudest, abs(samples[i])) }
    }
    lock.lock(); frames += count; peak = max(peak, loudest); lock.unlock()
}
AudioDeviceStart(aggregate, proc)
for t in 1...seconds {
    Thread.sleep(forTimeInterval: 1)
    lock.lock()
    print("\(t) frames/s \(frames) peak \(String(format: "%.3f", peak))")
    frames = 0; peak = 0
    lock.unlock()
}
AudioDeviceStop(aggregate, proc)
AudioDeviceStop(input, micProc)
AudioHardwareDestroyAggregateDevice(aggregate)
AudioHardwareDestroyProcessTap(tap)
player.terminate()

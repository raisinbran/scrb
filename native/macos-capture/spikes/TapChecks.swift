// Mac adapter checks S2, S3, S5 and S6 from docs/plans/macos-capture-adapter.md.
// Prints one line per second: packets and peak on the tap, and whether each target is outputting.
import AudioToolbox
import CoreAudio
import Foundation

func fail(_ status: OSStatus, _ what: String) {
    if status != noErr { print("\(what) failed: \(status)"); exit(1) }
}

func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
                               mElement: kAudioObjectPropertyElementMain)
}

func processObject(_ pid: pid_t) -> AudioObjectID {
    var input = pid
    var output = AudioObjectID(kAudioObjectUnknown)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    var where_ = address(kAudioHardwarePropertyTranslatePIDToProcessObject)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &where_,
                               UInt32(MemoryLayout<pid_t>.size), &input, &size, &output)
    return output
}

func isRunningOutput(_ object: AudioObjectID) -> Int {
    var value: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    var where_ = address(kAudioProcessPropertyIsRunningOutput)
    let status = AudioObjectGetPropertyData(object, &where_, 0, nil, &size, &value)
    return status == noErr ? Int(value) : -1
}

func play(_ file: String) -> Process {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
    process.arguments = [file]
    try! process.run()
    return process
}

func waitForObject(_ pid: pid_t) -> AudioObjectID {
    for _ in 0..<50 {
        let object = processObject(pid)
        if object != kAudioObjectUnknown { return object }
        Thread.sleep(forTimeInterval: 0.1)
    }
    print("no process object for \(pid)"); exit(1)
}

let file = CommandLine.arguments[1]
let first = play(file)
let firstObject = waitForObject(first.processIdentifier)

let description = CATapDescription(stereoMixdownOfProcesses: [firstObject])
description.uuid = UUID()
description.isPrivate = true
description.muteBehavior = .unmuted
var tapID = AudioObjectID(kAudioObjectUnknown)
fail(AudioHardwareCreateProcessTap(description, &tapID), "create tap")

var output = AudioObjectID(kAudioObjectUnknown)
var size = UInt32(MemoryLayout<AudioObjectID>.size)
var where_ = address(kAudioHardwarePropertyDefaultSystemOutputDevice)
AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &where_, 0, nil, &size, &output)
var uid: CFString = "" as CFString
size = UInt32(MemoryLayout<CFString>.size)
where_ = address(kAudioDevicePropertyDeviceUID)
withUnsafeMutablePointer(to: &uid) { _ = AudioObjectGetPropertyData(output, &where_, 0, nil, &size, $0) }

let spec: [String: Any] = [
    kAudioAggregateDeviceNameKey: "MeetingScribeTapChecks",
    kAudioAggregateDeviceUIDKey: UUID().uuidString,
    kAudioAggregateDeviceMainSubDeviceKey: uid as String,
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceTapAutoStartKey: true,
    kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: uid as String]],
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true,
                                       kAudioSubTapUIDKey: description.uuid.uuidString]],
]
var aggregate = AudioObjectID(kAudioObjectUnknown)
fail(AudioHardwareCreateAggregateDevice(spec as CFDictionary, &aggregate), "create aggregate")

let lock = NSLock()
var packets = 0
var peak: Float = 0
var proc: AudioDeviceIOProcID?
fail(AudioDeviceCreateIOProcIDWithBlock(&proc, aggregate, nil) { _, input, _, _, _ in
    var loudest: Float = 0
    for buffer in UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input)) {
        guard let data = buffer.mData else { continue }
        let samples = data.bindMemory(to: Float.self, capacity: Int(buffer.mDataByteSize) / 4)
        for i in 0..<(Int(buffer.mDataByteSize) / 4) { loudest = max(loudest, abs(samples[i])) }
    }
    lock.lock(); packets += 1; peak = max(peak, loudest); lock.unlock()
}, "io proc")

// S5: every signal the HAL offers for its own restart.
for (name, selector) in [("serviceRestarted", AudioObjectPropertySelector(0x73727374)),
                         ("devicesChanged", kAudioHardwarePropertyDevices)] {
    var listen = address(selector)
    AudioObjectAddPropertyListenerBlock(AudioObjectID(kAudioObjectSystemObject), &listen, nil) { _, _ in
        print("EVENT \(name)")
    }
}

fail(AudioDeviceStart(aggregate, proc), "start")

var second: Process?
var secondObject = AudioObjectID(kAudioObjectUnknown)
let seconds = Int(CommandLine.arguments[2]) ?? 35
print("t phase packets peak firstRunning secondRunning")
for t in 1...seconds {
    var phase = "playing"
    switch t {
    case 6...15: phase = "S2 target stopped"
    case 16...20: phase = "playing again"
    case 21...25: phase = "S3 new process, not in tap"
    case 26...: phase = "S3 new process, tap list updated"
    default: break
    }
    if t == 6 || t == 21 { kill(first.processIdentifier, SIGSTOP) }
    if t == 16 { kill(first.processIdentifier, SIGCONT) }
    if t == 21 {
        second = play(file)
        secondObject = waitForObject(second!.processIdentifier)
    }
    if t == 26 {
        let updated = CATapDescription(stereoMixdownOfProcesses: [firstObject, secondObject])
        updated.uuid = description.uuid
        updated.isPrivate = true
        updated.muteBehavior = .unmuted
        var pointer = updated as CFTypeRef
        var listen = address(kAudioTapPropertyDescription)
        let status = AudioObjectSetPropertyData(tapID, &listen, 0, nil,
                                                UInt32(MemoryLayout<CFTypeRef>.size), &pointer)
        print("EVENT tap list update status \(status)")
    }
    Thread.sleep(forTimeInterval: 1)
    lock.lock()
    let line = "\(t) \(phase) | \(packets) \(String(format: "%.3f", peak))"
    packets = 0; peak = 0
    lock.unlock()
    print("\(line) | \(isRunningOutput(firstObject)) \(secondObject == kAudioObjectUnknown ? -1 : isRunningOutput(secondObject))")
}
AudioDeviceStop(aggregate, proc)
AudioHardwareDestroyAggregateDevice(aggregate)
AudioHardwareDestroyProcessTap(tapID)
first.terminate(); second?.terminate()

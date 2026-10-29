// Phase 0 throwaway probe (macOS 14.2+, Apple Silicon): capture one process tree
// through a Core Audio process tap and the default input device, writing two WAV
// files, a per-IO-cycle timing log against mach host time, and a summary JSON in
// the same shape as probes/windows-dual-capture so the shared analysis scripts
// (analyze_alignment.py) work unchanged.
//
// UNTESTED: written on Windows for the pending Apple Silicon run.
//
// Usage: DualCapture <pid> <out-prefix> <seconds> [mic|nomic]
// Build: swiftc -O DualCapture.swift -o DualCapture   (see README.md)

import AudioToolbox
import CoreAudio
import Darwin
import Foundation
import IOKit.pwr_mgt

// MARK: - Helpers

var timebase = mach_timebase_info_data_t()
mach_timebase_info(&timebase)
func hostSeconds(_ t: UInt64) -> Double {
    Double(t) * Double(timebase.numer) / Double(timebase.denom) / 1e9
}

func check(_ status: OSStatus, _ what: String) {
    if status != noErr {
        FileHandle.standardError.write("\(what) failed: \(status)\n".data(using: .utf8)!)
        exit(1)
    }
}

func getProperty<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector,
                    scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
                    qualifier: UnsafeRawPointer? = nil, qualifierSize: UInt32 = 0,
                    _ initial: T) -> T {
    var address = AudioObjectPropertyAddress(mSelector: selector, mScope: scope,
                                             mElement: kAudioObjectPropertyElementMain)
    var value = initial
    var size = UInt32(MemoryLayout<T>.size)
    check(AudioObjectGetPropertyData(object, &address, qualifierSize, qualifier, &size, &value),
          "get property \(selector)")
    return value
}

func processTree(root: pid_t) -> [pid_t] {
    var result = [root]
    var queue = [root]
    while let pid = queue.popLast() {
        var children = [pid_t](repeating: 0, count: 1024)
        let bytes = proc_listchildpids(pid, &children, Int32(children.count * MemoryLayout<pid_t>.size))
        let count = Int(bytes) / MemoryLayout<pid_t>.size
        for child in children.prefix(max(0, count)) where child > 0 {
            result.append(child)
            queue.append(child)
        }
    }
    return result
}

func audioProcessObjects(for pids: [pid_t]) -> [AudioObjectID] {
    // Only processes that have touched Core Audio have process objects.
    var objects: [AudioObjectID] = []
    for var pid in pids {
        let object: AudioObjectID = getProperty(
            AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyTranslatePIDToProcessObject,
            qualifier: &pid, qualifierSize: UInt32(MemoryLayout<pid_t>.size), AudioObjectID(kAudioObjectUnknown))
        if object != kAudioObjectUnknown { objects.append(object) }
    }
    return objects
}

final class WavWriter {
    private let handle: FileHandle
    private(set) var dataBytes: UInt32 = 0
    let rate: UInt32

    init(path: String, rate: UInt32) {
        FileManager.default.createFile(atPath: path, contents: Data(count: 44))
        handle = FileHandle(forWritingAtPath: path)!
        handle.seekToEndOfFile()
        self.rate = rate
    }

    func write(_ samples: [Int16]) {
        samples.withUnsafeBytes { handle.write(Data($0)) }
        dataBytes += UInt32(samples.count * 2)
    }

    func close() {
        var header = Data()
        func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { header.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { header.append(contentsOf: $0) } }
        header.append("RIFF".data(using: .ascii)!); u32(36 + dataBytes)
        header.append("WAVEfmt ".data(using: .ascii)!); u32(16); u16(1); u16(1)
        u32(rate); u32(rate * 2); u16(2); u16(16)
        header.append("data".data(using: .ascii)!); u32(dataBytes)
        handle.seek(toFileOffset: 0)
        handle.write(header)
        handle.closeFile()
    }
}

// MARK: - Track state (mirrors the Windows probe's TrackStats)

final class Track {
    let name: String
    let writer: WavWriter
    let rate: Double
    let lock = NSLock()
    var frames: UInt64 = 0
    var packets: UInt64 = 0
    var discontinuities: UInt64 = 0
    var gapFillFrames: UInt64 = 0
    var firstHost: Double = 0
    var lastHost: Double = 0
    var firstArrival: Double = 0
    var lastArrival: Double = 0
    var lastPacketFrames: UInt64 = 0
    var nextSampleTime: Double = -1
    var maxInterArrivalMs: Double = 0
    var lastLog: Double = 0

    init(name: String, path: String, rate: Double) {
        self.name = name
        self.rate = rate
        writer = WavWriter(path: path, rate: UInt32(rate.rounded()))
    }
}

var timingLines: [String] = []
let timingLock = NSLock()

func handleInput(_ track: Track, _ buffers: UnsafePointer<AudioBufferList>,
                 _ time: UnsafePointer<AudioTimeStamp>, channels: Int) {
    let arrival = hostSeconds(mach_absolute_time())
    let list = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buffers))
    guard let first = list.first, let raw = first.mData else { return }
    // Interleaved float32 is the tap and HAL default; downmix to mono int16.
    let interleaved = list.count == 1
    let frameCount = Int(first.mDataByteSize) / MemoryLayout<Float>.size / (interleaved ? channels : 1)
    var mono = [Int16](repeating: 0, count: frameCount)
    for i in 0..<frameCount {
        var sum: Float = 0
        if interleaved {
            let p = raw.assumingMemoryBound(to: Float.self)
            for c in 0..<channels { sum += p[i * channels + c] }
            sum /= Float(channels)
        } else {
            for b in list { sum += b.mData!.assumingMemoryBound(to: Float.self)[i] }
            sum /= Float(list.count)
        }
        mono[i] = Int16(max(-1, min(1, sum)) * 32767)
    }

    track.lock.lock(); defer { track.lock.unlock() }
    let host = hostSeconds(time.pointee.mHostTime)
    let sampleTime = time.pointee.mSampleTime
    if track.packets == 0 {
        track.firstHost = host
        track.firstArrival = arrival
    } else {
        track.maxInterArrivalMs = max(track.maxInterArrivalMs, (arrival - track.lastArrival) * 1000)
        // A jump in the device sample clock is a gap; fill it so the track stays on time.
        let gap = sampleTime - track.nextSampleTime
        if abs(gap) >= 1 {
            track.discontinuities += 1
            if gap > 0 {
                let fill = UInt64(gap)
                track.writer.write([Int16](repeating: 0, count: Int(fill)))
                track.frames += fill
                track.gapFillFrames += fill
            }
        }
    }
    track.nextSampleTime = sampleTime + Double(frameCount)
    let behindMs = ((host - track.firstHost) * track.rate - Double(track.frames)) * 1000 / track.rate
    let framesBefore = track.frames
    track.writer.write(mono)
    track.frames += UInt64(frameCount)
    track.packets += 1
    track.lastHost = host
    track.lastArrival = arrival
    track.lastPacketFrames = UInt64(frameCount)
    if host - track.lastLog >= 1 {
        track.lastLog = host
        timingLock.lock()
        timingLines.append(String(format: "%@,%.6f,%.6f,%llu,%.0f,%.3f,%llu,%.0f", track.name, host, arrival,
                                  framesBefore, sampleTime, behindMs, track.discontinuities, track.rate))
        timingLock.unlock()
    }
}

// MARK: - Main

let args = CommandLine.arguments
guard args.count >= 4, let pid = pid_t(args[1]), let seconds = Int(args[3]) else {
    print("usage: DualCapture <pid> <out-prefix> <seconds> [mic|nomic]")
    exit(2)
}
let prefix = args[2]
let useMic = args.count < 5 || args[4] != "nomic"

var sleepAssertion: IOPMAssertionID = 0
IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleSystemSleep as CFString,
                            IOPMAssertionLevel(kIOPMAssertionLevelOn),
                            "Meeting Scribe Phase 0 capture" as CFString, &sleepAssertion)

// Process tap over the target's process tree.
let pids = processTree(root: pid)
let processObjects = audioProcessObjects(for: pids)
if processObjects.isEmpty {
    FileHandle.standardError.write("no Core Audio process objects for pid tree \(pids)\n".data(using: .utf8)!)
    exit(1)
}
let description = CATapDescription(stereoMixdownOfProcesses: processObjects)
description.uuid = UUID()
description.isPrivate = true
description.muteBehavior = .unmuted
var tapID = AudioObjectID(kAudioObjectUnknown)
check(AudioHardwareCreateProcessTap(description, &tapID), "AudioHardwareCreateProcessTap")

let outputDevice: AudioObjectID = getProperty(AudioObjectID(kAudioObjectSystemObject),
                                              kAudioHardwarePropertyDefaultSystemOutputDevice,
                                              AudioObjectID(kAudioObjectUnknown))
let outputUID: CFString = getProperty(outputDevice, kAudioDevicePropertyDeviceUID, "" as CFString)
let aggregateSpec: [String: Any] = [
    kAudioAggregateDeviceNameKey: "MeetingScribeProbeTap",
    kAudioAggregateDeviceUIDKey: UUID().uuidString,
    kAudioAggregateDeviceMainSubDeviceKey: outputUID as String,
    kAudioAggregateDeviceIsPrivateKey: true,
    kAudioAggregateDeviceIsStackedKey: false,
    kAudioAggregateDeviceTapAutoStartKey: true,
    kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID as String]],
    kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true,
                                       kAudioSubTapUIDKey: description.uuid.uuidString]],
]
var aggregateID = AudioObjectID(kAudioObjectUnknown)
check(AudioHardwareCreateAggregateDevice(aggregateSpec as CFDictionary, &aggregateID),
      "AudioHardwareCreateAggregateDevice")

let tapFormat: AudioStreamBasicDescription = getProperty(tapID, kAudioTapPropertyFormat,
                                                         AudioStreamBasicDescription())
let appTrack = Track(name: "app", path: prefix + "-app.wav", rate: tapFormat.mSampleRate)
// A nil queue runs each IOProc on its device's real-time HAL IO thread.  A shared GCD
// queue (the first macOS stress run) missed IO deadlines under full CPU load.
var appProc: AudioDeviceIOProcID?
check(AudioDeviceCreateIOProcIDWithBlock(&appProc, aggregateID, nil) { _, input, inputTime, _, _ in
    handleInput(appTrack, input, inputTime, channels: Int(tapFormat.mChannelsPerFrame))
}, "create tap IOProc")

// Default input device, captured independently with its own clock.
var micTrack: Track?
var micProc: AudioDeviceIOProcID?
var inputDevice = AudioObjectID(kAudioObjectUnknown)
if useMic {
    inputDevice = getProperty(AudioObjectID(kAudioObjectSystemObject),
                              kAudioHardwarePropertyDefaultInputDevice, AudioObjectID(kAudioObjectUnknown))
    let micFormat: AudioStreamBasicDescription = getProperty(
        inputDevice, kAudioDevicePropertyStreamFormat, scope: kAudioObjectPropertyScopeInput,
        AudioStreamBasicDescription())
    let track = Track(name: "mic", path: prefix + "-mic.wav", rate: micFormat.mSampleRate)
    micTrack = track
    check(AudioDeviceCreateIOProcIDWithBlock(&micProc, inputDevice, nil) { _, input, inputTime, _, _ in
        handleInput(track, input, inputTime, channels: Int(micFormat.mChannelsPerFrame))
    }, "create mic IOProc")
}

let started = hostSeconds(mach_absolute_time())
check(AudioDeviceStart(aggregateID, appProc), "start tap")
if let micProc { check(AudioDeviceStart(inputDevice, micProc), "start mic") }
print("Capturing \(seconds) seconds.")
for elapsed in 1...seconds {
    Thread.sleep(forTimeInterval: 1)
    if elapsed % 60 == 0 {
        print("\(elapsed) s app_frames=\(appTrack.frames) mic_frames=\(micTrack?.frames ?? 0)")
    }
}
AudioDeviceStop(aggregateID, appProc)
if let micProc { AudioDeviceStop(inputDevice, micProc) }
let ended = hostSeconds(mach_absolute_time())
AudioDeviceDestroyIOProcID(aggregateID, appProc!)
if let micProc { AudioDeviceDestroyIOProcID(inputDevice, micProc) }
AudioHardwareDestroyAggregateDevice(aggregateID)
AudioHardwareDestroyProcessTap(tapID)
appTrack.writer.close()
micTrack?.writer.close()
IOPMAssertionRelease(sleepAssertion)

// MARK: - Outputs

let csv = "track,qpc_s,arrival_s,frames_before_packet,device_position,behind_ms,discontinuities,rate\n"
    + timingLines.joined(separator: "\n") + "\n"
try! csv.write(toFile: prefix + "-timing.csv", atomically: true, encoding: .utf8)

func trackError(_ t: Track) -> Double {
    (Double(t.frames - t.lastPacketFrames) / t.rate - (t.lastHost - t.firstHost)) * 1000
}
func arrivalError(_ t: Track) -> Double {
    (Double(t.frames - t.lastPacketFrames) / t.rate - (t.lastArrival - t.firstArrival)) * 1000
}
func trackJSON(_ t: Track) -> [String: Any] {
    let span = t.lastHost - t.firstHost
    return ["rate": t.rate, "packets": t.packets, "frames": t.frames,
            "seconds_by_frames": Double(t.frames) / t.rate,
            "effective_rate_hz": span > 0 ? Double(t.frames - t.lastPacketFrames) / span : 0,
            "frame_vs_clock_error_ms": trackError(t), "discontinuities": t.discontinuities,
            "gap_fill_frames": t.gapFillFrames, "arrival_error_ms": arrivalError(t),
            "max_inter_arrival_ms": t.maxInterArrivalMs]
}
var usage = rusage()
getrusage(RUSAGE_SELF, &usage)
let cpu = Double(usage.ru_utime.tv_sec + usage.ru_stime.tv_sec)
    + Double(usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) / 1e6
let wall = ended - started
var summary: [String: Any] = [
    "platform": "macos", "requested_seconds": seconds, "wall_seconds": wall,
    "tap_processes": processObjects.count, "pid_tree": pids.map { Int($0) },
    "cpu_seconds": cpu,
    "avg_cpu_percent_of_machine": 100 * cpu / (wall * Double(ProcessInfo.processInfo.activeProcessorCount)),
    "peak_rss_mib": Double(usage.ru_maxrss) / 1048576,  // ru_maxrss is bytes on macOS
    "app": trackJSON(appTrack),
]
if let mic = micTrack {
    summary["mic"] = trackJSON(mic)
    summary["start_offset_ms"] = (mic.firstHost - appTrack.firstHost) * 1000
    summary["sample_count_drift_ms"] = trackError(appTrack) - trackError(mic)
    summary["arrival_drift_ms"] = arrivalError(appTrack) - arrivalError(mic)
}
let json = try! JSONSerialization.data(withJSONObject: summary, options: [.prettyPrinted, .sortedKeys])
try! json.write(to: URL(fileURLWithPath: prefix + "-summary.json"))
print(String(format: "Finished. drift(sample-count)=%.3f ms", summary["sample_count_drift_ms"] as? Double ?? 0))

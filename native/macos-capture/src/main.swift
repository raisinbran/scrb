import CoreAudio
import Darwin
import Foundation
import IOKit
import IOKit.pwr_mgt

// scrb-capture: the macOS capture worker. One JSON object per line on stdin and stdout, the same
// protocol as the Windows helper. See docs/plans/capture-contract-and-clock.md.

setlinebuf(stdout)
rt_init()

// `check-lock <path>` tells recovery whether a worker still holds that lock. The OS drops the lock
// the moment a worker dies, however it dies.
if CommandLine.arguments.count == 3, CommandLine.arguments[1] == "check-lock" {
    let fd = Darwin.open(CommandLine.arguments[2], O_RDONLY)
    exit(fd >= 0 && flock(fd, LOCK_EX | LOCK_NB) != 0 ? 3 : 0)
}

// Detection adds up to 1 s of health tick and the rebuild takes about 0.1 s, inside the 5 s gap limit.
let stallLimitSeconds = 3.0
let chunkSeconds = 5.0
// A stream reopened with access off keeps time but delivers exact zeros. macOS gives no error (T20).
let blockedRetrySeconds = 5.0
let meetingAccessCheckSeconds = 30.0

func say(_ object: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: object)
    print(String(data: data, encoding: .utf8)!)
}

func ticksToNs(_ ticks: Int64) -> Int64 { Int64(Double(ticks) * 1e9 / rtTicksPerSecond) }
func sleepOffset() -> Int64 { Int64(mach_continuous_time()) - Int64(mach_absolute_time()) }

final class Track {
    let name: String
    let ring = rt_ring_create()!
    var writer: ChunkWriter?
    var active = false
    var liveRing: OpaquePointer?
    private var liveGeneration: UInt32 = 0
    var generation: UInt32 = 0
    var nextHost: UInt64 = 0
    var nextOpenReason = "start"
    var deviceRate = 0.0
    var converter: RateConverter?
    var writeErrorReported = false
    private var hadWriteError = false
    var nextAccessCheck = Date.distantPast
    private var blocked = false
    let mutex = NSLock()

    init(name: String) { self.name = name }

    func drain(session: Session) {
        guard let writer else { return }
        mutex.lock()
        defer { mutex.unlock() }
        while let slot = rt_peek(ring) {
            if blocked {
                // Dropped, not written, so the time reads as a marked gap and not as a quiet meeting.
                if rt_slot_silent(slot) != 0 {
                    rt_advance(ring)
                    continue
                }
                blocked = false
                say(["type": "event", "event": "permissionRestored", "track": name])
            }
            // Each slot's own rate: slots from the old device can outlive a switch.
            let rate = slot.pointee.rate
            let gapSeconds = nextHost == 0 ? 0 : (Double(slot.pointee.host) - Double(nextHost)) / rtTicksPerSecond
            var reason: String?
            if slot.pointee.generation != generation {
                endChunk(reason: "pause")
                generation = slot.pointee.generation
                nextOpenReason = "resume"
            } else if writer.isOpen && deviceRate != rate {
                reason = "deviceChanged"
            } else if gapSeconds > 0.05 {
                reason = "discontinuity"
            } else if Double(writer.frames) >= chunkSeconds * Double(writer.rate) {
                reason = "rollover"
            }
            if let reason, writer.isOpen {
                endChunk(reason: reason)
                nextOpenReason = reason
            }
            if !writer.isOpen {
                let tags = ["TRACK=\(name)", "SESSION=\(session.id)"]
                let start = session.toSessionNs(host: slot.pointee.host)
                deviceRate = rate
                if !prepareConverter(rate: rate)
                    || !writer.open(startNs: start, rate: converter == nil ? Int(rate) : RateConverter.outputRate,
                                    reason: nextOpenReason, tags: tags) {
                    reportWriteError("could not open a chunk at \(rate) Hz")
                    rt_advance(ring)
                    continue
                }
            }
            let frames = Int(slot.pointee.frames)
            withUnsafePointer(to: &slot.pointee.samples) { pointer in
                pointer.withMemoryRebound(to: Int16.self, capacity: frames) {
                    let samples = UnsafeBufferPointer(start: $0, count: frames)
                    let liveStart = liveRing == nil ? 0 : session.toSessionNs(host: slot.pointee.host)
                    defer {
                        if let liveRing {
                            _ = live_offer(liveRing, samples.baseAddress, UInt32(frames),
                                           liveStart, rate, liveGeneration, false)
                        }
                    }
                    guard let converter else { return writer.write(samples) }
                    guard let converted = converter.convert(samples) else {
                        return reportWriteError("could not convert \(rate) Hz audio")
                    }
                    converted.withUnsafeBufferPointer { writer.write($0) }
                }
            }
            if writer.failed { reportWriteError("disk write failed") }
            nextHost = slot.pointee.host + UInt64(Double(frames) / rate * rtTicksPerSecond)
            rt_advance(ring)
        }
        // Everything before the cutoff is written, so a closed gate can end the chunk now.
        if rt_gate_is_open() == 0 && writer.isOpen && rt_empty(ring) != 0 {
            endChunk(reason: session.stopping ? "stop" : "pause")
            nextOpenReason = "resume"
        }
    }

    var hasWriteError: Bool {
        mutex.lock()
        defer { mutex.unlock() }
        return hadWriteError
    }

    var isBlocked: Bool {
        mutex.lock()
        defer { mutex.unlock() }
        return blocked
    }

    func block() {
        mutex.lock()
        endChunk(reason: "permission")
        nextOpenReason = "permission"
        nextHost = 0
        blocked = true
        mutex.unlock()
        say(["type": "event", "event": "permissionLost", "track": name])
    }

    func unblock() {
        mutex.lock()
        let was = blocked
        blocked = false
        mutex.unlock()
        if was { say(["type": "event", "event": "permissionRestored", "track": name]) }
    }

    /// A rollover keeps the converter, because the audio carries straight on.
    private func endChunk(reason: String) {
        if reason != "rollover" {
            if let liveRing { _ = live_offer(liveRing, nil, 0, 0, deviceRate, liveGeneration, true) }
            liveGeneration &+= 1
        }
        guard let writer else { return }
        if reason != "rollover", let converter {
            if writer.isOpen, let tail = converter.convert(nil) {
                tail.withUnsafeBufferPointer { writer.write($0) }
            }
            self.converter = nil
        }
        guard writer.isOpen else { return }
        if writer.close(reason: reason) { writeErrorReported = false } else { reportWriteError("chunk could not be saved") }
    }

    private func prepareConverter(rate: Double) -> Bool {
        guard !OggOpusFile.supports(rate), converter == nil else { return true }
        converter = RateConverter(deviceRate: rate)
        if converter != nil { say(["type": "event", "event": "converting", "track": name, "deviceRate": rate]) }
        return converter != nil
    }

    private func reportWriteError(_ message: String) {
        hadWriteError = true
        guard !writeErrorReported else { return }
        writeErrorReported = true
        say(["type": "event", "event": "writeError", "track": name, "message": message])
    }

    func close(reason: String) {
        mutex.lock()
        endChunk(reason: reason)
        nextOpenReason = reason
        nextHost = 0
        mutex.unlock()
    }
}

final class Session {
    var id = ""
    var outputDir = ""
    var source: [Int32] = []
    var mic = "default"
    var stopping = false
    private var asleep = false
    private var originNs: Int64 = 0
    private var continuing = false
    let micTrack = Track(name: "microphone")
    let meetingTrack = Track(name: "meeting")
    lazy var micStream = MicStream(ring: micTrack.ring)
    lazy var voiceMic = VoiceMicStream(ring: micTrack.ring)
    var echoCancellation = false
    private var voiceActive = false

    /// Voice-processing path when asked for; any failure there falls back to the raw HAL path.
    func openMic() -> String? {
        if echoCancellation {
            if let failure = voiceMic.open(mic: mic) {
                voiceMic.close()
                record(["event": "voiceProcessingUnavailable", "message": failure])
            } else {
                voiceActive = true
                record(["event": "voiceProcessing", "rate": voiceMic.deliveredRate, "channels": voiceMic.deliveredChannels])
                return nil
            }
        }
        return micStream.open(mic: mic)
    }

    func closeMic() {
        if voiceActive { voiceMic.close(); voiceActive = false }
        micStream.close()
    }
    lazy var meetingStream = MeetingStream(ring: meetingTrack.ring)
    private var sessionLog: UnsafeMutablePointer<FILE>?
    private var lockFd: Int32 = -1
    private var logSequence = 0
    private let logQueue = DispatchQueue(label: "session.log")
    private var liveFeed: LiveFeed?
    private var writerThread: Thread?
    private var sleepAssertion: IOPMAssertionID = 0
    private var micChange: DispatchWorkItem?
    private var rootPort: io_connect_t = 0

    func toSessionNs(host: UInt64) -> Int64 {
        ticksToNs(Int64(host) + sleepOffset()) - originNs
    }

    var clockOriginNs: Int64 { originNs }

    private func now() -> Int64 { toSessionNs(host: mach_absolute_time()) }

    func open(_ command: [String: Any]) -> (Bool, String?) {
        id = command["sessionId"] as? String ?? ""
        outputDir = command["outputDir"] as? String ?? ""
        source = (command["source"] as? [NSNumber])?.map(\.int32Value) ?? []
        mic = command["mic"] as? String ?? "default"
        echoCancellation = command["echoCancellation"] as? Bool ?? false
        let audio = outputDir + "/audio"
        try? FileManager.default.createDirectory(atPath: audio, withIntermediateDirectories: true)
        lockFd = Darwin.open(audio + "/writer.lock", O_CREAT | O_RDWR, 0o600)
        guard lockFd >= 0, flock(lockFd, LOCK_EX | LOCK_NB) == 0 else { return (false, "writer lock held") }
        // A worker restarted during a pause gets no `start`, so all of this must happen here.
        if let origin = (command["clockOriginNs"] as? NSNumber)?.int64Value {
            originNs = origin
            continuing = true
            preventIdleSleep()
        }
        sessionLog = fopen(audio + "/session.log", "a")
        record(["event": "open", "wholeComputer": source.isEmpty])
        if continuing {
            // A killed worker can leave a cut-off line, which would swallow the next one.
            if let sessionLog { fputs("\n", sessionLog) }
            record(["event": "restart", "atNs": now()])
            micTrack.nextOpenReason = "workerRestarted"
            meetingTrack.nextOpenReason = "workerRestarted"
        }
        // Only a separately inherited descriptor opts in; stdout remains JSON control.
        if let value = ProcessInfo.processInfo.environment["SCRB_LIVE_FD"], let fd = Int32(value),
           let feed = LiveFeed(fd: fd) {
            liveFeed = feed
            micTrack.liveRing = feed.rings[0]
            meetingTrack.liveRing = feed.rings[1]
            feed.start()
        }
        micTrack.writer = ChunkWriter(directory: audio + "/microphone")
        meetingTrack.writer = ChunkWriter(directory: audio + "/meeting")
        let micError = openMic()
        let meetingError = meetingStream.open(source: source)
        micTrack.active = micError == nil
        meetingTrack.active = meetingError == nil
        if let micError { say(["type": "event", "event": "streamDead", "track": "microphone", "message": micError]) }
        if let meetingError { say(["type": "event", "event": "streamDead", "track": "meeting", "message": meetingError]) }
        watch()
        startWriter()
        return (micTrack.active || meetingTrack.active, micTrack.active || meetingTrack.active ? nil : "no track opened")
    }

    private func preventIdleSleep() {
        guard sleepAssertion == 0 else { return }
        IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleSystemSleep as CFString,
                                    IOPMAssertionLevel(kIOPMAssertionLevelOn), "Scribe recording" as CFString,
                                    &sleepAssertion)
    }

    func start() -> Int64 {
        preventIdleSleep()
        if !continuing { originNs = ticksToNs(Int64(mach_absolute_time()) + sleepOffset()) }
        micTrack.generation = rt_gate_generation() + 1
        meetingTrack.generation = micTrack.generation
        let opened = rt_gate_open()
        rt_heard_now(micTrack.ring)
        rt_heard_now(meetingTrack.ring)
        return continuing ? toSessionNs(host: opened) : 0
    }

    /// The gate moves first, then the record, so the disk can never delay the cutoff.
    func pause(id: String, cause: String) -> Int64 {
        let at = toSessionNs(host: rt_gate_close())
        record(["event": "pause", "commandId": id, "cause": cause, "atNs": at])
        return at
    }

    func resume(id: String) -> Int64 {
        let at = toSessionNs(host: rt_gate_open())
        rt_heard_now(micTrack.ring)
        rt_heard_now(meetingTrack.ring)
        record(["event": "resume", "commandId": id, "atNs": at])
        return at
    }

    func stop(commandId: String? = nil) -> (Int64, Bool) {
        stopping = true
        let at = toSessionNs(host: rt_gate_close())
        // Two passes of the writer loop finish whatever was queued before the cutoff.
        Thread.sleep(forTimeInterval: 0.1)
        writerThread?.cancel()
        micTrack.drain(session: self)
        meetingTrack.drain(session: self)
        closeMic()
        meetingStream.close()
        liveFeed?.stop()
        let chunksSaved = !micTrack.hasWriteError && !meetingTrack.hasWriteError
        let markerSaved = commandId.map { id in
            chunksSaved && !id.isEmpty && recordStop(id: id, atNs: at)
        } ?? chunksSaved
        var closed = true
        logQueue.sync {
            if let sessionLog {
                closed = fclose(sessionLog) == 0
                self.sessionLog = nil
            }
        }
        if sleepAssertion != 0 { IOPMAssertionRelease(sleepAssertion) }
        return (at, markerSaved && closed)
    }

    private func recordStop(id: String, atNs: Int64) -> Bool {
        return logQueue.sync {
            guard let sessionLog else { return false }
            logSequence += 1
            let fields: [String: Any] = [
                "event": "stop", "commandId": id, "atNs": atNs, "seq": logSequence,
            ]
            guard let data = try? JSONSerialization.data(withJSONObject: fields),
                  let line = String(data: data, encoding: .utf8) else { return false }
            let written = fputs(line + "\n", sessionLog) >= 0 && fflush(sessionLog) == 0
            return written && (fcntl(fileno(sessionLog), F_FULLFSYNC) == 0 || fsync(fileno(sessionLog)) == 0)
        }
    }

    private func record(_ fields: [String: Any]) {
        logQueue.async { [self] in
            logSequence += 1
            var line = fields
            line["seq"] = logSequence
            let data = try! JSONSerialization.data(withJSONObject: line)
            guard let sessionLog else { return }
            fputs(String(data: data, encoding: .utf8)! + "\n", sessionLog)
            fflush(sessionLog)
            fcntl(fileno(sessionLog), F_FULLFSYNC)
        }
    }

    private func startWriter() {
        let thread = Thread { [self] in
            var lastHealth = Date()
            while !Thread.current.isCancelled {
                micTrack.drain(session: self)
                meetingTrack.drain(session: self)
                Thread.sleep(forTimeInterval: 0.02)
                if Date().timeIntervalSince(lastHealth) >= 1 {
                    lastHealth = Date()
                    health()
                }
            }
        }
        thread.qualityOfService = .userInitiated
        thread.start()
        writerThread = thread
    }

    private func health() {
        let toDb = { (peak: UInt32) -> Double in peak == 0 ? -100 : 20 * log10(Double(peak) / 32767) }
        for track in [micTrack, meetingTrack] {
            let dropped = rt_take_dropped(track.ring)
            if dropped > 0 { say(["type": "event", "event": "framesDropped", "track": track.name, "frames": dropped]) }
            guard streamSilent(track) else { continue }
            // Rebuilds stay on the main queue: two at once would leave a second stream feeding the ring.
            DispatchQueue.main.async { [self] in
                if streamSilent(track) { rebuild(reason: "streamDead", track: track) }
            }
        }
        checkAccess(micTrack)
        checkAccess(meetingTrack)
        say(["type": "event", "event": "health", "micDb": toDb(rt_peak(micTrack.ring)),
             "meetingDb": toDb(rt_peak(meetingTrack.ring))])
    }

    private func streamSilent(_ track: Track) -> Bool {
        let last = rt_last_packet(track.ring)
        let silent = (Double(mach_absolute_time()) - Double(last)) / rtTicksPerSecond
        // A track whose reopen failed stays in here, so it keeps retrying until the device returns.
        return !asleep && !stopping && last != 0 && silent > stallLimitSeconds
    }

    /// Packets on time, but nothing but exact zeros. A real mic always has some noise, so on the mic
    /// this means access is off or the device is muted. A quiet app does the same on the meeting
    /// track, so that track has to run the permission check.
    private func audioIsZeros(_ track: Track) -> Bool {
        let now = Double(mach_absolute_time())
        let sound = rt_last_sound(track.ring)
        return sound != 0 && (now - Double(sound)) / rtTicksPerSecond > stallLimitSeconds
            && (now - Double(rt_last_packet(track.ring))) / rtTicksPerSecond < 1
    }

    private func checkAccess(_ track: Track) {
        let blocked = track.isBlocked
        let isMic = track === micTrack
        guard !asleep, !stopping, rt_gate_is_open() != 0, blocked || audioIsZeros(track),
              Date() >= track.nextAccessCheck else { return }
        let wait = blocked || isMic ? blockedRetrySeconds : meetingAccessCheckSeconds
        track.nextAccessCheck = Date().addingTimeInterval(wait)
        if isMic {
            DispatchQueue.main.async { [self] in
                guard !stopping else { return }
                // A stream stays zeros after access returns, so only a reopen can hear it. Drain clears the block.
                if blocked { reopen(track, reason: "permission") } else { track.block() }
            }
            return
        }
        DispatchQueue.global(qos: .utility).async { [self] in
            let access = checkSystemAudioPermission()
            DispatchQueue.main.async { [self] in
                guard !stopping else { return }
                if access == "denied" && !blocked { track.block() }
                if access == "granted" && blocked {
                    track.unblock()
                    reopen(track, reason: "permission")
                }
            }
        }
    }

    /// The one rebuild path: output changes, audio service restarts and dead streams all come here.
    func rebuild(reason: String, track only: Track? = nil) {
        for track in only.map({ [$0] }) ?? [micTrack, meetingTrack] {
            say(["type": "event", "event": reason, "track": track.name])
            reopen(track, reason: reason)
        }
    }

    private func reopen(_ track: Track, reason: String) {
        track.close(reason: reason)
        let error: String?
        if track === micTrack {
            closeMic()
            error = openMic()
        } else {
            meetingStream.close()
            error = meetingStream.open(source: source)
        }
        rt_touch(track.ring)
        rt_heard_now(track.ring)
        track.active = error == nil
        if let error { say(["type": "event", "event": "streamDead", "track": track.name, "message": error]) }
        else { say(["type": "event", "event": "streamReopened", "track": track.name]) }
    }

    private func watch() {
        var restarted = address(kAudioHardwarePropertyServiceRestarted)
        AudioObjectAddPropertyListenerBlock(systemObject, &restarted, DispatchQueue.main) { [self] _, _ in
            rebuild(reason: "serviceRestarted")
        }
        var output = address(kAudioHardwarePropertyDefaultOutputDevice)
        AudioObjectAddPropertyListenerBlock(systemObject, &output, DispatchQueue.main) { [self] _, _ in
            say(["type": "event", "event": "deviceChanged", "track": "meeting"])
        }
        var input = address(kAudioHardwarePropertyDefaultInputDevice)
        AudioObjectAddPropertyListenerBlock(systemObject, &input, DispatchQueue.main) { [self] _, _ in
            guard mic == "default" else { return }
            // Debounced: a headset can flip the default several times as it connects (Q7).
            micChange?.cancel()
            let change = DispatchWorkItem { [self] in rebuild(reason: "deviceChanged", track: micTrack) }
            micChange = change
            DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: change)
        }
        watchPower()
    }

    /// Chunks close before the Mac sleeps, because hardware time stops during sleep. Each new
    /// chunk's time adds the sleep offset, so the timeline spans the sleep.
    private func watchPower() {
        var notifier: io_object_t = 0
        var port: IONotificationPortRef?
        let context = Unmanaged.passUnretained(self).toOpaque()
        rootPort = IORegisterForSystemPower(context, &port, { context, _, message, argument in
            guard let context else { return }
            let session = Unmanaged<Session>.fromOpaque(context).takeUnretainedValue()
            session.power(message: message, argument: argument)
        }, &notifier)
        guard let port else { return }
        IONotificationPortSetDispatchQueue(port, DispatchQueue.main)
    }

    fileprivate func power(message: natural_t, argument: UnsafeMutableRawPointer?) {
        switch message {
        case 0xE000_0270:  // kIOMessageCanSystemSleep
            IOAllowPowerChange(rootPort, Int(bitPattern: argument))
        case 0xE000_0280:  // kIOMessageSystemWillSleep
            say(["type": "event", "event": "sleeping"])
            asleep = true
            for track in [micTrack, meetingTrack] {
                track.drain(session: self)
                track.close(reason: "sleep")
            }
            IOAllowPowerChange(rootPort, Int(bitPattern: argument))
        case 0xE000_0300:  // kIOMessageSystemHasPoweredOn
            say(["type": "event", "event": "woke"])
            rebuild(reason: "wake")
            asleep = false
        default: break
        }
    }

    func selectMic(_ next: String) {
        mic = next
        rebuild(reason: "deviceChanged", track: micTrack)
    }

    func selectSource(_ next: [Int32]) {
        source = next
        rebuild(reason: "sourceChanged", track: meetingTrack)
    }

    var activeTracks: [String] { [micTrack, meetingTrack].filter(\.active).map(\.name) }
}

if CommandLine.arguments.contains("--mic-probe") {
    runMicProbe()
}

let session = Session()
var acks: [String: [String: Any]] = [:]

func handle(_ command: [String: Any]) -> [String: Any] {
    let id = command["id"] as? String ?? ""
    if let previous = acks[id] { return previous }
    var ok = true
    var error: String?
    var at: Int64?
    var permission: String?
    switch command["name"] as? String {
    case "open": (ok, error) = session.open(command)
    case "start": at = session.start()
    case "pause": at = session.pause(id: id, cause: command["cause"] as? String ?? "user")
    case "resume": at = session.resume(id: id)
    case "stop":
        let result = session.stop(commandId: id)
        at = result.0
        ok = result.1
        if !ok { error = "stop could not be fully saved" }
    case "checkPermission": permission = checkSystemAudioPermission()
    case "selectMic": session.selectMic(command["mic"] as? String ?? "default")
    case "selectSource": session.selectSource((command["source"] as? [NSNumber])?.map(\.int32Value) ?? [])
    case "listMics": return listingAck(id, "mics", listMics())
#if FAULT_HOOKS
    case "faultStopStream":
        if command["track"] as? String == "microphone" { session.micStream.faultStop() } else { session.meetingStream.faultStop() }
#endif
    case "listApps": return listingAck(id, "apps", listApps(include: command["include"] as? [String] ?? []))
    default: ok = false; error = "unknown command"
    }
    var ack: [String: Any] = ["type": "ack", "id": id, "ok": ok,
                              "gate": rt_gate_is_open() != 0 ? "open" : "closed",
                              "activeTracks": session.activeTracks, "atNs": at ?? NSNull()]
    if let error { ack["error"] = error }
    if let permission { ack["systemAudio"] = permission }
    if command["name"] as? String == "start" { ack["clockOriginNs"] = session.clockOriginNs }
    acks[id] = ack
    return ack
}

// Commands run on the main queue, so the listeners above never race them.
DispatchQueue.global(qos: .userInteractive).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
        DispatchQueue.main.async {
            say(handle(command))
            if command["name"] as? String == "stop" { exit(0) }
        }
    }
    DispatchQueue.main.async { if !session.id.isEmpty { _ = session.stop() }; exit(0) }
}
dispatchMain()

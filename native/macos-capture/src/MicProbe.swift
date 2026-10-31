import CoreAudio
import AVFoundation
import Darwin
import Foundation

// Separate process mode: never calls Session.open, allocates a ChunkWriter or opens a file.
private final class MicProbe {
    private let ring = rt_ring_create()!
    private lazy var stream = MicStream(ring: ring)
    private var active = false
    private var started: Date?
    private var timer: DispatchSourceTimer?

    func handle(_ command: [String: Any]) {
        let id = command["id"] as? String ?? ""
        let name = command["name"] as? String ?? ""
        var ok = true
        var failure: String?
        if name == "beginMicCheck" {
            if !active {
                let mic = command["mic"] as? String ?? "default"
                let error = stream.open(mic: mic)
                ok = error == nil
                active = ok
                if ok {
                    started = Date()
                    runMeter()
                } else {
                    failure = AVCaptureDevice.authorizationStatus(for: .audio) == .denied
                        ? "permissionDenied" : "deviceLost"
                    stream.close()
                }
            }
        } else if name == "endMicCheck" {
            stop()
        } else {
            ok = false
        }
        var ack: [String: Any] = ["type": "ack", "id": id, "ok": ok, "gate": "closed",
                                  "activeTracks": active ? ["microphone"] : [], "atNs": NSNull()]
        if let failure { ack["error"] = failure }
        say(ack)
        if name == "endMicCheck" { exit(0) }
    }

    private func runMeter() {
        guard timer == nil else { return }
        let clock = DispatchSource.makeTimerSource(queue: .main)
        clock.schedule(deadline: .now() + .milliseconds(100), repeating: .milliseconds(100))
        clock.setEventHandler { [self] in
            guard active else { return }
            if let started, Date().timeIntervalSince(started) >= 120 {
                say(["type": "event", "event": "micCheckEnded", "reason": "timedOut"])
                stop()
                exit(0)
            }
            let peak = rt_peak(ring)
            let db = peak == 0 ? -100 : max(-100, 20 * log10(Double(peak) / 32767))
            say(["type": "event", "event": "micLevel", "micDb": db])
            let last = rt_last_packet(ring)
            if last != 0 && (Double(mach_absolute_time() - last) / rtTicksPerSecond) > 5 {
                say(["type": "event", "event": "micCheckEnded", "reason": "deviceLost"])
                stop()
                exit(0)
            }
        }
        timer = clock
        clock.resume()
    }

    func stop() {
        active = false
        timer?.cancel()
        timer = nil
        stream.close()
    }
}

func runMicProbe() {
    let probe = MicProbe()
    DispatchQueue.global(qos: .userInteractive).async {
        while let line = readLine() {
            guard let bytes = line.data(using: .utf8),
                  let command = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any]
            else { continue }
            DispatchQueue.main.async { probe.handle(command) }
        }
        DispatchQueue.main.async { probe.stop(); exit(0) }
    }
    dispatchMain()
}

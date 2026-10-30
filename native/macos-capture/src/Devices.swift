import CoreAudio
import CoreServices
import Darwin
import Foundation

// The source lists behind the pickers. Read-only: nothing here opens a stream or changes a device.

@_silgen_name("responsibility_get_pid_responsible_for_pid")
private func responsiblePid(_ pid: pid_t) -> pid_t

private func objectList(_ selector: AudioObjectPropertySelector) -> [AudioObjectID] {
    var size: UInt32 = 0
    var location = address(selector)
    AudioObjectGetPropertyDataSize(systemObject, &location, 0, nil, &size)
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(systemObject, &location, 0, nil, &size, &ids)
    return ids
}

private func hasInput(_ device: AudioObjectID) -> Bool {
    var size: UInt32 = 0
    var location = address(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput)
    return AudioObjectGetPropertyDataSize(device, &location, 0, nil, &size) == noErr && size > 0
}

private func transport(_ device: AudioObjectID) -> String {
    switch readProperty(device, kAudioDevicePropertyTransportType, UInt32(0)) {
    case kAudioDeviceTransportTypeBuiltIn: return "builtIn"
    case kAudioDeviceTransportTypeUSB: return "usb"
    // A classic Bluetooth mic on a Mac always runs in hands-free mode.
    case kAudioDeviceTransportTypeBluetooth: return "bluetoothHandsFree"
    case kAudioDeviceTransportTypeBluetoothLE: return "bluetooth"
    default: return "other"
    }
}

/// `id` is the device UID, which is what `open` takes as `mic`.
func listMics() -> [[String: Any]] {
    let systemDefault = readProperty(systemObject, kAudioHardwarePropertyDefaultInputDevice, AudioObjectID(0))
    return audioDevices()
        .filter { hasInput($0) && readProperty($0, kAudioDevicePropertyIsHidden, UInt32(0)) == 0 }
        .map {
            ["id": deviceUID($0), "name": readProperty($0, kAudioObjectPropertyName, "" as CFString) as String,
             "isSystemDefault": $0 == systemDefault, "transport": transport($0)]
        }
}

/// The outermost `.app` holding this process. Helpers nest inside their app's bundle.
private func enclosingApp(_ pid: pid_t) -> String? {
    var buffer = [CChar](repeating: 0, count: 4096)
    guard proc_pidpath(pid, &buffer, UInt32(buffer.count)) > 0 else { return nil }
    let path = String(cString: buffer)
    return path.range(of: ".app/").map { String(path[..<$0.lowerBound]) + ".app" }
}

/// Falls back to the responsible process for helpers outside the bundle, such as Safari's audio,
/// which plays from a shared WebKit service.
private func ownerApp(_ pid: pid_t) -> String? {
    enclosingApp(pid) ?? enclosingApp(responsiblePid(pid))
}

private func appName(_ path: String) -> String {
    let name = FileManager.default.displayName(atPath: path)
    return name.hasSuffix(".app") ? String(name.dropLast(4)) : name
}

private func installedAppPath(_ bundleId: String) -> String? {
    let urls = LSCopyApplicationURLsForBundleIdentifier(bundleId as CFString, nil)?.takeRetainedValue()
    return (urls as? [URL])?.first?.path
}

/// One row per app, holding every process with a Core Audio object, helpers included. `include`
/// names saved apps that need a row even when they are not running.
func listApps(include: [String]) -> [[String: Any]] {
    let own = ownerApp(getppid())
    var found: [String: (name: String, pids: [pid_t])] = [:]
    for object in objectList(kAudioHardwarePropertyProcessObjectList) {
        let pid = readProperty(object, kAudioProcessPropertyPID, pid_t(-1))
        guard pid > 0, pid != getpid(), let path = ownerApp(pid), path != own,
              !path.hasPrefix("/System/Library/"),
              let bundleId = Bundle(path: path)?.bundleIdentifier else { continue }
        found[bundleId, default: (appName(path), [])].pids.append(pid)
    }
    var rows: [[String: Any]] = found.map { bundleId, app in
        let alive = app.pids.filter { kill($0, 0) == 0 || errno == EPERM }
        return ["bundleId": bundleId, "name": app.name, "running": !alive.isEmpty, "pids": alive]
    }
    for bundleId in include where found[bundleId] == nil {
        guard let path = installedAppPath(bundleId) else { continue }
        rows.append(["bundleId": bundleId, "name": appName(path), "running": false, "pids": [pid_t]()])
    }
    return rows
}

/// Lists change nothing, so unlike the session commands their replies are not kept for retries.
func listingAck(_ id: String, _ key: String, _ rows: [[String: Any]]) -> [String: Any] {
    ["type": "ack", "id": id, "ok": true, "gate": rt_gate_is_open() != 0 ? "open" : "closed",
     "activeTracks": session.activeTracks, "atNs": NSNull(), key: rows]
}

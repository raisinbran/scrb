import Foundation

private let crcTable: [UInt32] = (0..<256).map { index in
    var value = UInt32(index) << 24
    for _ in 0..<8 { value = value & 0x8000_0000 != 0 ? (value << 1) ^ 0x04C1_1DB7 : value << 1 }
    return value
}

private func oggCrc(_ bytes: [UInt8]) -> UInt32 {
    bytes.reduce(UInt32(0)) { crc, byte in (crc << 8) ^ crcTable[Int((crc >> 24) ^ UInt32(byte))] }
}

/// Some volumes refuse a full sync, and that alone is not a lost write.
private func syncToDisk(_ fd: Int32) -> Bool { fcntl(fd, F_FULLFSYNC) == 0 || fsync(fd) == 0 }

private func le32(_ value: UInt32) -> [UInt8] { (0..<4).map { UInt8((value >> (8 * UInt32($0))) & 255) } }

/// One chunk as Ogg Opus: 20 ms frames, a page each second, true pre-skip and end trimming.
final class OggOpusFile {
    private let fd: Int32
    private let rate: Int
    private let frameSamples: Int
    private let scale: UInt64
    private let encoder: OpaquePointer
    private let preSkip: Int
    private let serial = UInt32.random(in: 1...UInt32.max)
    private var pageSeq: UInt32 = 0
    private var pending: [Int16] = []
    private(set) var inputFrames: UInt64 = 0
    private(set) var failed = false
    private var encodedFrames: UInt64 = 0
    private var pageBody: [UInt8] = []
    private var pageLacing: [UInt8] = []

    static func supports(_ rate: Double) -> Bool { [8000, 12000, 16000, 24000, 48000].contains(rate) }

    init?(path: String, rate: Int, tags: [String]) {
        var lookahead: Int32 = 0
        guard OggOpusFile.supports(Double(rate)),
              let encoder = rt_encoder(Int32(rate), &lookahead) else { return nil }
        self.rate = rate
        self.encoder = encoder
        frameSamples = rate / 50
        scale = UInt64(48000 / rate)
        preSkip = Int(lookahead)
        fd = open(path, O_CREAT | O_EXCL | O_WRONLY, 0o600)
        guard fd >= 0 else { opus_encoder_destroy(encoder); return nil }

        var head = Array("OpusHead".utf8) + [1, 1]
        let preSkip48 = UInt16(UInt64(preSkip) * scale)
        head += [UInt8(preSkip48 & 255), UInt8(preSkip48 >> 8)] + le32(UInt32(rate)) + [0, 0, 0]
        writePage(head, lacing: lacing(head.count), flags: 2, granule: 0)
        let vendor = Array("scrb-capture".utf8)
        var comment = Array("OpusTags".utf8) + le32(UInt32(vendor.count)) + vendor + le32(UInt32(tags.count))
        for tag in tags { comment += le32(UInt32(tag.utf8.count)) + Array(tag.utf8) }
        writePage(comment, lacing: lacing(comment.count), flags: 0, granule: 0)
    }

    private func lacing(_ size: Int) -> [UInt8] {
        [UInt8](repeating: 255, count: size / 255) + [UInt8(size % 255)]
    }

    private func writePage(_ body: [UInt8], lacing: [UInt8], flags: UInt8, granule: UInt64) {
        var page = Array("OggS".utf8) + [0, flags]
        for shift in stride(from: 0, to: 64, by: 8) { page.append(UInt8((granule >> UInt64(shift)) & 255)) }
        page += le32(serial) + le32(pageSeq) + le32(0) + [UInt8(lacing.count)] + lacing + body
        pageSeq += 1
        let crc = le32(oggCrc(page))
        page.replaceSubrange(22..<26, with: crc)
        let written = page.withUnsafeBytes { Darwin.write(fd, $0.baseAddress, page.count) }
        if written != page.count { failed = true }
    }

    private func flushPage(last: Bool, granule: UInt64) {
        guard !pageBody.isEmpty || last else { return }
        writePage(pageBody, lacing: pageLacing, flags: last ? 4 : 0, granule: granule)
        pageBody = []
        pageLacing = []
    }

    private func encodeFrame(_ frame: UnsafePointer<Int16>) {
        var packet = [UInt8](repeating: 0, count: 4000)
        let size = opus_encode(encoder, frame, Int32(frameSamples), &packet, 4000)
        guard size > 0 else { return }
        pageBody += packet[0..<Int(size)]
        pageLacing += lacing(Int(size))
        encodedFrames += UInt64(frameSamples)
        if pageLacing.count >= 50 { flushPage(last: false, granule: encodedFrames * scale) }
    }

    func write(_ samples: UnsafeBufferPointer<Int16>) {
        pending.append(contentsOf: samples)
        inputFrames += UInt64(samples.count)
        var used = 0
        pending.withUnsafeBufferPointer { buffer in
            while buffer.count - used >= frameSamples {
                encodeFrame(buffer.baseAddress! + used)
                used += frameSamples
            }
        }
        pending.removeFirst(used)
    }

    /// Ends with end trimming, so a decoder yields exactly the frames written, then reaches disk.
    /// False if any of the chunk failed to reach the disk.
    func close() -> Bool {
        let total = inputFrames
        let padding = [Int16](repeating: 0, count: preSkip + frameSamples)
        pending.append(contentsOf: padding)
        pending.withUnsafeBufferPointer { buffer in
            var used = 0
            while buffer.count - used >= frameSamples {
                encodeFrame(buffer.baseAddress! + used)
                used += frameSamples
            }
        }
        flushPage(last: true, granule: (total + UInt64(preSkip)) * scale)
        let synced = syncToDisk(fd)
        let closed = Darwin.close(fd) == 0
        opus_encoder_destroy(encoder)
        return !failed && synced && closed
    }
}

/// Writes one track's chunks and its `chunks.log`. See docs/plans/crash-safe-chunks.md.
final class ChunkWriter {
    private let directory: String
    private let log: UnsafeMutablePointer<FILE>
    private var sequence = 0
    private var file: OggOpusFile?
    private var openReason = "start"
    private var startNs: Int64 = 0
    private var name = ""
    private var chunkRate = 0

    init?(directory: String) {
        self.directory = directory
        try? FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        guard let log = fopen(directory + "/chunks.log", "a") else { return nil }
        self.log = log
        sequence = ChunkWriter.firstFree(in: directory)
        // A killed worker can leave a cut-off line, which would swallow the next one.
        if sequence > 0 { fputs("\n", log) }
    }

    /// A restarted worker continues the numbering. A dead worker's `.part` holds real audio until
    /// recovery repairs it, so its number is taken too.
    private static func firstFree(in directory: String) -> Int {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory)) ?? []
        return (names.compactMap { Int($0.prefix { $0 != "." }) }.max() ?? -1) + 1
    }

    var isOpen: Bool { file != nil }
    var frames: UInt64 { file?.inputFrames ?? 0 }
    var rate: Int { chunkRate }
    var failed: Bool { file?.failed ?? false }

    func open(startNs: Int64, rate: Int, reason: String, tags: [String]) -> Bool {
        name = String(format: "%06d.opus", sequence)
        while FileManager.default.fileExists(atPath: "\(directory)/\(name)")
            || FileManager.default.fileExists(atPath: "\(directory)/\(name).part") {
            sequence += 1
            name = String(format: "%06d.opus", sequence)
        }
        self.startNs = startNs
        openReason = reason
        chunkRate = rate
        file = OggOpusFile(path: "\(directory)/\(name).part", rate: rate,
                           tags: tags + ["SEQUENCE=\(sequence)", "START_NS=\(startNs)",
                                         "RATE=\(rate)", "OPEN_REASON=\(reason)"])
        return file != nil
    }

    func write(_ samples: UnsafeBufferPointer<Int16>) { file?.write(samples) }

    /// False leaves the chunk unlogged, and a `.part` for recovery if it never finished.
    func close(reason: String) -> Bool {
        guard let file else { return true }
        let frames = file.inputFrames
        let saved = file.close()
        self.file = nil
        guard saved, rename("\(directory)/\(name).part", "\(directory)/\(name)") == 0 else {
            sequence += 1
            return false
        }
        let folder = Darwin.open(directory, O_RDONLY)
        fcntl(folder, F_FULLFSYNC)
        Darwin.close(folder)
        let endNs = startNs + Int64(Double(frames) * 1e9 / Double(chunkRate))
        let line = "{\"file\":\"\(name)\",\"seq\":\(sequence),\"startNs\":\(startNs),\"endNs\":\(endNs),"
            + "\"frames\":\(frames),\"rate\":\(chunkRate),\"openReason\":\"\(openReason)\",\"closeReason\":\"\(reason)\"}\n"
        let logged = fputs(line, log) >= 0 && fflush(log) == 0 && syncToDisk(fileno(log))
        sequence += 1
        return logged
    }
}

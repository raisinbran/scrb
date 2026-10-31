// Always-on-top countdown for hand-run cases. Stays above System Settings without taking focus.
// Prints "start" when the Start button is pressed. Reads tab-separated lines from stdin:
// status, big text, what to do, what comes next, steps. Build: swiftc -O Countdown.swift -o ../build/countdown
import AppKit

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 520, height: 430),
                    styleMask: [.titled, .nonactivatingPanel, .utilityWindow], backing: .buffered, defer: false)
panel.title = "Meeting Scribe test"
panel.level = .screenSaver
panel.isFloatingPanel = true
panel.hidesOnDeactivate = false
panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

func label(_ size: CGFloat, _ weight: NSFont.Weight, _ y: CGFloat, _ height: CGFloat) -> NSTextField {
    let field = NSTextField(wrappingLabelWithString: "")
    field.frame = NSRect(x: 20, y: y, width: 480, height: height)
    field.font = .systemFont(ofSize: size, weight: weight)
    field.alignment = .center
    panel.contentView!.addSubview(field)
    return field
}

let status = label(16, .semibold, 392, 26)
let big = label(84, .bold, 282, 104)
let action = label(24, .semibold, 196, 80)
let next = label(16, .regular, 150, 44)
let steps = label(14, .regular, 58, 88)
steps.alignment = .left

final class Starter: NSObject {
    @objc func start(_ sender: NSButton) {
        sender.isHidden = true
        print("start")
        fflush(stdout)
    }
}
let starter = Starter()
let button = NSButton(title: "Start", target: starter, action: #selector(Starter.start(_:)))
button.frame = NSRect(x: 190, y: 12, width: 140, height: 38)
button.bezelStyle = .rounded
button.font = .systemFont(ofSize: 18, weight: .semibold)
panel.contentView!.addSubview(button)

if let screen = NSScreen.main?.visibleFrame {
    panel.setFrameOrigin(NSPoint(x: screen.maxX - 540, y: screen.maxY - 450))
}
panel.orderFrontRegardless()

setlinebuf(stdout)
DispatchQueue.global().async {
    while let line = readLine() {
        let parts = line.components(separatedBy: "\t")
        guard parts.count == 5 else { continue }
        DispatchQueue.main.async {
            status.stringValue = parts[0]
            big.stringValue = parts[1]
            big.textColor = parts[1].hasPrefix("NOW") ? .systemGreen : .labelColor
            action.stringValue = parts[2]
            next.stringValue = parts[3]
            steps.stringValue = parts[4].replacingOccurrences(of: "|", with: "\n")
        }
    }
    DispatchQueue.main.async { app.terminate(nil) }
}
app.run()

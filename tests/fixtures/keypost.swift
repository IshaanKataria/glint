// Checker: post a real OS-level key press via CGEvent (HID event tap).
// Usage: keypost --preflight            -> prints {"postEventAccess":true|false}, never prompts
//        keypost <keyCode> [cmd] [shift] [alt] [force]   (force: post even when preflight says no; the OS then drops it)
import CoreGraphics
import Foundation
let args = Array(CommandLine.arguments.dropFirst())
if args.isEmpty { print("usage: keypost --preflight | keypost <keyCode> [cmd] [shift] [alt]"); exit(2) }
let allowed = CGPreflightPostEventAccess()
if args[0] == "--preflight" { print("{\"postEventAccess\":\(allowed)}"); exit(0) }
if !allowed && !args.contains("force") { print("{\"ok\":false,\"error\":\"CGPreflightPostEventAccess=false (Accessibility not granted to the responsible app)\"}"); exit(3) }
guard let code = CGKeyCode(args[0]) else { exit(2) }
var flags: CGEventFlags = []
if args.contains("cmd") { flags.insert(.maskCommand) }
if args.contains("shift") { flags.insert(.maskShift) }
if args.contains("alt") { flags.insert(.maskAlternate) }
let src = CGEventSource(stateID: .hidSystemState)
let down = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: true)!
let up = CGEvent(keyboardEventSource: src, virtualKey: code, keyDown: false)!
down.flags = flags; up.flags = flags
down.post(tap: .cghidEventTap); usleep(30000); up.post(tap: .cghidEventTap)
print("{\"ok\":true}")

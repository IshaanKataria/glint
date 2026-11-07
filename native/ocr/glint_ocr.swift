// glint-ocr: on-device text recognition with macOS Vision.
// Usage: glint-ocr <image-path> [--fast]
// Prints one JSON object on stdout: {"text": "...", "lines": [{"text","confidence","x","y","w","h"}], "ms": n}
// Boxes are normalised (0..1) with the origin at the top-left. Exit code 2 = bad input, 3 = Vision error.
import AppKit
import Foundation
import Vision

func fail(_ code: Int32, _ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(code)
}

let args = CommandLine.arguments.dropFirst()
guard let path = args.first(where: { !$0.hasPrefix("--") }) else { fail(2, "usage: glint-ocr <image-path> [--fast]") }
let fast = args.contains("--fast")

let started = Date()
guard let image = NSImage(contentsOfFile: path),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else { fail(2, "cannot read image: \(path)") }

let request = VNRecognizeTextRequest()
request.recognitionLevel = fast ? .fast : .accurate
request.usesLanguageCorrection = !fast
request.automaticallyDetectsLanguage = true

do {
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
} catch {
    fail(3, "vision failed: \(error.localizedDescription)")
}

struct Line: Encodable {
    let text: String
    let confidence: Float
    let x: Double, y: Double, w: Double, h: Double
}
struct Output: Encodable {
    let text: String
    let lines: [Line]
    let width: Int
    let height: Int
    let ms: Int
}

var lines: [Line] = []
for obs in request.results ?? [] {
    guard let top = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    lines.append(Line(text: top.string, confidence: top.confidence,
                      x: b.minX, y: 1 - b.maxY, w: b.width, h: b.height))
}
// Reading order: top-to-bottom rows, then left-to-right within a row.
lines.sort { a, b in
    if abs(a.y - b.y) > min(a.h, b.h) * 0.5 { return a.y < b.y }
    return a.x < b.x
}

// Join lines that share a row with a tab so columns stay apart; new rows get a newline.
var text = ""
var lastY: Double? = nil
var lastH = 0.0
for l in lines {
    if let ly = lastY {
        text += abs(l.y - ly) > min(l.h, lastH) * 0.5 ? "\n" : "\t"
    }
    text += l.text
    lastY = l.y
    lastH = l.h
}

let out = Output(text: text, lines: lines, width: cg.width, height: cg.height,
                 ms: Int(Date().timeIntervalSince(started) * 1000))
let data = try JSONEncoder().encode(out)
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)

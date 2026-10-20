// Text recognition with the macOS Vision framework (no extra install), used by catalogue_extract.py for pages whose
// text is drawn as vector outlines. Prints one line per recognised text line:
//   confidence<TAB>minX<TAB>minY<TAB>width<TAB>height<TAB>text      (normalised coordinates, origin bottom-left)
// Language correction is off so model codes are reported as printed, not "corrected" into words.
import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else { FileHandle.standardError.write("usage: vision_ocr <image>\n".data(using: .utf8)!); exit(2) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(3) }
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
for o in (req.results ?? []) {
  guard let c = o.topCandidates(1).first else { continue }
  let b = o.boundingBox
  print(String(format: "%.3f\t%.5f\t%.5f\t%.5f\t%.5f\t", c.confidence, b.minX, b.minY, b.width, b.height) + c.string.replacingOccurrences(of: "\t", with: " "))
}

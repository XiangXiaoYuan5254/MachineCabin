import AppKit
import Foundation

guard CommandLine.arguments.count == 2 else {
    fputs("usage: generate_icon.swift <output.png>\n", stderr)
    exit(2)
}

let outputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let canvasSize = NSSize(width: 1024, height: 1024)
let image = NSImage(size: canvasSize)

image.lockFocus()
NSGraphicsContext.current?.imageInterpolation = .high
NSColor.clear.setFill()
NSRect(origin: .zero, size: canvasSize).fill()

let backgroundRect = NSRect(x: 44, y: 44, width: 936, height: 936)
let backgroundPath = NSBezierPath(roundedRect: backgroundRect, xRadius: 220, yRadius: 220)
NSColor(calibratedRed: 0.067, green: 0.102, blue: 0.09, alpha: 1).setFill()
backgroundPath.fill()

let innerRect = backgroundRect.insetBy(dx: 78, dy: 78)
let innerPath = NSBezierPath(roundedRect: innerRect, xRadius: 152, yRadius: 152)
innerPath.lineWidth = 18
NSColor(calibratedRed: 0.24, green: 0.72, blue: 0.47, alpha: 0.8).setStroke()
innerPath.stroke()

let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: 430, weight: .bold),
    .foregroundColor: NSColor.white,
    .paragraphStyle: paragraph,
]
let textRect = NSRect(x: 126, y: 226, width: 772, height: 560)
("机" as NSString).draw(in: textRect, withAttributes: attributes)

NSColor(calibratedRed: 0.25, green: 0.83, blue: 0.55, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 758, y: 170, width: 94, height: 94)).fill()
image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("failed to render icon\n", stderr)
    exit(1)
}

try png.write(to: outputURL)

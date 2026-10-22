// Makes an app the default handler for http and https links. macOS asks the
// person to confirm the change.
//
//   swift set-default.swift <path to .app | bundle id>
import AppKit

let target = CommandLine.arguments.dropFirst().first ?? ""
let url = target.hasSuffix(".app")
  ? URL(fileURLWithPath: target)
  : NSWorkspace.shared.urlForApplication(withBundleIdentifier: target)
guard let app = url else {
  FileHandle.standardError.write("No app for \(target)\n".data(using: .utf8)!)
  exit(1)
}

var waiting = 2
var failed = false
for scheme in ["http", "https"] {
  NSWorkspace.shared.setDefaultApplication(at: app, toOpenURLsWithScheme: scheme) { error in
    if let error {
      FileHandle.standardError.write("\(scheme): \(error.localizedDescription)\n".data(using: .utf8)!)
      failed = true
    }
    waiting -= 1
  }
}
while waiting > 0 { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
exit(failed ? 1 : 0)

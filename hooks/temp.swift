// Armory's temperature helper. Prints one JSON line: the thermal state from
// the public ProcessInfo API, and the temperature sensors (in degrees C) from
// the IOKit HID event system. The HID calls are private to Apple: when they
// are missing or change, the sensor list is empty and the state stays.
import Foundation
import IOKit

typealias Client = OpaquePointer
typealias Service = OpaquePointer
typealias Event = OpaquePointer

@_silgen_name("IOHIDEventSystemClientCreate")
func IOHIDEventSystemClientCreate(_ allocator: CFAllocator?) -> Client?
@_silgen_name("IOHIDEventSystemClientSetMatching")
func IOHIDEventSystemClientSetMatching(_ client: Client, _ match: CFDictionary) -> Int32
@_silgen_name("IOHIDEventSystemClientCopyServices")
func IOHIDEventSystemClientCopyServices(_ client: Client) -> CFArray?
@_silgen_name("IOHIDServiceClientCopyProperty")
func IOHIDServiceClientCopyProperty(_ service: Service, _ key: CFString) -> CFTypeRef?
@_silgen_name("IOHIDServiceClientCopyEvent")
func IOHIDServiceClientCopyEvent(_ service: Service, _ type: Int64, _ options: Int32, _ timestamp: Int64) -> Event?
@_silgen_name("IOHIDEventGetFloatValue")
func IOHIDEventGetFloatValue(_ event: Event, _ field: Int32) -> Double

let states = ["nominal", "fair", "serious", "critical"]
let state = states[min(ProcessInfo.processInfo.thermalState.rawValue, 3)]

// Temperature sensors: usage page 0xff00, usage 5; event type 15.
let temperature: Int64 = 15
var sensors: [[String: Any]] = []
if let client = IOHIDEventSystemClientCreate(kCFAllocatorDefault) {
  let match = ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 5] as CFDictionary
  _ = IOHIDEventSystemClientSetMatching(client, match)
  if let services = IOHIDEventSystemClientCopyServices(client) as? [AnyObject] {
    for item in services {
      let service = OpaquePointer(Unmanaged.passUnretained(item).toOpaque())
      guard let name = IOHIDServiceClientCopyProperty(service, "Product" as CFString) as? String,
            let event = IOHIDServiceClientCopyEvent(service, temperature, 0, 0) else { continue }
      let c = IOHIDEventGetFloatValue(event, Int32(temperature << 16))
      if c > 0 && c < 150 { sensors.append(["name": name, "c": (c * 10).rounded() / 10]) }
    }
  }
}

let out: [String: Any] = ["state": state, "sensors": sensors]
if let data = try? JSONSerialization.data(withJSONObject: out), let text = String(data: data, encoding: .utf8) { print(text) }

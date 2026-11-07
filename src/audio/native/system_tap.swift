// Glint system-audio capture: a Core Audio process tap (macOS 14.2+) wrapped in a private
// aggregate device. Writes raw PCM (s16le, 16 kHz, mono) to stdout; status lines go to stderr
// as JSON ({"event":"started"|"error"|"stopped", ...}). Exits when stdin closes (parent died),
// on SIGTERM/SIGINT, or after --seconds N.
//
// Build: swiftc -O -o glint-system-tap system_tap.swift   (src/audio/systemTap.ts does this on demand)
// Permission: macOS asks for "System Audio Recording" for the responsible app (the app that
// launched Glint, e.g. T3 Code or Terminal). Without it the tap delivers silence (all zeros).
import AVFoundation
import AudioToolbox
import CoreAudio
import Foundation

setvbuf(stdout, nil, _IOFBF, 1 << 16)

func emit(_ d: [String: Any]) {
  guard let j = try? JSONSerialization.data(withJSONObject: d), var s = String(data: j, encoding: .utf8) else { return }
  s += "\n"
  FileHandle.standardError.write(s.data(using: .utf8)!)
}

let tracing = ProcessInfo.processInfo.environment["GLINT_TAP_DEBUG"] == "1"
func trace(_ stage: String) { if tracing { emit(["event": "trace", "stage": stage]) } }

func fail(_ code: String, _ msg: String, _ st: OSStatus = 0) -> Never {
  emit(["event": "error", "code": code, "message": msg, "status": Int(st)])
  exit(2)
}

var maxSeconds: Double = 0
/** "builtin-speaker": tap only what plays on the built-in speakers (the echo reference, D-A8). */
var deviceArg: String? = nil
/** --mic: capture the default microphone with AVAudioEngine instead of tapping output. */
var micMode = false
var args = CommandLine.arguments.dropFirst().makeIterator()
while let a = args.next() {
  switch a {
  case "--seconds": maxSeconds = Double(args.next() ?? "0") ?? 0
  case "--device": deviceArg = args.next()
  case "--mic": micMode = true
  case "-h", "--help":
    FileHandle.standardError.write("usage: glint-system-tap [--seconds N] [--device builtin-speaker|<device UID>] [--mic] > out.s16le\n".data(using: .utf8)!)
    exit(1)
  default: fail("BAD_ARGS", "unknown argument \(a)")
  }
}

guard #available(macOS 14.2, *) else { fail("UNSUPPORTED", "Core Audio process taps need macOS 14.2 or later") }

func addr(_ sel: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
}

func defaultOutputUID() -> String {
  var a = addr(kAudioHardwarePropertyDefaultSystemOutputDevice)
  var dev = AudioDeviceID(kAudioObjectUnknown)
  var size = UInt32(MemoryLayout<AudioDeviceID>.size)
  var st = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &dev)
  if st != noErr { fail("NO_OUTPUT_DEVICE", "could not read the default output device", st) }
  a = addr(kAudioDevicePropertyDeviceUID)
  var uid: Unmanaged<CFString>?
  size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  st = AudioObjectGetPropertyData(dev, &a, 0, nil, &size, &uid)
  guard st == noErr, let u = uid?.takeRetainedValue() else { fail("NO_OUTPUT_DEVICE", "could not read the output device UID", st) }
  return u as String
}

// Let the HAL deliver its notifications on its own thread. Without this,
// AudioHardwareCreateAggregateDevice can block forever in a CLI with no running main run loop.
do {
  var rl: CFRunLoop? = nil
  var a = addr(kAudioHardwarePropertyRunLoop)
  AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, UInt32(MemoryLayout<CFRunLoop?>.size), &rl)
}

func outputDevices() -> [AudioDeviceID] {
  var a = addr(kAudioHardwarePropertyDevices)
  var size: UInt32 = 0
  AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size)
  var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
  AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &a, 0, nil, &size, &ids)
  return ids.filter { id in
    var sa = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: kAudioObjectPropertyScopeOutput, mElement: kAudioObjectPropertyElementMain)
    var ssize: UInt32 = 0
    AudioObjectGetPropertyDataSize(id, &sa, 0, nil, &ssize)
    return ssize > 0
  }
}

func deviceUID(_ dev: AudioDeviceID) -> String? {
  var a = addr(kAudioDevicePropertyDeviceUID)
  var uid: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(dev, &a, 0, nil, &size, &uid) == noErr, let u = uid?.takeRetainedValue() else { return nil }
  return u as String
}

/** The built-in speaker output (transport built-in, data source 'spkr'), if this Mac has one. */
func builtinSpeakerUID() -> String? {
  for dev in outputDevices() {
    var a = addr(kAudioDevicePropertyTransportType)
    var transport: UInt32 = 0
    var size = UInt32(MemoryLayout<UInt32>.size)
    guard AudioObjectGetPropertyData(dev, &a, 0, nil, &size, &transport) == noErr, transport == kAudioDeviceTransportTypeBuiltIn else { continue }
    var ds = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyDataSource, mScope: kAudioObjectPropertyScopeOutput, mElement: kAudioObjectPropertyElementMain)
    var src: UInt32 = 0
    size = UInt32(MemoryLayout<UInt32>.size)
    // 'hdpn' = headphones plugged into the jack: not audible in the room, so no echo reference.
    if AudioObjectGetPropertyData(dev, &ds, 0, nil, &size, &src) == noErr, src == 0x6864_706E { return nil }
    return deviceUID(dev)
  }
  return nil
}

var targetUID: String? = nil
if let d = deviceArg {
  targetUID = d == "builtin-speaker" ? builtinSpeakerUID() : d
  if targetUID == nil { fail("NO_DEVICE", "no built-in speaker output (or headphones are plugged in)") }
}

let tapDesc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
if let uid = targetUID {
  // Only audio that this device plays.
  tapDesc.deviceUID = uid
  tapDesc.stream = 0
}
tapDesc.uuid = UUID()
tapDesc.name = "Glint system audio"
tapDesc.isPrivate = true
tapDesc.muteBehavior = .unmuted

var tapID = AudioObjectID(kAudioObjectUnknown)
// ---------------------------------------------------------------------------------------------
// --mic: default input via AVAudioEngine. Core Audio calls the tap block on a real-time thread, so
// unlike ffmpeg's avfoundation reader it doesn't drop audio when the machine is busy (seen in A15:
// 6.2 s returned for 8 s at load average 30). Gaps are filled from host timestamps, like the taps.
// ---------------------------------------------------------------------------------------------
if micMode {
  var tb = mach_timebase_info_data_t()
  mach_timebase_info(&tb)
  let secs: (UInt64) -> Double = { Double($0) * Double(tb.numer) / Double(tb.denom) / 1e9 }
  let engine = AVAudioEngine()
  let input = engine.inputNode
  let inF = input.outputFormat(forBus: 0)
  if inF.sampleRate <= 0 || inF.channelCount == 0 { fail("NO_INPUT", "no microphone input (permission denied or no device)") }
  let outF = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  guard let conv = AVAudioConverter(from: inF, to: outF) else { fail("CONVERTER_FAILED", "no converter for the mic format") }
  conv.downmix = true
  var micFrames: Int64 = 0
  var micPadded: Int64 = 0
  var micNonZero: Int64 = 0
  var nextSec: Double = 0
  var micStopping = false
  let zeros = [Int16](repeating: 0, count: 1600)
  let lock = NSLock()
  input.installTap(onBus: 0, bufferSize: 1024, format: inF) { buf, when in
    lock.lock()
    defer { lock.unlock() }
    if micStopping || buf.frameLength == 0 { return }
    if when.isHostTimeValid {
      let t = secs(when.hostTime)
      if nextSec > 0 {
        var gap = Int64((t - nextSec) * 16000)
        if gap > 1600 {
          micPadded += gap
          micFrames += gap
          while gap > 0 {
            let k = Int(min(gap, Int64(zeros.count)))
            zeros.withUnsafeBufferPointer { _ = fwrite($0.baseAddress, 2, k, stdout) }
            gap -= Int64(k)
          }
        }
      }
      nextSec = t + Double(buf.frameLength) / inF.sampleRate
    }
    let cap = AVAudioFrameCount(Double(buf.frameLength) * 16000 / inF.sampleRate) + 64
    guard let out = AVAudioPCMBuffer(pcmFormat: outF, frameCapacity: cap) else { return }
    var given = false
    var err: NSError?
    conv.convert(to: out, error: &err) { _, status in
      if given {
        status.pointee = .noDataNow
        return nil
      }
      given = true
      status.pointee = .haveData
      return buf
    }
    let n = Int(out.frameLength)
    if n == 0 { return }
    let p = out.int16ChannelData![0]
    for i in 0..<n where p[i] != 0 { micNonZero += 1 }
    fwrite(p, 2, n, stdout)
    fflush(stdout)
    micFrames += Int64(n)
  }
  do {
    try engine.start()
  } catch {
    fail("START_FAILED", "AVAudioEngine start failed: \(error.localizedDescription)")
  }
  emit(["event": "started", "inputSampleRate": inF.sampleRate, "inputChannels": Int(inF.channelCount), "mode": "mic"])
  let stopMic: (String) -> Void = { reason in
    lock.lock()
    micStopping = true
    lock.unlock()
    engine.stop()
    fflush(stdout)
    emit(["event": "stopped", "reason": reason, "seconds": Double(micFrames) / 16000, "paddedSeconds": Double(micPadded) / 16000, "nonZeroSamples": micNonZero])
    exit(0)
  }
  signal(SIGTERM, SIG_IGN)
  signal(SIGINT, SIG_IGN)
  signal(SIGPIPE, SIG_IGN)
  let micSigs = [SIGTERM, SIGINT].map { sg -> DispatchSourceSignal in
    let src = DispatchSource.makeSignalSource(signal: sg, queue: .main)
    src.setEventHandler { stopMic("signal") }
    src.resume()
    return src
  }
  _ = micSigs
  Thread.detachNewThread {
    while FileHandle.standardInput.availableData.count > 0 {}
    DispatchQueue.main.async { stopMic("stdin-closed") }
  }
  if maxSeconds > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + maxSeconds) { stopMic("time-limit") } }
  dispatchMain()
}

// While macOS shows the "Record Your System Audio" prompt, aggregate-device creation blocks
// until the user answers. Report that instead of hanging forever.
var startedFlag = false
let permissionWaitSec = Double(ProcessInfo.processInfo.environment["GLINT_TAP_PERMISSION_WAIT"] ?? "") ?? 8
DispatchQueue.global().asyncAfter(deadline: .now() + permissionWaitSec) {
  if !startedFlag {
    emit(["event": "error", "code": "PERMISSION_PENDING", "message": "System audio recording permission prompt is waiting for an answer (System Settings > Privacy & Security > Screen & System Audio Recording > System Audio Recording Only)"])
    exit(3)
  }
}

trace("create-tap")
var st = AudioHardwareCreateProcessTap(tapDesc, &tapID)
if st != noErr { fail("TAP_CREATE_FAILED", "AudioHardwareCreateProcessTap failed", st) }

var fmtAddr = addr(kAudioTapPropertyFormat)
var asbd = AudioStreamBasicDescription()
var asbdSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
st = AudioObjectGetPropertyData(tapID, &fmtAddr, 0, nil, &asbdSize, &asbd)
if st != noErr { fail("TAP_FORMAT_FAILED", "could not read the tap format", st) }
guard var inFmt = AVAudioFormat(streamDescription: &asbd) else { fail("TAP_FORMAT_FAILED", "unsupported tap format") }

trace("output-uid")
let outUID = targetUID ?? defaultOutputUID()
let aggDesc: [String: Any] = [
  kAudioAggregateDeviceNameKey: "Glint Tap",
  kAudioAggregateDeviceUIDKey: UUID().uuidString,
  kAudioAggregateDeviceMainSubDeviceKey: outUID,
  kAudioAggregateDeviceIsPrivateKey: true,
  kAudioAggregateDeviceIsStackedKey: false,
  kAudioAggregateDeviceTapAutoStartKey: true,
  kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outUID]],
  kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: tapDesc.uuid.uuidString]],
]
var aggID = AudioObjectID(kAudioObjectUnknown)
trace("create-aggregate")
st = AudioHardwareCreateAggregateDevice(aggDesc as CFDictionary, &aggID)
if st != noErr {
  AudioHardwareDestroyProcessTap(tapID)
  fail("AGGREGATE_FAILED", "AudioHardwareCreateAggregateDevice failed", st)
}

let outFmt = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
guard var converter = AVAudioConverter(from: inFmt, to: outFmt) else { fail("CONVERTER_FAILED", "no converter for the tap format") }

var framesOut: Int64 = 0
var paddedFrames: Int64 = 0
var expectedNextSec: Double = 0 // host time (s) where the previous callback's audio ended
var timebase = mach_timebase_info_data_t()
mach_timebase_info(&timebase)
func hostSeconds(_ t: UInt64) -> Double { Double(t) * Double(timebase.numer) / Double(timebase.denom) / 1e9 }
let zeroBlock = [Int16](repeating: 0, count: 1600)
var nonZero: Int64 = 0
var callbacks: Int64 = 0
var emptyCallbacks: Int64 = 0
var stopping = false
let ioQueue = DispatchQueue(label: "glint.tap.io")

// The device can switch sample rate while we run (the built-in speakers follow whatever is playing:
// `say` plays at 22-24 kHz). Rebuild the converter when the tap's format changes, otherwise the
// stream is resampled with the wrong ratio (seen: 12.7 s of audio from an 8.5 s run).
var fmtListenAddr = addr(kAudioTapPropertyFormat)
AudioObjectAddPropertyListenerBlock(tapID, &fmtListenAddr, ioQueue) { _, _ in
  var a = addr(kAudioTapPropertyFormat)
  var d = AudioStreamBasicDescription()
  var sz = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
  guard AudioObjectGetPropertyData(tapID, &a, 0, nil, &sz, &d) == noErr, let f = AVAudioFormat(streamDescription: &d),
        let c = AVAudioConverter(from: f, to: outFmt) else { return }
  if f.sampleRate != inFmt.sampleRate || f.channelCount != inFmt.channelCount {
    emit(["event": "format", "inputSampleRate": f.sampleRate, "inputChannels": Int(f.channelCount)])
  }
  inFmt = f
  converter = c
}
var procID: AudioDeviceIOProcID?
var cleaned = false
var debugTimer: DispatchSourceTimer?

func cleanup(_ reason: String) {
  if cleaned { return }
  cleaned = true
  if let p = procID {
    AudioDeviceStop(aggID, p)
    AudioDeviceDestroyIOProcID(aggID, p)
  }
  AudioHardwareDestroyAggregateDevice(aggID)
  AudioHardwareDestroyProcessTap(tapID)
  fflush(stdout)
  emit(["event": "stopped", "reason": reason, "seconds": Double(framesOut) / 16000, "paddedSeconds": Double(paddedFrames) / 16000, "nonZeroSamples": nonZero])
}

st = AudioDeviceCreateIOProcIDWithBlock(&procID, aggID, ioQueue) { inNow, inData, inInputTime, _, _ in
  if stopping { return }
  callbacks += 1
  guard let inBuf = AVAudioPCMBuffer(pcmFormat: inFmt, bufferListNoCopy: inData, deallocator: nil), inBuf.frameLength > 0 else {
    emptyCallbacks += 1
    return
  }
  let cap = AVAudioFrameCount(Double(inBuf.frameLength) * 16000 / inFmt.sampleRate) + 64
  guard let out = AVAudioPCMBuffer(pcmFormat: outFmt, frameCapacity: cap) else { return }
  var given = false
  var err: NSError?
  converter.convert(to: out, error: &err) { _, status in
    if given {
      status.pointee = .noDataNow
      return nil
    }
    given = true
    status.pointee = .haveData
    return inBuf
  }
  let n = Int(out.frameLength)
  if n == 0 { return }
  let p = out.int16ChannelData![0]
  for i in 0..<n where p[i] != 0 { nonZero += 1 }
  // Keep the stream on the wall clock: the HAL stops calling us while the output device is idle
  // (seen on Bluetooth: 4.7 s of audio in a 9 s run). Fill such gaps with silence using the
  // callback's host timestamps, which (unlike arrival times in Node) don't jitter with CPU load.
  let ts = inInputTime.pointee.mFlags.contains(.hostTimeValid) ? inInputTime.pointee.mHostTime : inNow.pointee.mHostTime
  let tsSec = hostSeconds(ts)
  if expectedNextSec > 0 {
    var gap = Int64((tsSec - expectedNextSec) * 16000)
    if gap > 1600 { // > 100 ms
      paddedFrames += gap
      framesOut += gap
      while gap > 0 {
        let k = Int(min(gap, Int64(zeroBlock.count)))
        zeroBlock.withUnsafeBufferPointer { _ = fwrite($0.baseAddress, 2, k, stdout) }
        gap -= Int64(k)
      }
    }
  }
  expectedNextSec = tsSec + Double(inBuf.frameLength) / inFmt.sampleRate
  fwrite(p, 2, n, stdout)
  fflush(stdout)
  framesOut += Int64(n)
}
if st != noErr { cleanup("ioproc-failed"); fail("IOPROC_FAILED", "AudioDeviceCreateIOProcIDWithBlock failed", st) }

trace("device-start")
st = AudioDeviceStart(aggID, procID)
if st != noErr { cleanup("start-failed"); fail("START_FAILED", "AudioDeviceStart failed (permission?)", st) }
startedFlag = true
var nsr = Float64(0)
var nsrAddr = addr(kAudioDevicePropertyNominalSampleRate)
var nsrSize = UInt32(MemoryLayout<Float64>.size)
AudioObjectGetPropertyData(aggID, &nsrAddr, 0, nil, &nsrSize, &nsr)
emit(["event": "started", "aggregateSampleRate": nsr, "inputSampleRate": inFmt.sampleRate, "inputChannels": Int(inFmt.channelCount), "outputDevice": outUID])

signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)
signal(SIGPIPE, SIG_IGN)
// Runs on the main queue. Never ioQueue.sync here: AudioDeviceStop waits for the IOProc,
// which runs on ioQueue, so that deadlocks (seen in A-log).
let stopAndExit: (String) -> Void = { reason in
  stopping = true
  cleanup(reason)
  exit(0)
}
if ProcessInfo.processInfo.environment["GLINT_TAP_DEBUG"] == "1" {
  let t = DispatchSource.makeTimerSource(queue: .main)
  t.schedule(deadline: .now() + 1, repeating: 1)
  t.setEventHandler { emit(["event": "stats", "callbacks": callbacks, "empty": emptyCallbacks, "framesOut": framesOut, "nonZero": nonZero]) }
  t.resume()
  debugTimer = t
}
let sigs = [SIGTERM, SIGINT].map { s -> DispatchSourceSignal in
  let src = DispatchSource.makeSignalSource(signal: s, queue: .main)
  src.setEventHandler { stopAndExit("signal") }
  src.resume()
  return src
}
_ = sigs

// Parent watchdog: Node keeps our stdin open; EOF means it went away.
Thread.detachNewThread {
  while FileHandle.standardInput.availableData.count > 0 {}
  DispatchQueue.main.async { stopAndExit("stdin-closed") }
}
if maxSeconds > 0 {
  DispatchQueue.main.asyncAfter(deadline: .now() + maxSeconds) { stopAndExit("time-limit") }
}
dispatchMain()

"""Glint WhisperX worker: loads the model once, then transcribes audio chunks over JSON lines.

Run with the WhisperX venv interpreter:
    ~/.cache/watch/whisperx-venv/bin/python scripts/whisper_worker.py [--model small] [--compute-type int8] [--language en] [--align]
    ~/.cache/watch/whisperx-venv/bin/python scripts/whisper_worker.py --once clip.wav   (one-shot test, then exit)

Protocol (one JSON object per line):
  stdin  {"id": "c1", "op": "transcribe", "path": "/abs/chunk.wav"}   16 kHz mono s16 wav (other formats go through ffmpeg)
         {"id": "p1", "op": "ping"}
         {"op": "shutdown"}
  stdout {"type": "ready", "model": "small", "computeType": "int8", "language": "en", "align": false, "loadMs": 1234}
         {"type": "result", "id": "c1", "segments": [{"start": 0.0, "end": 3.2, "text": "..."}], "text": "...", "audioSec": 6.0, "ms": 812}
         {"type": "error", "id": "c1", "message": "..."}
         {"type": "pong", "id": "p1"}
Only protocol lines go to stdout; library output and logs go to stderr.
The worker exits on stdin EOF, on {"op": "shutdown"}, or when its parent process dies.
"""

import argparse
import json
import os
import sys
import threading
import time
import wave

# Keep the protocol channel clean: anything the libraries print goes to stderr.
_proto = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1)
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
sys.stdout = sys.stderr

SAMPLE_RATE = 16000


def send(obj):
    _proto.write(json.dumps(obj) + "\n")
    _proto.flush()


def log(*a):
    print("[whisper_worker]", *a, file=sys.stderr, flush=True)


def watch_parent():
    """Exit if the parent process goes away (e.g. Electron was killed with SIGKILL)."""
    parent = os.getppid()
    while True:
        time.sleep(1.0)
        if os.getppid() != parent:
            log("parent died; exiting")
            os._exit(0)


def load_wav(path, np):
    try:
        with wave.open(path, "rb") as w:
            if w.getframerate() == SAMPLE_RATE and w.getnchannels() == 1 and w.getsampwidth() == 2:
                raw = w.readframes(w.getnframes())
                return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    except wave.Error:
        pass
    import whisperx

    return whisperx.load_audio(path)


def main():
    ap = argparse.ArgumentParser(description="Glint WhisperX JSON-lines worker")
    ap.add_argument("--model", default="small")
    ap.add_argument("--compute-type", default="int8")
    ap.add_argument("--language", default="en")
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--align", action="store_true", help="also load the wav2vec2 alignment model (word timings)")
    ap.add_argument("--once", metavar="WAV", help="transcribe one file, print the result line, exit")
    args = ap.parse_args()

    threading.Thread(target=watch_parent, daemon=True).start()

    t0 = time.time()
    import numpy as np
    import whisperx

    model = whisperx.load_model(
        args.model,
        "cpu",
        compute_type=args.compute_type,
        language=args.language,
        threads=args.threads,
        vad_method="pyannote",
    )
    align_model = align_meta = None
    if args.align:
        align_model, align_meta = whisperx.load_align_model(language_code=args.language, device="cpu")
    load_ms = int((time.time() - t0) * 1000)
    log(f"model {args.model}/{args.compute_type} loaded in {load_ms} ms")
    send({"type": "ready", "model": args.model, "computeType": args.compute_type, "language": args.language,
          "align": bool(args.align), "loadMs": load_ms, "pid": os.getpid()})

    def transcribe(req):
        t = time.time()
        audio = load_wav(req["path"], np)
        audio_sec = len(audio) / SAMPLE_RATE
        if audio_sec < 0.2:
            return {"type": "result", "id": req.get("id"), "segments": [], "text": "", "audioSec": audio_sec, "ms": 0}
        res = model.transcribe(audio, batch_size=args.batch_size, language=args.language)
        segs = res.get("segments", [])
        if align_model is not None and segs:
            segs = whisperx.align(segs, align_model, align_meta, audio, "cpu", return_char_alignments=False)["segments"]
        out = [{"start": round(float(s["start"]), 2), "end": round(float(s["end"]), 2), "text": s["text"].strip()}
               for s in segs if s.get("text", "").strip()]
        return {"type": "result", "id": req.get("id"), "segments": out, "text": " ".join(s["text"] for s in out),
                "audioSec": round(audio_sec, 2), "ms": int((time.time() - t) * 1000)}

    if args.once:
        send(transcribe({"id": "once", "path": args.once}))
        return

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            send({"type": "error", "id": None, "message": f"bad json: {e}"})
            continue
        op = req.get("op")
        if op == "shutdown":
            break
        if op == "ping":
            send({"type": "pong", "id": req.get("id")})
            continue
        if op == "transcribe":
            try:
                send(transcribe(req))
            except Exception as e:  # keep the worker alive for the next chunk
                send({"type": "error", "id": req.get("id"), "message": f"{type(e).__name__}: {e}"})
            continue
        send({"type": "error", "id": req.get("id"), "message": f"unknown op {op!r}"})
    log("stdin closed or shutdown; exiting")


if __name__ == "__main__":
    main()

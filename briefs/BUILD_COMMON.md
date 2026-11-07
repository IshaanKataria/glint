# Glint build: common brief for every build agent

Read `/Users/katana/experiments/cluely-clone/BRIEF.md` first. This file adds the build rules the Lead set. Project root: `/Users/katana/experiments/cluely-clone`.

## Hard rules

- Public info only. Never download, install or run Cluely, unpack its bundle or intercept its traffic. Never search for or open any Cluely source repo, leaked code or third-party clone ("open-source cluely", "cluely clone" and so on). If one shows up in a search, don't open it; log "seen, not opened" in CLONE_LOG.md.
- No Cluely name, logo or assets anywhere in the app. The product is **Glint**. Design your own logo mark (a simple original glyph, for example a four-point spark) and never copy Cluely's.
- No proctoring or interview-evasion features: no hiding from process lists, dock or activity monitor, no focus/tab-switch tricks, no "undetectable" claims. Content protection is framed as "Hide from screen share", for meetings only.
- DeepSeek key: read it only at runtime. The main process gets it from `process.env.DEEPSEEK_API_KEY`. If that's unset, it runs `fish -c 'printf %s "$DEEPSEEK_API_KEY"'` once via `execFileSync` and keeps the value in memory. Never print it, log it, put it in an error message, or write it to any file. `.env*` stays in `.gitignore`.
- Never commit, push, deploy or publish. The user commits by hand.
- Python: use `uv run`, or the WhisperX venv interpreter `~/.cache/watch/whisperx-venv/bin/python` for transcription. Never `pip install` globally.
- Only edit files you own (table below). If you need a change in someone else's file, write the request in your final note and in CLONE_LOG.md. Don't make the change yourself.

## Facts the Lead has already established (see CLONE_LOG L4, L5; DECISIONS D4 to D7)

- DeepSeek API is OpenAI-compatible at `https://api.deepseek.com/v1`. Model ids: `deepseek-v4-pro` (answers, summaries; **text only**) and `deepseek-flash` (V4.1 Flash; cheap, streaming live suggestions). V4 Pro rejects images, so screenshot questions go through on-device OCR.
- WhisperX: `~/.cache/watch/whisperx-venv/bin/whisperx` works (small model, int8, en). The CLI spends about 21 s loading the model per call, so use a long-running Python worker (`~/.cache/watch/whisperx-venv/bin/python`) that loads the model once and takes chunk paths over stdin/stdout JSON lines.
- OCR candidates: `tesseract` (/opt/homebrew/bin) or macOS Vision through a small Swift helper (`swiftc` 6.2 is installed). The AI agent picks one and logs why in DECISIONS.md.
- Electron latest is 45.x. Node 25.
- macOS permissions: the user is granting Screen Recording and Microphone to T3 Code. Anything that still fails for lack of a permission goes under "Waiting on me" with the exact System Settings path. Never fake it.

## UI target (user decision D6)

- Overlay bar: Cluely's **mid-2025 hotkey bar** look (research/screens/overlay-bar.png): dark translucent rounded bar at top centre with listen/stop control, `Ask ⌘↵`, `Show/Hide ⌘\`, `⋮` handle.
- Live suggestions: **Live Insights** panel under the bar (research/screens/live-suggestions.png).
- Ask answer: the answer panel follows research/screens/ask-answer.png (rounded dark panel, the question as a pill at top right, "Sent with screenshot" marker, markdown answer, action chips `Assist · What should I say? · Follow-up questions · Recap`, input "Ask about your screen or conversation, or ⌘↵ for Assist", round blue send button).
- Notes/history: a normal light window following research/screens/notes-history.png (history list grouped by day on the left; the note on the right with Summary / Transcript / Usage tabs, Action items, copy buttons, Resume Session).
- Settings: follows research/screens/settings.png (sidebar plus Keyboard shortcuts list with keycaps), Glint subset only.
- Detailed visual notes: research/screens/SCREENS.md. Features and hotkeys: FEATURES.md (in-scope rows only).

## Architecture and file ownership

Stack: Electron + TypeScript, built with esbuild (or tsc), started with `npm start` from the project root.

| Path | Owner |
|---|---|
| `package.json`, `tsconfig*.json`, build scripts, `src/main/**`, `src/preload/**`, `src/shared/contract.ts` | Shell + overlay |
| `src/audio/**`, `scripts/whisper_worker.py`, `scripts/make_test_clip.sh` | Audio + transcription |
| `src/ai/**`, `src/ocr/**`, `native/ocr/**` (if Swift), `src/sessions/**` (session store and notes on disk) | AI |
| `src/renderer/**` (HTML, CSS, renderer TS for overlay, dashboard/history, settings) | UI |
| `tests/**`, test fixtures, `REPORT.md` test sections | Checker |
| `CLONE_LOG.md`, `DECISIONS.md` | everyone appends to their own section only |
| `FEATURES.md`, `research/**`, `briefs/**`, `REPORT.md` structure | Lead and Researcher |

`src/shared/contract.ts` is the single typed IPC contract (channel names, payload types, the `window.glint` preload API). Shell writes it first, with stub service modules (`src/ai/index.ts`, `src/audio/index.ts`, `src/sessions/index.ts`) that export `register(ctx)` functions. The Audio and AI agents replace their own stubs. If you need a contract change, say so in your note. Audio and AI may add new channels only in a clearly marked section that the Shell agent has reserved for them.

Data directory: `GLINT_DATA_DIR` env var, defaulting to `app.getPath('userData')/sessions`. Each session gets `<data>/<sessionId>/session.json` (transcript segments, summary, action items, title, timings, AI usage) and `<data>/<sessionId>/notes.md`. `data/` and `test-output/` are gitignored.

Test hooks (needed so the Checker can test with file inputs; these are real pipelines with a different source, not mocks):
- `GLINT_AUDIO_FILE=/path.wav`: the session uses this file as the audio source instead of the mic, still chunked and sent through WhisperX.
- `GLINT_TEST=1`: exposes extra read-only state to Playwright (window bounds, isAlwaysOnTop, contentProtection flag, ignoreMouseEvents flag) through the contract.

## Logging (required)

Append to `CLONE_LOG.md` under a `## <Your role>` heading. Entries are `<letter><n>` (S1.. Shell, A1.. Audio, I1.. AI, U1.. UI, C1.. Checker), one per step, in order. Each entry has: time (`date '+%Y-%m-%d %H:%M %Z'`), agent name and model, what you did, every URL visited, every tool or command used, the evidence it was based on (research/ path, frame, SCREENS.md line, or an observation), the result, and time taken. Log dead ends and failed attempts too. Never rewrite earlier entries; add corrections as new ones.

Append to `DECISIONS.md` as `D-<letter><n>`: question, options, pick, why, evidence, confidence (low/med/high), what would change your mind. Mark anything inferred as INFERRED.

Finish with a short note at the end of your CLONE_LOG section: what I tried, what didn't work, what I'd do next.

Your final reply to the Lead: files created, how to run and verify your part (commands plus real output you saw), open requests for other agents, and known gaps.

# Cluely product clone: brief

Goal: test whether AI agents can rebuild the Cluely desktop product (an AI overlay assistant for macOS) using only public information, with no access to its source code or app binary. Everything happens in this folder, locally. The clone gets its own name and branding: call it "Glint" (rename freely later).

## Rules

- Public info only: cluely.com and its subpages, its help/support docs, public demo videos, press, reviews, and social posts. Use the watch skill for videos (frames + transcript).
- Do NOT download, install or run the Cluely app, unpack its bundle, or intercept its traffic. Do NOT search for or open any source repo, leaked code, or third-party clone. If you come across one, don't open it; log that you saw it.
- Don't sign up, log in, or submit any form on Cluely's sites.
- Never deploy, push to a remote, or publish anything. No Cluely name, logo or assets in the app; describe their UI, then design Glint's own version of it.
- Out of scope: any feature for evading exam proctoring or interview-cheating detection (hiding from proctoring software, process lists, focus/tab-switch detection, etc.). If a source describes such features, log them as excluded in FEATURES.md and move on.
- Secrets: the DeepSeek key is in `DEEPSEEK_API_KEY` (a fish universal variable; read it with `fish -c` when needed). Load it from the environment at runtime, never print it, never write it to a file or commit it. `.env*` stays in `.gitignore`.
- Save research (page HTML, video frames, transcripts, screenshots) to `research/` and pass file paths between agents, not pasted dumps.
- `archive/website-attempt/` is an earlier, abandoned website-only clone attempt. Its `reference/discovery/raw-html/` pages (cluely.com HTML) may be reused as research input; cite them like any other source. Ignore everything else in archive/ and never edit it.

## Product scope (features to build)

1. Overlay + ask AI: an always-on-top, translucent, click-through-able overlay toggled by a global hotkey. Ask a question; optionally attach a screenshot of the current screen. DeepSeek may not accept images, so run on-device OCR (macOS Vision via a small helper, or tesseract) and send the text instead; log which you chose and why in DECISIONS.md.
2. Live meeting assist: capture mic (and system audio if feasible), transcribe with local WhisperX (`~/.cache/watch/whisperx-venv/bin/whisperx`, or its Python API) in rolling chunks, and show live suggestions/talking points in the overlay from DeepSeek.
3. Hidden from screen share: the overlay window uses content protection (Electron `setContentProtection(true)`) so screen sharing and screen recordings don't capture it.
4. Notes + summaries: after a session, save transcript, summary and action items locally (JSON + markdown) and show them in a simple history view.

Stack: Electron + TypeScript. LLM: DeepSeek V4 Pro via its OpenAI-compatible API (`https://api.deepseek.com/v1`), with V4 Flash for cheap streaming suggestions. Transcription: local WhisperX only.

## Phases

1. Research: build `FEATURES.md`, a parity checklist. For each Cluely feature: what it does, how the UI looks (with a frame or screenshot path from research/), hotkeys, and the public source URL it came from. Mark each as in scope, out of scope (with reason) or unknown. Then PAUSE for the user's OK.
2. Build: the Electron app, feature by feature.
3. Verify and score (below), then repair.

## Agents

In T3 use `orchestrator_capabilities` + `delegate_task`. Each agent owns its own files.

- Lead: plans, assigns, merges, keeps the logs. Writes no app code.
- Researcher: site, docs, videos, press, reviews into research/ and FEATURES.md.
- Shell + overlay: Electron app shell, overlay window, hotkeys, content protection, settings.
- Audio + transcription: capture, chunking, WhisperX integration.
- AI: DeepSeek client, prompts, OCR path, streaming suggestions, summaries.
- UI: overlay, chat, suggestions panel, history view, matching Cluely's layout and feel with Glint's own branding.
- Checker: a fresh agent that never built anything. Writes and runs the tests and scores.

## Logging (we want to see how it thinks)

- `CLONE_LOG.md`: one entry per step, in order. Time, agent name and model, what it did, every URL visited, every tool or command used, the evidence it was based on (path to frame, screenshot, page, transcript line, or a described observation), the result, and the time taken.
- `DECISIONS.md`: every real choice. The question, options considered, the pick, why, the evidence, confidence (low/med/high), and what would change your mind. Include anything inferred rather than seen.
- Log dead ends and failed attempts too. Never tidy or rewrite old entries; add corrections as new entries.
- Each agent ends its work with a short note in its section: what I tried, what didn't work, what I'd do next.

## Verification

Functional tests (Checker, Playwright `_electron` or equivalent), each with output shown:
- Hotkey toggles the overlay; overlay stays on top of other windows.
- Ask AI: a typed question gets a real DeepSeek answer; a screenshot question goes through OCR and returns an answer that references on-screen text (use a test window with known text).
- Transcription: generate a test clip with macOS `say` into a file, feed it through the pipeline, and show the transcript matches the spoken text.
- Live suggestions appear in the overlay from a transcript.
- Content protection: take a `screencapture` with the overlay open and show the overlay is absent from the captured image.
- Notes: a finished session writes transcript, summary and action items to disk, and they show in the history view.

Anything that needs macOS permissions (screen recording, microphone, accessibility) goes under "Waiting on me" in REPORT.md with the exact System Settings step; test the rest with file-based inputs. Mock-only proof doesn't count as passing.

Scoring:
- Parity: for each in-scope FEATURES.md item, built / partial / missing, with test result.
- Look and feel: run the council skill on side-by-side images (Cluely frame from research/ vs Glint screenshot of the same screen). Each judge scores closeness out of 10 per screen. Don't tell judges any target. A judge with no score (e.g. usage limit) is recorded as `no score`, not replaced.
- Repair until every in-scope feature passes its test and each screen is at least 7/10 from every judge that scored, with at most 5 repair rounds per feature. Repairs go to the agent that built it; checks stay with the Checker.

## Final outputs

- The app runs locally with one command (`npm start` or similar).
- `REPORT.md`: parity table, test results table, side-by-side screens with council scores, a "Couldn't replicate" section (what and why, including what public info didn't reveal), a "Waiting on me" section, and a "Lessons" section (where public-info-only hit its limits, what was hardest, rounds per feature).

# DECISIONS

Append-only. Every real choice: question, options, pick, why, evidence, confidence (low/med/high), what would change my mind. Inferred (not seen) items are marked INFERRED.

Integrity statement: no Cluely app, binary, source repo, leaked code or third-party clone was used for any decision below. All evidence is public pages, public videos, press, reviews and social posts, cited by path or URL.

---

## D1 · Lead · Agent models
- Question: which model runs each BRIEF.md agent role?
- Options: (a) everything on Claude Opus 5.5; (b) mix in DeepSeek/Codex for build roles; (c) cheaper Sonnet for build roles.
- Pick: (a) Claude Opus 5.5 at high effort for Researcher, Shell+overlay, Audio, AI, UI and Checker. Council judges are the three members named in the user's CLAUDE.md (DeepSeek V4 Pro, Claude Opus 5.5, Codex GPT-6 Luna).
- Why: Opus is the strongest available builder in this harness and the same provider as the Lead, which keeps tool behaviour predictable. Codex usage is scarce, so it is kept for judging only.
- Evidence: `orchestrator_capabilities` output (L1).
- Confidence: med.
- What would change my mind: Opus usage limits, or a build role repeatedly failing where another model might do better.

## D2 · Lead · Agent isolation
- Question: shared checkout or worktree per agent?
- Options: shared folder with file ownership; worktree per agent then merge.
- Pick: shared checkout, agents run in sequence or on disjoint files (each owns its own files, per BRIEF.md).
- Why: the app is small, agents' files are disjoint by role, and merging worktrees adds risk without benefit. No commits are made by agents.
- Confidence: med.
- What would change my mind: two agents editing the same file at once.

## D3 · Lead · Build order and file ownership (planned before the user's OK; nothing gets built before it)
- Question: how do the five build and check roles split the code so their files never overlap?
- Options: (a) one agent builds everything; (b) split by role in BRIEF.md, run in sequence where one role depends on another's output.
- Pick: (b). Shell+overlay first (it owns `package.json`, `tsconfig`, `src/main/**` window, hotkeys, IPC and content protection), then Audio (`src/audio/**`, `scripts/whisper*`) and AI (`src/ai/**`, `src/ocr/**`) in parallel, then UI (`src/renderer/**`), then Checker (`tests/**`, `REPORT.md` test sections). The Lead writes no app code.
- Why: Audio and AI both need the IPC contract from Shell, and UI needs every backend API. Parallel runs only happen when the files don't overlap.
- Evidence: BRIEF.md "Agents" section.
- Confidence: med.
- What would change my mind: Shell's IPC contract turning out too thin, in which case UI and AI would be merged into one run.

## D4 · Lead · Model ids and the content-protection test control
- Question: (a) which DeepSeek model ids does the app use? (b) How do we stop the screencapture test passing by accident?
- Options for (b): accept "overlay not visible in capture" on its own; or require a control window that must be visible in the same capture.
- Pick: (a) `deepseek-v4-pro` for answers and summaries, `deepseek-flash` for streaming suggestions. (b) A control window is required. Without Screen Recording permission, macOS captures only the wallpaper, which would hide the overlay whether or not content protection works.
- Evidence: /v1/models response (L4); a test screencapture showed no app windows (L4).
- Confidence: high for (a); med on the cause in (b) (it could also be that no windows were on that display).
- What would change my mind: a capture that shows other app windows without any permission change.

## D5 · Lead · How WhisperX is called (recommended to the Audio agent; theirs to finalise)
- Question: run the WhisperX CLI once per chunk, or keep a Python worker running?
- Options: CLI per chunk; a Python worker (whisperx-venv python) that loads the model once and reads chunk paths over stdin/stdout JSON.
- Pick: the long-running worker.
- Why: the CLI spends about 21 s loading the model for a 3.5 s clip (L5), which rules out rolling live chunks.
- Confidence: high.
- What would change my mind: the worker failing to stay stable when run from Electron.

---

## Researcher

## D-R1 · Researcher · Which videos count as authoritative
- Question: which public videos are evidence for features and look?
- Options: (a) only official Cluely channel + cluely.com assets; (b) also independent reviews; (c) also interview-use tutorials.
- Pick: (a) is authoritative for UI and behaviour; (b) used only to corroborate or flag conflicts (2 reviews); (c) not watched.
- Why: official videos and help-center screenshots show the real app without third-party editing; reviews often repeat marketing and one made an unconfirmed hotkey claim (⌘/). Interview-use tutorials centre on an excluded use case.
- Evidence: official channel UCMU5aMlVjmEgCHJiqauSRwQ listing (CLONE_LOG R9); `research/videos/official-*`; `research/videos/review-*`.
- Confidence: high.
- What would change my mind: an official video contradicting the help center (then the newer-dated source wins).

## D-R2 · Researcher · Help-center screenshots over video frames
- Question: where should reference images come from?
- Options: video frames (720p, often zoomed and edited) vs help-center screenshots (Retina, dated) vs homepage mocks (HTML recreations).
- Pick: help-center screenshots first, official video frames where no screenshot shows the state (bar with hotkey hints, Live Insights during a meeting), homepage mocks as alternates.
- Why: help-center images are the real app at 2x with dates in their filenames; homepage mocks are marketing recreations.
- Evidence: `research/screenshots/support/12294306_06_*.png` (2025-12-09), `research/videos/official-for-meetings/fullres_01m03s.png`.
- Confidence: high.
- What would change my mind: the Lead deciding to target the homepage look specifically.

## D-R3 · Researcher · Choice of each reference screen
- Question: which single image per Glint screen?
- Pick: overlay-bar = for-meetings t=00:00 (Gen B bar with `Ask ⌘↵`, `Show/Hide ⌘\`); ask-answer = help center 12294306_06 (Gen C, "Sent with screenshot"); live-suggestions = for-meetings t=01:03 (Live Insights with Actions); notes-history = help center 12101340_03 (history list + note + next steps in one view); settings = help center Keybinds page.
- Options considered: Gen C pill (no hotkey hints, tiny 170x49 image) for overlay-bar; Gen A get-started bar (more hints but over a quiz page); Smart Mode screenshot (Gen C, chips) for live-suggestions; transcript-tab or homepage Action Items for notes; General tab for settings.
- Why: each pick is the one that shows the most of what the BRIEF asks for that screen (hotkey hints; screenshot context; live suggestions in a meeting; notes + history together; full hotkey list). Alternates kept in `research/screens/alt/`.
- Evidence: `research/screens/SCREENS.md`.
- Confidence: med (the generation mix, see D-R4).
- What would change my mind: council judges finding the Gen B/Gen C mix confusing; then swap overlay-bar and live-suggestions for the Gen C alternates.

## D-R4 · Researcher · UI generation mix (INFERRED recommendation)
- Question: Cluely's public UI exists in three generations (A: early 2025 bar; B: mid 2025 bar + Live Insights; C: Dec 2025+ pill + chat panel). Which should Glint copy?
- Options: all Gen B; all Gen C; Gen C widget with a Live Insights panel styled like Gen C.
- Pick (recommendation to Lead/UI): Gen C styling for the bar and ask panel (current product and site), keeping hotkey hints visible in the input placeholder and in an optional hint row; build the live suggestions panel with Gen B's structure (header, rolling summary, Actions, "Click to ask") in Gen C styling. Reference images stay as chosen in D-R3 so judges compare like with like per screen.
- Why: Gen C is what Cluely ships now; Gen B is the only public view of a live suggestions panel during a call.
- Evidence: SCREENS.md generation notes; help article 12294306 "Cluely HUD for all versions after 1.88.6" and "Transcript is no longer in the widget as of v.1.89.0".
- Confidence: med. INFERRED.
- What would change my mind: the Lead preferring a single-generation match for scoring.

## D-R5 · Researcher · Hotkeys: exact vs inferred
- Question: which hotkeys are confirmed?
- Pick: exact (printed in official sources): ⌘↵ ask/assist/auto-answer and follow-up; ⌘\ show/hide; ⌘R clear/collapse; ⌘⇧\ start/stop session; ⌘←/→/↑/↓ move; ⌘⇧↑/↓ scroll response; Enter submits typed text; ⌘K focuses dashboard search. Gen A only: ⌘↓ scroll, ⌘⇧↵ type in chat. Not confirmed: ⌘/ toggling undetectability (one independent review only). No public hotkey for "What should I say?", Follow-up questions, Recap, or click-through. Glint's click-through toggle key is INFERRED (Glint's own choice).
- Evidence: `research/screens/settings.png`; `research/screens/alt/overlay-bar-alt-widget-settings-menu.png`; HC-dash and HC-settings text; YT-start transcript 00:30 to 00:50; YT-AQ 03:25.
- Confidence: high for exact ones.
- What would change my mind: a newer official keybinds screenshot.

## D-R6 · Researcher · In/out-of-scope line for "undetectability"
- Question: Cluely's "undetectability" mixes screen-share hiding with interview/proctoring evasion. Where is the line?
- Pick: in scope: content protection so screen share/recordings/screenshots don't capture Glint windows (F40), a toggle (F41), a visual indicator (F42), applied to all windows (F43), and plain mouse click-through for usability (F44, required by BRIEF). Out of scope: hiding from Activity Monitor/process lists, process-name masking, dock/tray hiding as stealth, WebRTC/browser-detection blocking, keybind-only use to avoid focus/click detection, claims or tests against interview/assessment/proctoring platforms (E1 to E7). Glint's settings copy must say "screen share", never "proctoring".
- Why: BRIEF.md scope 3 vs the Out-of-scope rule.
- Evidence: https://support.cluely.com/en/articles/12364416-what-apps-are-supported-for-undetectability; `research/screens/alt/settings-alt-general.png`.
- Confidence: high.
- What would change my mind: nothing short of a BRIEF change.

## D-R7 · Researcher · Out-of-scope calls for non-core features
- Question: which extra Cluely features to exclude?
- Pick: out: modes/templates, file knowledge base, personalize text, calendar + meeting alerts + briefs, auto meeting detection, languages, accounts, billing/tiers, mobile, Windows, integrations/CRM, share links, follow-up email, chat-with-meetings/search, delete/edit notes, rebinding keys, theme, open at login/updates, mic test, Smart Mode web search, model choice. Unknown: Fact-check chip and Pause button (seen in one image, behaviour undocumented). In: small parts of the 4 scope items (hotkeys, chips, Me/Them split, Resume Session, Usage tab, copy buttons, auto titles, status states).
- Why: they need accounts/cloud/OAuth or go beyond BRIEF's four items; small UI parts of scope items are cheap and help look-and-feel parity.
- Evidence: FEATURES.md rows F13, F30 to F34, F45, F58 to F61, F72 to F75, F80 to F91.
- Confidence: med (the Lead may promote follow-up email or chat-with-meeting as stretch goals).
- What would change my mind: the Lead or user asking for any of them.

## D-R8 · Researcher · Smart Mode mapping (INFERRED suggestion)
- Question: Cluely's `Smart` toggle uses a slower reasoning model with web search. Should Glint show it?
- Options: omit; show a `Smart` toggle that switches DeepSeek V4 Flash → V4 Pro without search; mark out of scope.
- Pick: marked out of scope (no search provider in BRIEF). Suggestion only: the AI/UI agents may keep the button for visual parity mapped to V4 Pro.
- Evidence: https://support.cluely.com/en/articles/12063703-how-to-use-smart-mode.
- Confidence: low. INFERRED.
- What would change my mind: the Lead's call on visual parity vs honest behaviour.

## D-R9 · Researcher · Sizes, blur and colours are partly INFERRED
- Question: how precise are the visual specs in SCREENS.md?
- Pick: colours are pixel samples as rendered (over whatever is behind); panel/pill radii and font come from homepage computed CSS (16px panel, 12px input, 9999px pill, Geist) and are exact for the site mock only; on-screen sizes relative to the display and blur radius are INFERRED (no public 1:1 full-desktop capture; video frames are zoomed).
- Evidence: `research/pages/home-widget-computed-styles.json`; R17 finding that the mock uses no backdrop-filter on the panel.
- Confidence: med.
- What would change my mind: an official full-resolution desktop screenshot with the widget.

## D6 · User (via Lead) · Which Cluely UI version Glint matches
- Question: three Cluely UI versions are public (D-R4). Which one does Glint copy?
- Options: mid-2025 hotkey bar + Live Insights; current Dec 2025+ pill + chat; a mix chosen per screen.
- Pick (user's choice): mid-2025 hotkey bar + Live Insights panel for the overlay. The Ask answer panel follows research/screens/ask-answer.png and the notes/history window follows research/screens/notes-history.png.
- Why: 3 of the 5 references show the mid-2025 version, so council scores compare like with like.
- Confidence: high (the user decided).

## D7 · User (via Lead) · Live-suggestions reference image
- Pick: research/screens/live-suggestions.png is now a copy of alt/live-suggestions-alt-sales.png (official "Cluely for Sales" frame, the same Live Insights panel, complete and centred). The original cropped frame was kept as alt/live-suggestions-orig-cropped-meetings-01m03s.png.
- Why: the original was cropped at the left edge, so judges would have scored against a partial panel.
- Confidence: high.

## Shell + overlay

## D-S1 · Shell · Contract shape: Result<T> over IPC, typed maps, in-process bus
- Question: how do the four parallel agents share one IPC surface without guessing?
- Options: (a) throw errors across ipcRenderer.invoke; (b) every invoke resolves to `Result<T>`; (c) one generic `invoke(channel)` only.
- Pick: (b) plus typed `CoreInvokeMap`/`CoreEventMap`/`CoreBusMap`, a named `window.glint` API per area, and `glint.ext.invoke/on` for the RESERVED `audio:`/`ai:` channels so those agents never touch the preload. Main registers a NOT_IMPLEMENTED fallback for any core channel no module handled.
- Why: errors thrown across invoke arrive as "Error invoking remote method ..." strings and lose their code; a Result carries `code` (NO_API_KEY, PERMISSION_DENIED, ...) that the UI can show. The bus keeps service-to-service traffic (segments -> insights -> notes) out of IPC.
- Evidence: BUILD_COMMON "contract.ts is the single typed IPC contract"; smoke run shows `ask stub: {"ok":false,"error":{"code":"NOT_IMPLEMENTED",...}}`.
- Confidence: high. What would change my mind: an agent needing a streaming invoke (they can use events, as ask does).

## D-S2 · Shell · "Hide from screen share" default ON for every Glint window
- Question: should content protection be on by default, and on which windows?
- Options: off by default (Cluely's undetectability defaults off, F41); on for the overlay only; on for every window.
- Pick: ON by default on the overlay AND the dashboard (`settings.hideFromScreenShare = true`), toggled from tray, ⋮ menu, Settings, or `overlay:setContentProtection`/`settings:set`. Indicator: preload sets `html.glint-protected`; placeholder CSS draws a 1px dashed border (F42, style INFERRED).
- Why: the brief makes screen-share hiding a core scope item and asks for it on all windows by default; F43 says the dashboard is hidden too. Framed only as "Hide from screen share" (no proctoring wording, E6).
- Evidence: BRIEF scope 3; FEATURES F40-F43; smoke `contentProtection:true` for both windows; protected screencapture had no overlay.
- Confidence: high. What would change my mind: the user wanting Cluely's default-off behaviour.
- Known risk (INFERRED): macOS 15+ ScreenCaptureKit-based capturers may ignore NSWindowSharingNone. The Checker's screencapture test is the real proof.

## D-S3 · Shell · Overlay level 'screen-saver', no vibrancy
- Question: which always-on-top level, and vibrancy or CSS translucency?
- Options: level 'floating' vs 'screen-saver'; `type: 'panel'` (NSPanel); vibrancy vs `transparent: true` + rgba.
- Pick: `setAlwaysOnTop(true, 'screen-saver')` plus `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })`, re-applied on every show. `transparent: true`, `backgroundColor '#00000000'`, `hasShadow: false`, translucency from CSS rgba(24,23,28,0.82). No vibrancy, no panel type.
- Why: 'screen-saver' stays above full-screen meeting apps and other floating utilities; 'floating' can sit under them. Vibrancy fills the whole rectangular window and can't follow the rounded bar with the gap between bar and panel. NSPanel changes focus and key-input behaviour in ways I couldn't verify for typing into the input. skipTransformProcessType keeps Glint a normal Dock app (not hiding from the Dock, E2).
- Evidence: smoke `alwaysOnTop:true, alwaysOnTopLevel:"screen-saver"`; SCREENS.md says blur is unproven (D-R9) and the site mock's panel has no backdrop-filter (R17).
- Confidence: med. What would change my mind: the overlay failing to show over a full-screen Zoom/Keynote in a manual test (then try `type: 'panel'`).

## D-S4 · Shell · Which global hotkeys are registered when
- Question: ⌘R, ⌘↵ and ⌘+arrows are common app shortcuts (reload, send, line navigation). Grab them always?
- Options: always; only while the overlay is visible; never (local only).
- Pick: always: ⌘\ (show/hide) and ⌘⇧\ (start/stop session). Only while the overlay is visible: ⌘↵, ⌘R, ⌘↑↓←→, ⌘⇧↑/↓, ⌘⌥\. They register on show and unregister on hide (logged with isRegistered).
- Why: the brief asks for ⌘R and arrows to be visible-only; I added ⌘↵ because Cmd+Enter is "send" in Slack, Gmail, Notion and others, so stealing it while Glint is hidden would break those apps. When hidden, ⌘\ brings the overlay back first.
- Evidence: FEATURES F02-F08, F20 (exact keys); smoke shows whileVisible keys `registered=false` after hide and `true` after show.
- Confidence: med. What would change my mind: user wanting ⌘↵ to summon + assist from anywhere (Cluely-like); that's a one-line scope change in src/main/hotkeys.ts.

## D-S5 · Shell · Click-through design
- Question: how is the overlay "click-through-able" (F44) while still usable?
- Options: (a) toggle mode only; (b) hover regions only; (c) both.
- Pick: (c). Hover regions are always on: the preload watches mousemove, and when the pointer is over transparent `<html>/<body>` (or `[data-glint-passthrough]`) it calls `setIgnoreMouseEvents(true, { forward: true })`; over content it turns interaction back on. Click-through mode (⌘⌥\, tray, ⋮ menu) makes the whole overlay ignore the mouse and dims it (`html.glint-click-through`) until toggled off.
- Why: the window rectangle is bigger than the visible bar and panel, so without hover regions the transparent margins would block clicks on the app below. The explicit mode is for reading an answer while working underneath it. Usability only, no evasion claims (E4).
- Evidence: smoke `click-through sets ignoreMouseEvents` PASS.
- Confidence: med. What would change my mind: forwarded mousemove proving unreliable on a second display.

## D-S6 · Shell · Click-through toggle key ⌘⌥\ (INFERRED, Glint's own)
- Question: which key toggles click-through? Cluely documents none for plain pass-through.
- Options: ⌘⇧M (Chrome "switch person"), ⌘⇧/ (macOS Help search), ⌘⇧T (reopen tab), ⌘⌥\.
- Pick: ⌘⌥\ (`Command+Alt+\`), visible-only.
- Why: same key family as ⌘\ show/hide, so it's easy to remember. It isn't a default shortcut in macOS, Chrome, Safari, Slack or Zoom as far as I know (INFERRED, not checked against every app). It registered OK.
- Evidence: smoke log `register Command+Alt+\ (toggleClickThrough, whileVisible) -> ok; isRegistered=true`.
- Confidence: med. What would change my mind: a collision report from the user.

## D-S7 · Shell · Data dir, settings file, test hooks
- Question: where do sessions and settings live, and what changes under GLINT_TEST?
- Pick: sessions in `GLINT_DATA_DIR` (resolved against cwd, created if missing), else `<userData>/sessions` (userData is ~/Library/Application Support/Glint after `app.setName('Glint')`). settings.json is `<GLINT_DATA_DIR>/settings.json` when that's set (so tests are isolated), else `<userData>/settings.json`. GLINT_TEST=1 turns on `test:getWindowState`/`test:triggerHotkey` (TEST_ONLY error otherwise), exposes `globalThis.__glintTest` in main for `electronApp.evaluate`, passes `--glint-test` to preloads, and skips the single-instance lock so tests can run beside a normal instance. GLINT_AUDIO_FILE becomes `ctx.flags.audioFile` (absolute path) for the Audio module.
- Why: tests need isolated, disposable state, and the Checker needs read-only introspection with no mocks.
- Confidence: high. What would change my mind: the AI agent wanting settings outside the data dir (easy change in main.ts).

## D-S8 · Shell · DeepSeek key handling
- Pick: exactly as BUILD_COMMON says. `process.env.DEEPSEEK_API_KEY`, else one `execFileSync('fish', ['-c', 'printf %s "$DEEPSEEK_API_KEY"'])` (also tries /opt/homebrew/bin/fish and /usr/local/bin/fish), stderr ignored, value kept in a module closure. The log line reports only the source (`env`/`fish`/`missing`). `ctx.childEnv()` strips the key for child processes such as WhisperX and OCR.
- Evidence: startup log `[glint:main] DeepSeek key: fish`.
- Confidence: high.

## D-S9 · Shell · Build tool: esbuild + tsc --noEmit, TypeScript 7
- Pick: esbuild bundles (fast, no config sprawl); `tsc --noEmit` for types. TypeScript resolved to 7.0.2 (the native compiler). I kept it after it type-checked the whole tree and a deliberate error probe failed as expected.
- What would change my mind: an agent hitting a TS 7 incompatibility (then pin `typescript@5`).
- Confidence: med.

## D-S10 · Shell · Dashboard vibrancy (repair round 2)
- Question: how does the history sidebar become a real translucent macOS column like the reference, and which visual-effect state and appearance?
- Options: CSS only (can't blur the desktop behind the window); `vibrancy: 'sidebar'` with `visualEffectState` 'followWindow' (native: goes inactive when unfocused) or 'active' (always live); system appearance or forced light.
- Pick: on macOS, `vibrancy: 'sidebar'`, `visualEffectState: 'active'`, `backgroundColor: '#00000000'`, the preload adds `html.glint-vibrancy`, and `nativeTheme.themeSource = 'light'`. Title bar (hiddenInset), content protection and the overlay are unchanged. Other platforms keep the opaque `#fafafa`.
- Why: 'followWindow' measured flat when unfocused (rgb 43,43,41, no texture), and screenshots for scoring may be taken while another app has focus. In Dark mode the sidebar material is dark (rgb 38,37,37), while the reference is a light window. Forced light gives about rgb 200,200,199 with blur in both focus states. Forcing light matches F73 (one theme) and doesn't touch renderer CSS (no prefers-color-scheme in src/renderer).
- Evidence: CLONE_LOG S8, S9; scratch captures vib3-pair.png / vib-pair.png; smoke 17/17.
- Side effect: native menus (tray, ⋮) render light even in Dark mode.
- Confidence: med. What would change my mind: the council preferring the native inactive look, or the user wanting Glint to follow the system theme (then drop themeSource and let the UI tint the sidebar per appearance).

## AI

## D-I1 · AI · Which model for what, and thinking on or off
- Question: which DeepSeek model and settings for asks, quick actions, live insights and session notes?
- Options: deepseek-v4-pro vs deepseek-flash; thinking on (streams `reasoning_content` before the answer) vs `thinking:{type:'disabled'}`; `reasoning_effort` low/high.
- Pick: asks and quick actions use `settings.answerModel` (default deepseek-v4-pro) with thinking off, streamed. Live insights use `settings.liveModel` (default deepseek-flash), thinking off, JSON mode, not streamed. Session title/summary/action items use deepseek-v4-pro, thinking off, JSON mode, temperature 0.3, 2 retries.
- Why: the overlay needs a fast first token. With thinking off, the typed ask answered in 1.2-1.5 s end to end and the OCR ask in 2.5-3.3 s (CLONE_LOG I5/I6). `reasoning_effort:"low"` still thinks (I2). Insights are a small structured update every few seconds, so flash + JSON fits. Notes are extraction from a transcript; v4-pro without thinking gave a good title, 4 sections and owner-tagged action items in 3-5 s.
- Evidence: /v1/models output and probes in CLONE_LOG I2; smoke run 2 in I6.
- Confidence: med. What would change my mind: notes missing facts on long real meetings (then turn thinking on for notes only, since latency doesn't matter there); a Smart-mode toggle (D-R8) would map to thinking on.

## D-I2 · AI · Key handling and error scrubbing
- Question: how to make sure the key never reaches logs, errors or the UI?
- Pick: the key comes only from `ctx.getDeepSeekKey()` per request and goes only into the Authorization header. Every upstream message goes through `scrub()`, which removes the literal key, `api key: <anything>`, `sk-...` and `Bearer ...`, and caps the message at 300 chars. 401/403 give a fixed message with no upstream text. Child processes (OCR) get `ctx.childEnv()` (no key).
- Why: DeepSeek's own 401 body echoes the key's last 4 characters (`Your api key: ****dkey is invalid`, I2).
- Evidence: I7 bad-key test "contains key tail? false"; smoke leak scan 0 hits over the written files and main-process logs.
- Confidence: high.

## D-I3 · AI · OCR engine: macOS Vision (Swift helper) over tesseract
- Question: Vision through a compiled Swift CLI, or tesseract?
- Options: (a) Vision `VNRecognizeTextRequest` accurate; (b) Vision fast; (c) tesseract 5 (/opt/homebrew/bin).
- Pick: (a), with (c) as automatic fallback if the helper can't build or run.
- Why: on the same real 2940x1912 dark-mode screenshot, accuracy was about equal (Vision 14/16 known strings, tesseract 15/16; both misread "UI" as "Ul"). On the light test page both got 6/6, and Vision read code punctuation better (`2 ** n` vs tesseract's `2 *k n`). Vision was 1.6x faster warm (0.80 s vs 1.30 s). It also ships with macOS (tesseract needs Homebrew), returns line boxes with confidences, and handles non-Latin scripts with automatic language detection. Vision fast (0.13 s) was kept as a flag (`--fast`) but not used: accurate is still under a second.
- Evidence: CLONE_LOG I3 (scores and timings); smoke run 2 OCR found the test window's "4471" and its per-run marker.
- Cost: the first Vision run after boot took 6.7 s (model load). The helper is built in the background at startup (`ensureHelper`) and rebuilt automatically when missing or older than the .swift source (swiftc ~5 s).
- Confidence: med-high. What would change my mind: a larger bake-off on code-heavy or small-font screens where tesseract wins clearly, or no swiftc on a user's machine (then the fallback already covers it).

## D-I4 · AI · Quick-action prompts, from the help-center wording
- Question: what should Assist, What should I say?, Follow-up questions and Recap each do?
- Pick and sources:
  - Assist: "Cluely will go through the transcript and understand the context of your call to jump in where needed" (HC-use, research/pages/support-12294306-how-to-use-cluely.html); "general guidance or help understanding the meeting, problem-solving support, a broader perspective... analyzes both what's being said in your meeting and what's currently on your screen" (HC-assist, research/pages/support-12665135-assist-vs-what-should-i-say-next.html). Glint: infer the need from the latest transcript (answer a question just asked, give facts or options, explain a term), else from the screen; lead with the most useful line, about 150 words.
  - What should I say?: "line by line suggestions on how to respond" (HC-use); "specific, conversational suggestions... not long explanations or general guidance, but actual words and phrases you can use right now... natural and friendly, with just a touch of wit" (HC-assist). Glint: 1-3 first-person lines as blockquotes plus an optional "**Or:**" alternative, no commentary.
  - Follow-up questions: "Cluely to suggest follow up questions" (HC-use). Glint: 3-5 specific numbered questions in bold, each with a short reason why.
  - Recap: "recap what's going on in the call" (HC-use). Glint: a one-line gist, then Key points / Decisions / Open questions, falling back to the screen when there's no transcript.
  - ⌘↵ with an empty box = Assist (HC-use "You can also trigger assist with CMD Enter"; F03). A typed question = "ask anything... considers both your screen context and exactly what you're asking" (HC-assist).
- Quick actions attach the screen by default (Assist "analyzes... what's currently on your screen"; F14 "every query uses screen context"); typed asks follow `settings.attachScreenshotByDefault`.
- INFERRED: the exact output formats (blockquotes, numbered bold questions, recap sections) are mine. The help pages describe intent, not layout.
- Confidence: med. What would change my mind: frames of real Cluely answers for these chips showing a different shape.

## D-I5 · AI · Live Insights cadence and shape
- Question: how often to refresh the rolling summary, and what's in it?
- Pick: one flash call 2 s after the last new segment, at most 6 s after the first unprocessed one, at least 4 s between calls, one call in flight (more segments arriving trigger another call afterwards), 5 s-60 s backoff after failures. The input is the previous notes + actions + the last 30k chars of transcript; the output is JSON {summaryMarkdown, actions[{kind,text}]}, at most 6 actions with stable ids (sha1 of kind+text) so the UI can keep items steady between refreshes.
- Why: WhisperX segments arrive every few seconds; this gives a refresh about every 4-6 s while people talk, with no request pile-up. The smoke run showed insights 3.8 s after the last segment, 1.7 s per call. Rewriting the summary (not appending) matches the "rolling summary" look (F24, research/screens/live-suggestions.png).
- Kinds map to F25: question (❓, the UI draws the marker), define ("Define X"), followUp ("Suggest follow-up questions about X"), actionItem (to-dos). The prompt always includes the most recent question asked by Them, even if answered (fix from smoke run 1, I5-I6).
- Confidence: med. What would change my mind: a real call showing the panel churning too much (then lengthen minIntervalMs) or cost concerns.

## D-I6 · AI · Conversation thread and context limits
- Pick: the thread keeps the last 6 turns. Earlier user turns, including their old OCR text, are cut to 6k chars. Each request carries at most 12k chars of screen text and the last 24k chars of transcript. A new ask cancels the one in flight (the old requestId gets ask:error CANCELLED "Superseded by a new question"). ask:clear (⌘R) cancels and empties the thread. The thread survives sessions starting and stopping; only ⌘R clears it (F06).
- Why: follow-ups (F05) need the earlier answer (smoke: "Now double that number" -> 782). The caps keep cost and latency down; both models have 1M context, so the limits are about cost, not capacity.
- Confidence: med.

## D-I7 · AI · Session files and status hand-off
- Question: session.json shape (the brief says `durationSec` + `transcript[]`; contract SessionRecord says `durationMs` + `segments`) and who reports "summarizing".
- Pick: session.json stores `transcript[]`, `durationSec` and `durationMs` (plus status, runs[], summaryModel, summaryError). history:get maps `transcript` to the contract's `segments`. Segments also append to transcript.jsonl as they arrive, so a crash keeps them, and session.json is rewritten 1.5 s after changes so the history view stays fresh mid-session. Resume appends a new entry to `runs`, and duration is the sum of the runs. When a session stops, sessions emits `session:status` summarizing, then saved (or error with "Saved without summary: ..."), then history:changed. If the summary fails, the notes are still written with the transcript and the error.
- Why: satisfies both the brief and the contract without duplicating the transcript on disk; the UI needs a "Writing notes..." state the Audio module can't know about.
- Confidence: med. What would change my mind: the Audio agent also emitting summarizing/saved (then one of us drops it).

## D-I8 · AI · Notes shape enforced by schema + validator, not by prompt wording (notes repair, round 2)
- Question: how to make end-of-session notes reliably sectioned and factual (Checker C19: one 256-char paragraph, figures missing)?
- Options: (a) reword the prompt again; (b) structured JSON sections, markdown built in code; (c) (b) plus validation with one corrective retry; (d) thinking on for notes.
- Pick: (c). JSON `{title, overview, sections[{heading, bullets[]}], actionItems[]}` -> markdown built in code as overview + `### Heading` + bullets. Validation: overview present; at least 2 sections with bullets when the transcript has 120+ words, otherwise at least 1; at least 60% of the distinct digit figures in the transcript appear in the notes (checked only when there are 4 or more). On failure, one retry that tells the model exactly what is missing; the best attempt is kept and any leftover issues are logged. Thinking stays off (D-I1).
- Why: a free-form markdown string can't be checked, and the prompt rule had already been ignored. The schema makes "sections with bullets" the only shape the model can return, the code owns the formatting, and the figure check targets the actual complaint (missing numbers) without inventing anything. (d) wasn't needed: without thinking, 4/4 real runs were valid on the first attempt at 4.3-5.0 s.
- Why `###`: dashboard.css styles `.md h1/h2/h3` and bold-only paragraphs the same way (section heading), and ### nests correctly under notes.md's "## Summary" in any markdown viewer.
- Short sessions: 120 words is about 45-60 s of speech. Below that, 1 section is valid, so 8 s clips get 1-2 small sections, not padding (I10: 20 words -> 2 one-bullet sections; 24 words -> 1).
- Evidence: CLONE_LOG I8-I10 (old summary fails the new validator for 0 sections and 7 missing figures; regenerated notes have 4 sections with every figure; 3 repeat runs agree; the retry path is exercised; smoke 26/26).
- Limits: the figure check only sees digits; numbers WhisperX writes as words ("forty") aren't counted (INFERRED: rare in practice, since WhisperX wrote digits for every figure in C19). The 60% / 120-word thresholds are my judgment.
- Confidence: med-high. What would change my mind: real long meetings that still pass with thin bullets (then add a bullets-per-100-words floor or turn thinking on for notes).

## D-I9 · AI · Action-item owners as structured {task, owner} with "doer, not asker" rules (follow-up to C21)
- Question: how to attribute action items reliably when speaker labels are coarse (file mode labels everything "Them")?
- Options: (a) revert to the round-1 wording; (b) keep free-text owners and add one sentence; (c) structured `{task, owner}` with explicit ownership rules plus a speaker-label summary in the request.
- Pick: (c). The code renders "task (owner)", so session.json, notes.md and the UI are unchanged.
- Why: the round-2 line "labels may be wrong, attribute by what people say" gave no rule for requests, and 5/5 runs gave the asker ownership. Making the owner its own field, with doer-not-asker rules, fixed the g clip in 5/5 runs and kept named owners on the long meeting. The rules are generic request/promise patterns, not the clip's sentences.
- Evidence: CLONE_LOG I11 (before 0/5 "(Me)", after 5/5; long meeting 3 runs, 4 sections each).
- Limits: with everything labelled "Them", who the user is in a multi-person meeting is inferred from content. The model now treats the person addressing a named counterpart as the user (finance approval -> "Me"). Real two-channel capture (mic = Me) removes the guesswork. Run-to-run variance remains (one long run merged two items).
- Confidence: med. What would change my mind: real mic+system sessions with correct Me/Them labels still giving wrong owners (then add an owner-consistency check or turn thinking on for notes).

## Audio + transcription

## D-A1 · Audio · How live audio is captured
- Question: how to capture the mic ('me') and system audio ('them') on macOS 15.7 / Electron 45?
- Options: (a) Electron desktopCapturer/getDisplayMedia with `audio: 'loopback'` in a hidden renderer; (b) ScreenCaptureKit helper; (c) Core Audio process tap (macOS 14.2+) in a small Swift helper; (d) ffmpeg avfoundation (mic only; system audio needs a virtual device such as BlackHole, an extra install).
- Pick: mic = ffmpeg avfoundation (`-f avfoundation -i :default`, GLINT_MIC_DEVICE to override), system audio = (c), src/audio/native/system_tap.swift (global stereo tap excluding nothing, private aggregate device, converted to 16 kHz mono s16le on stdout). The binary is compiled on demand with /usr/bin/swiftc into `<userData>/bin/glint-system-tap-<sha10>`. If the tap fails (permission pending/denied, macOS < 14.2, swiftc missing) the session continues mic-only, and the status message says why (`audio:getStats().systemAudio`). GLINT_SYSTEM_AUDIO=0 turns it off.
- Why: (c) needs only the "System Audio Recording Only" permission (no Screen Recording, no purple screen-share indicator, no video frames), no renderer, and no Chromium feature flags in Shell-owned main.ts. (a) would need getDisplayMedia (Screen Recording) plus main.ts switches, and Electron docs say it depends on the launcher's Info.plist anyway. ffmpeg is already required for file decoding, and avfoundation mic capture is a one-liner.
- Evidence: A4 (Electron desktop-capturer docs via search, Apple "Capturing system audio with Core Audio taps", catap notes); T3 Code's Info.plist has NSAudioCaptureUsageDescription + NSMicrophoneUsageDescription; A10 live run transcribed system audio exactly as speaker 'them'.
- Confidence: high for system audio (verified), med for the mic (path verified to deliver PCM, but only zeros until permission is granted).
- What would change my mind: the tap failing when Glint is packaged as its own .app (then add NSAudioCaptureUsageDescription to the app's Info.plist; Shell owns packaging), or echo from speakers proving bad enough to need one capture process doing echo cancellation (AVAudioEngine voice processing in the Swift helper).

## D-A2 · Audio · File source behaviour (GLINT_AUDIO_FILE / audioFile)
- Question: speaker label, pacing, and whether the session ends with the file.
- Pick: speaker 'them' by default (GLINT_AUDIO_FILE_SPEAKER=me to flip); decoded by ffmpeg to 16 kHz mono and pushed through the same chunker and worker as live audio; pace 'fast' (as fast as ffmpeg decodes; GLINT_AUDIO_FILE_PACE=realtime adds `-re`); the session stays open after the file ends (status message "Audio file finished; session stays open until you stop it", plus `audio:fileDone` event/bus) until `session:stop`. GLINT_AUDIO_FILE_AUTOSTOP=1 stops it automatically.
- Why: the file stands in for "the other party". Keeping the session open lets the AI agent's live insights (which stop on `session:stopped`) finish their round, and the Checker controls when notes get written. Fast pace keeps tests short (10.6 s clip -> fileDone ~4 s after start with a warm model).
- Evidence: A9 runs.
- Confidence: med. What would change my mind: the Checker wanting fully hands-off runs (flip the default to autostop).

## D-A3 · Audio · Chunking: silence-seeking 4-8 s, no overlap
- Question: fixed chunks with overlap, or cut at pauses?
- Options: fixed 5 s with 1 s overlap (needs text de-duplication at the seams); VAD-ish cut at pauses.
- Pick: buffer 16 kHz PCM; once >= 4 s, cut in the middle of the first 300 ms run of 20 ms frames with RMS <= 160 (~ -46 dBFS); if no pause by 8 s, cut at the quietest frame between 4 and 8 s. No overlap. Chunks with < 0.25 s of voiced frames are skipped (not sent to WhisperX), which avoids silence hallucinations and saves CPU. WhisperX's own pyannote VAD runs inside each chunk too.
- Why: cutting at pauses keeps words whole, so there's nothing to de-duplicate. In the test clip the first cut landed exactly at the sentence break (5.14 s).
- Evidence: A9/A10 chunk stats (`chunk them t=0s dur=5.14s`, `t=5.14s dur=5.46s`; silent mic chunks SKIPPED).
- Confidence: med. The thresholds are tuned on TTS and one laptop mic noise floor. What would change my mind: real meeting audio with constant background noise never going under -46 dBFS (then the 8 s fallback cut applies, which is still fine).

## D-A4 · Audio · Worker protocol and crash handling
- Pick: scripts/whisper_worker.py run with ~/.cache/watch/whisperx-venv/bin/python (GLINT_WHISPER_PYTHON overrides), spawned with `env: ctx.childEnv()` (no DeepSeek key). Model small/int8/en, pyannote VAD, alignment off (GLINT_WHISPER_ALIGN=1 turns it on). Chunks are written as wav files to `$TMPDIR/glint-audio/<session>-<run>/` and deleted after transcription (GLINT_AUDIO_KEEP_CHUNKS=1 keeps them). JSON lines in order. On crash or a 60 s stuck chunk: restart after 0.5 s and resend in-flight chunks (one retry each); 3 restarts in 2 min -> worker 'failed', a new session resets it. Quit: before-quit stops the session (<= 8 s), sends `{"op":"shutdown"}`, SIGKILL after 2 s; the worker also exits on stdin EOF or when its parent dies.
- Why: alignment adds a second model and its latency for word timings nobody uses yet. Files instead of base64 PCM keep the protocol debuggable (`--once` works on the same files).
- Evidence: A6, A9 (--kill-worker), A10 (no orphans after quit; worker exits ~6 s after a SIGKILL of Electron).
- Confidence: high.

## D-A5 · Audio · Pre-warm at app start
- Question: load the model at app start or at session start?
- Pick: app start (1 s after register), so the first Listen has no model-load wait (4.3-6 s here; 21 s cold per the Lead's L5). Under GLINT_TEST=1 it is off unless GLINT_AUDIO_FILE is set, so the other agents' UI/AI test launches don't each start a 500 MB Python process. GLINT_WHISPER_PREWARM=0/1 overrides. A session started before the model is ready still works: chunks queue and the status says "Loading transcription model...".
- Evidence: A9 run 1 (cold: first segment 6.1 s after start) vs run 2 (warm: 1.96 s).
- Confidence: med. What would change my mind: the user caring about idle memory (~500 MB RSS) more than first-Listen latency.

## D-A6 · Audio · Event order and segment shape
- Pick: one TranscriptSegment per chunk per speaker (WhisperX segments inside a chunk are joined), `id = <runTag>-<speaker>-<chunk#>` (unique across resumes), tStart/tEnd in seconds from session start, plus the resume offset (max of the previous last tEnd and durationMs). Order: status starting -> bus session:started -> status recording -> segments -> [fileDone] -> status stopping -> drain -> status idle -> bus session:stopped. I emit `idle` before the bus event so the sessions module's own summarizing/saved statuses come after mine (it emits them synchronously from its session:stopped listener). A second session:start while one is active returns BUSY.
- Evidence: A9 event dumps (`stopping`, `idle "Stopped"`, `summarizing "Writing notes..."` in that order).
- Confidence: high.

## D-A7 · Audio · Silence gate relative to each stream's noise floor (replaces D-A3's fixed thresholds)
- Question: why were live `me` chunks skipped, and what gate keeps speech without passing silence?
- Options: lower the fixed thresholds; add input gain; thresholds relative to a per-stream noise floor.
- Pick: noise floor = 10th percentile of non-zero 20 ms frame RMS over the last ~10 s, clamped 1..100. Quiet (pause) = max(12, 4×floor); voiced = max(24, 8×floor); a chunk needs ≥ 0.3 s voiced. Pause-seeking 4-8 s cuts as in D-A3. No gain.
- Why: the built-in mic's floor is ~1 RMS and speech 30-300 RMS (input volume 8/100), so −46 dBFS was above the speech. A lower fixed value would break on noisier mics; relative thresholds follow both. The 24 RMS (−63 dBFS) absolute minimum keeps digital near-silence out, and silent chunks still never reach WhisperX. Gain changed nothing in WhisperX (A12).
- Evidence: A11 levels; A16 mic chunks voiced 0.38-0.78 s with floor −90 dBFS and thr −62.7; silent chunks voiced 0-0.02 s; file test still WER 0%.
- Confidence: med-high. What would change my mind: a noisy room with a constant floor above 100 RMS (−50 dBFS); the cap then keeps the gate at ≤ 800 RMS.

## D-A8 · Audio · Echo: speaker-reference double-talk test, not text or correlation
- Question: when the meeting plays through the speakers, the mic hears it. How do we keep that out of `me` without dropping the user's own speech?
- Options: (a) text match of `me` vs overlapping `them` text; (b) envelope correlation mic vs system mix; (c) GCC-PHAT; (d) speakerphone-style double-talk test against what the built-in speakers play; (e) Apple voice processing (AEC) on the mic.
- Pick: (d). A second tap restricted to the built-in speakers (`--device builtin-speaker`; none when headphones are in the jack) is the echo reference. A voiced mic frame counts as user speech if the speakers were silent within ±0.6 s, or if it is > 12 dB above the learned echo level (median mic−speaker dB of earlier echo chunks). A mic chunk with < 0.3 s of user frames is echo: not transcribed, logged, `skipReason: 'echo'`. GLINT_ECHO_FILTER=0 turns it off.
- Why: (a) fails because the mic copy is misheard ("grid market zone" vs "bleeding microphone"); (b) and (c) measured non-discriminative (A14). The global tap is a mix that can be dominated by audio going to headphones/AirPods, which can't leak into the mic, so only speaker output is a valid reference. (e) is the proper long-term fix but a bigger change with ducking side effects; noted as next.
- Evidence: A16 live: mic copy flagged ECHO (user 0 s, explained 0.38 s), `them` exact; mic-only control produced `me`; unit test 5/5.
- Confidence: med. Known limits: double talk inside one chunk is transcribed with the echo words included; external/USB/HDMI speakers aren't a reference yet; a user speaking only while the speakers play steadily louder than them at a −48 dB coupling could be dropped (the +12 dB margin mitigates).
- What would change my mind: a human-voice test where the user's speech during playback is dropped, which would mean moving to (e).

## D-A9 · Audio · Mic via the Swift helper (AVAudioEngine); every live stream on the wall clock (amends D-A1)
- Pick: mic = `glint-system-tap --mic` (AVAudioEngine input tap, AVAudioConverter with downmix to 16 kHz mono s16). ffmpeg avfoundation stays as `GLINT_MIC_BACKEND=ffmpeg` and is the automatic fallback if the helper can't be built. Taps and mic fill delivery gaps with zeros from Core Audio host timestamps, inside the helper. The tap rebuilds its converter when the device changes rate. Tap sources start on the helper's "started" event, not first audio. The helper is compiled at app start.
- Why: at load 30-50 ffmpeg returned 6.24 s for 8 s and took 3-6 s to start, while the Swift path returned 8.30 s for 8 s at once. Arrival-time padding in Node added 1.8 s of false gaps under load. Silence at session start must not look like a failed system capture.
- Evidence: A13-A16.
- Confidence: med-high. What would change my mind: AVAudioEngine choosing a different input than avfoundation's ":default" (both follow the system default input today).

## UI

## D-U1 · UI · Which generation per screen, and how the overlay stacks
- Question: D6 mixes Gen B (bar, Live Insights) and Gen C (ask panel). How do they fit in one overlay?
- Options: (a) Gen B bar above a Gen C panel, panels stacked under the bar; (b) Gen C pill everywhere; (c) Gen B's in-card answer (answer replaces insights inside the same card, header "Clear Response ⌘R").
- Pick: (a). Bar (Gen B) at top; under it a slim status strip; then either Live Insights or the Ask panel. While an answer is shown, Live Insights is hidden (like Gen B, where the card switches to the response); ⌘R / the hover ✕ clears the answer and Live Insights comes back. Clicking Ask with no answer opens the panel as chips + input only (Gen C collapsed state, alt/overlay-bar-alt-widget-settings-menu.png), stacked under Live Insights when a session runs. Only the latest exchange is shown (ask-answer.png shows one bubble + answer); the AI module keeps the thread for follow-ups (D-I6).
- Evidence: D6; SCREENS.md "After clicking an action" (research/videos/official-for-meetings/frames/00m54s_frame_0008.jpg); ask-answer.png.
- Confidence: med. INFERRED: how Gen B and Gen C pieces combine (no public image shows the Gen B bar above the Gen C panel). What would change my mind: council judges marking the bar+panel combination down on ask-answer (then add a Gen C pill variant for that panel).

## D-U2 · UI · Fonts
- Question: Geist/Inter-like per SCREENS.md; which font, bundled or system?
- Options: bundled Inter (OFL); bundled Geist; system SF Pro.
- Pick: overlay uses the system font (SF Pro) with bundled Inter as fallback; dashboard uses bundled Inter Variable (latin, 48 KB, from @fontsource-variable/inter, OFL licence copied next to it).
- Why: measured on ask-answer.png, the answer text has the same cap height as mine (21 vs 22 px @2x) but is ~13% narrower per character than Inter (12.4 vs 14.3 px/char), and the chip/placeholder widths gave the same ratio; SF Pro matches that width and its curly punctuation. The dashboard references (notes-history.png, settings.png) read as Inter-like (single-storey 'y', 'G' shapes), so Inter there.
- Evidence: U5 measurement; research/screens/ask-answer.png, settings.png.
- Confidence: med. What would change my mind: a judge calling the overlay type off; then try Geist (OFL) in the overlay.

## D-U3 · UI · Overlay bar (research/screens/overlay-bar.png, live-suggestions.png)
- Pick: height 40px, radius 10px, padding 0 8 0 14, group gap 20px; fill rgba(6,6,8,0.86) (reference renders near-black (4,6,9) over (17,19,22) and lets a white stripe show faintly in overlay-bar.png), 1px border rgba(255,255,255,0.16), shadow 0 8px 24px rgba(0,0,0,.35). Text 13px/500 #f4f4f5. Keycaps 20x20, radius 5, fill rgba(255,255,255,0.12) (reference (42,42,45) on black), 11.5px. Listen: lucide AudioLines + ChevronUp at 15px; idle click = start session; while live it toggles the Live Insights panel (chevron flips). Stop: 26px circle rgba(255,255,255,.17) (reference (48,48,51)) with a 10px white rounded square. Timer 12px tabular grey after the stop button (Gen A shows `00:07`; Gen B shows none: kept because the task asks for it). ⋮ lucide EllipsisVertical 17px stroke 2.6. No backdrop blur.
- Why: proportions from live-suggestions.png (bar 575x60 px at ~1.45 zoom => ~396x41 CSS). No blur because backdrop-filter in a transparent Electron window can only blur the page's own (empty) pixels, not the desktop; faking it in screenshots would misrepresent the app (D-S3 also chose no vibrancy).
- Confidence: high for colours/shape, med for sizes (video zoom INFERRED ~1.4-1.45 from the macOS menu-bar text).

## D-U4 · UI · Live Insights panel (research/screens/live-suggestions.png)
- Pick: width 540px (window 572px with shadow margins), radius 10px, fill rgba(20,20,22,0.70), 1px border rgba(255,255,255,.16), padding 8px 0 10px with 17px side insets. Header "Live Insights" 13px/600; right "Show Transcript" 13px/500 + AudioLines icon, then a Minus minimise. Summary headings 18px/700 (-0.012em), bullets 14px; idle state "Start of Summary" + "• No content yet...". "Actions" heading 18px/700; items 14px rows 29px tall, radius 5px, hover rgba(255,255,255,.10) with 1px rgba(255,255,255,.18) border (reference shows exactly this hover box), emoji markers ❓ question, 💬 define/followUp, 📝 actionItem. Footer "Click to ask Glint" 12.5px grey centred. Actions appear once the transcript has a segment or the AI sent items; "Suggest follow-up questions" is appended unless the AI already sent a followUp item. Transcript view: Them grey bubbles left, Me blue (#2563eb) right, auto-scroll when at bottom. Max scroll height 340px then the top fades.
- Why: overlay-bar.png (recording just started) shows the panel without Actions and live-suggestions.png (conversation started) shows Actions with "Suggest follow-up questions"; tying Actions to the first segment reproduces both. Fill computed from (79,76,73) over (223,219,204).
- Confidence: med. INFERRED: when Cluely shows the Actions block.

## D-U5 · UI · Ask panel (research/screens/ask-answer.png)
- Pick: 540px wide, radius 16px, fill rgba(24,23,28,0.78) (computed from (79,78,82) over white), border rgba(255,255,255,.10), padding 10px; content inset 16px. Question bubble: gradient #4358c4 -> #6a57e3 -> #8b56f0, radius 11px, 14.5px, glow 0 4px 16px rgba(110,86,240,.45), right-aligned. "Sent with screenshot" 12px rgba(255,255,255,.42) + lucide Image 14px, shown when ask:status reports capturing/ocr or ask:done meta.usedScreenshot. Answer 15px/1.6 white markdown (marked + DOMPurify; links never navigate), scroll area max 244px, bottom fade mask when more content is below, round 26px scroll-to-bottom (#1f1d24). Chips row 13.5px with lucide Sparkles / WandSparkles / MessageSquareText / RotateCw and grey "•" separators, no backgrounds. Input 42px tall, radius 12px, 1px rgba(155,155,155,.4) border; placeholder "Ask about your screen or conversation, or ⌘ ↵ for Assist" with outlined keycaps (a CSS-only placeholder span, hidden by `input:not(:placeholder-shown) + .ph`); Enter sends text, ⌘↵ with empty input sends Assist. Send: 26px circle, navy radial gradient (#2f5fd0 -> #0f2f80, reference (24,60,146)), filled paper-plane glyph. A hover ✕ (top-left) clears (F09).
- Confidence: high for layout, med for exact type size (D-U2).

## D-U6 · UI · Dashboard history + note (research/screens/notes-history.png, alt/notes-history-alt-transcript-tab.png, alt/notes-history-alt-homepage-action-items.png)
- Pick: bg #fafafa everywhere (reference (250,250,250)); 52px drag title bar (hiddenInset; 84px left inset for the traffic lights) with a centred search field #ebebee radius 10 "Search or ask anything..." + ⌘K, "Start Glint" button #ddedf9 / #3f97e6 (reference (221,237,249) / (74,163,238)), and a round settings button where the reference has the avatar (no accounts in Glint). Left list 36% (290-420px): lowercase "history" label (per the task), day headings 13.5px #8d8d94 ("Today", "Yesterday", "Fri, Aug 15"), rows 15px title + grey duration chip + light-blue uses chip (#e3effb/#4a86cf) + time at right (F55), selected #ececee radius 9. Note: crumb "Friday, Nov 6 · 2:05 PM", title 32px/600 -0.022em, chips (calendar date, duration, uses), segmented tabs Summary | Transcript | Usage (#f0f0f2 track, white selected), "Copy full summary/transcript" grey button right, "Action Items" 21px/600 then the summary markdown; transcript lines "Them 0:04" (blue #3ba0ea) / "Me" (violet) + 15.5px text; usage rows with Quick action / Screen tags. Floating pills "View Transcript" + "▶ Resume Session" (#efefef, shadow) at the bottom. Share/follow-up email from the reference are left out (not in scope).
- Why: Aug 2025 layout (list left, note right) is the scored reference; tabs, Action Items and copy buttons come from the Gen C alts the task asks for.
- Confidence: med. What would change my mind: judges wanting the date chip only (no duration/uses chips) under the title.

## D-U7 · UI · Settings sheet (research/screens/settings.png, alt/settings-alt-general.png)
- Pick: a sheet over the dimmed dashboard (backdrop rgba(250,250,250,.72)), 900x680 max, radius 12, border #ececee, soft shadow. Sidebar 240px #fafafa: ✕, General, Keybinds (selected #eeeeee radius 8), spacer, "Quit Glint" with a Frown icon (reference uses the same sad-face glyph). General: grey card "Hide from screen share" + EyeOff/Eye icon + state sentence + blue switch (the alt's "Detectable" card, reworded per E6/BUILD_COMMON); "General settings / Customize how Glint works for you"; rows with 44px grey icon tiles: Click-through overlay (overlay:setClickThrough), Include screen with questions (attachScreenshotByDefault), Version (app:info); "About v0.1.0" bottom right. Keybinds: "Keyboard shortcuts" 15px/600 + sub line, groups General / Window / Scroll, 40px rows with lucide icons, light keycaps 24px #f0f0f1 with 1px #e4e4e7 border. Rows come from settings:keybinds; a label like "Move the window up / down / left / right" with key "↑/↓/←/→" is split into one row per direction, as in the reference.
- Confidence: high.

## D-U8 · UI · Moving the overlay and its menu
- Question: how does ⋮ both drag and open a menu, without breaking hover-region click-through?
- Options: `-webkit-app-region: drag` on bar/handle; manual pointer drag via overlay:move.
- Pick: manual drag. pointerdown + setPointerCapture on the bar background or ⋮, screenX/screenY deltas batched per animation frame into `overlay.move({dx,dy})`; a press that moves under 4px on ⋮ opens Shell's native menu (`overlay.showMenu`, which already has Open Glint, Settings, Hide from screen share, Click-through, Hide, Quit). #root is `pointer-events:none` with surfaces `auto`, so transparent margins hit <body> and the preload passes clicks through.
- Why: in an app-region drag area Chromium doesn't deliver mouse events to the page, so the preload's mousemove-based hover detection (D-S5) could leave the bar ignoring the mouse; a click on a drag region also never reaches the button.
- Confidence: med (not exercised with a real pointer; see U6 note). What would change my mind: jittery drags on a real display (then ask Shell for a main-side drag using cursor polling).

## D-U9 · UI · Dev-only visual fixtures
- Question: how to screenshot states whose backend isn't ready, without faking features?
- Pick: src/renderer/lib/fixtures.ts drives the same handler functions the IPC events call, only when `window.glint.testMode` (GLINT_TEST=1) AND `?fixture=` are set; the overlay scene (fake call drawn in CSS, fixture-scene.css) and `&zoom=1.4` framing are fixture-only. scripts/ui_shots.mjs names fixture shots by state and real-backend shots `real-*`. Fixture shots are for layout comparison only and are never proof of a feature.
- Confidence: high.

## D-U10 · UI · Screenshots shown with "Hide from screen share" off
- Question: the default is ON (dashed borders, D-S2/F42), but the references show Cluely in its default (detectable) state with solid hairlines. Which goes to the side-by-side?
- Pick: the comparison shots are taken with the setting off in the script's throwaway data dir; overlay-protected.png, dashboard-protected.png and settings-general.png show the default ON look (dashed 1px rgba(255,255,255,.3) on overlay surfaces, 1.5px dashed grey around the dashboard).
- Why: like-for-like with the references; the dashed indicator is a Glint-only addition (style INFERRED in FEATURES F42).
- Confidence: med. What would change my mind: the Lead wanting default-state shots for scoring (run `node scripts/ui_shots.mjs --protected`).

## D-U11 · UI · Overlay surfaces: darker flat charcoal, no blur (repair round 1)
- Question: judges saw the panels as lighter and "frosted". How dark and how see-through, and how do we keep text legible?
- Options: (a) keep rgba(20,20,22,.70) and add backdrop blur; (b) flat charcoal in the SCREENS.md band (#1a1a1e-#202024 at 75-85%) with no blur; (c) near-opaque panels.
- Pick: (b). Bar rgba(26,26,30,.84), Live Insights rgba(28,28,32,.80), ask rgba(26,25,30,.80), hairline white .11-.17 borders, and a 1.5px dark text-shadow on overlay text.
- Why: there was never any backdrop-filter (D-U3), so the frosted look came from 70% fill over a soft, bright backdrop. 80% darkens it without hiding the call, and stays in the band SCREENS.md gives. The text-shadow keeps white text readable over bright patches without a frosted look.
- Evidence: test-output/checker/compare/live-suggestions.png; r1-claude-opus-5-5.md; live-suggestions.png panel (79,76,73) over (223,219,204), about 73% of a #1a1a1e fill; after shots test-output/ui/live-insights*.png.
- Confidence: med. INFERRED: the exact alpha (a 720p frame can't separate fill colour from alpha). What would change my mind: judges calling it too opaque on the Checker's real backdrop (then try .74).

## D-U12 · UI · Stop button: grey disc with a white square, not a white disc
- Question: the repair brief asked for "a white or light circle with a dark square, as in the reference". The reference pixels disagree.
- Options: (a) white disc + dark square as asked; (b) match the sampled reference; (c) something in between.
- Pick: (b), slightly lighter: 24px disc white .22 over the bar (renders about (77,77,81)) with a 9px white square and a faint inner ring.
- Why: sampled live-suggestions.png along y=71: disc (48,48,51), square (255,255,255), bar (4,6,9). overlay-bar.png shows the same. The "white disc" wording came from the code-only judge (r1-deepseek-v4-pro.md) and from SCREENS.md line 21, which says "round light-grey stop button (white circle with a dark square)"; the pixels show the square is the white part. I made the disc a little lighter than sampled to meet the "light circle" half of the request.
- Evidence: U7 pixel samples; scratchpad crops of overlay-bar.png and live-suggestions.png.
- Confidence: high. What would change my mind: an image-seeing judge scoring the stop button as wrong.

## D-U13 · UI · Compact bar and Live Insights proportions
- Question: how compact, given the brief's 440-480pt panel and 14-15px headings, against the earlier 540px from the zoomed video?
- Options: keep 540px and 18px headings; 468px with type scaled to match; 440px.
- Pick: Live Insights 468px, title 12.5px, headings 15px/700, body 13px, 25px action rows with 1px gaps, footer 4px under the list. Bar: no timer (elapsed time in the stop button tooltip), height 38, 16px group gaps, 12.5px labels, solid #38383d keycaps.
- Why: 468/540 = 0.87, and 18px x 0.87 is about 15.6px, so the smaller panel with 15px headings keeps the reference's type-to-panel ratio while matching the brief. Without the timer the bar is ~375px, 0.80 of the panel (reference 0.72, 575/800 px in live-suggestions.png). Two judges called the old panel too wide and tall and the timer extra.
- Evidence: r1 council notes; live-suggestions.png measurements (U2); test-output/ui/alpha-insights-on-dark.png.
- Confidence: med. INFERRED: absolute size on a real screen (the video is zoomed). What would change my mind: judges saying the headings now look too small next to the reference's (the reference heading is ~1.4x the panel title, Glint's is 1.2x).

## D-U14 · UI · Shadows fit inside the transparent overlay window
- Question: the ask panel's shadow was cut at the window edge (light rectangle on light backdrops). Ask Shell for bigger bounds, or fit the shadow?
- Options: (a) ask Shell to pad the window; (b) the renderer pads #root and asks for a wider window through overlay.setSize (it already sets the width); (c) drop shadows.
- Pick: (b) plus smaller shadows. #root padding 8/24/30, window width 588 (540 + 2x24). Shadows: bar 0 2px 6px (reach 4px up, inside 8), insights 0 4px 16px, ask 0 6px 18px plus a 0.5px dark ring (reach ≤18px sideways, ≤24px down, inside 24/30).
- Why: the renderer already owns the window size through overlay.setSize, so no change to Shell's file is needed. A small soft shadow still separates the panel from light pages, as in ask-answer.png, which shows almost no shadow.
- Evidence: alpha-edge check (U10): after 0/0/0/0 on all four alpha shots; control with the old values left 10, right 10, top 9, bottom 40. test-output/ui/alpha-ask-answer-on-light.png vs alpha-ask-answer-OLD-control-on-light.png.
- Confidence: high. What would change my mind: the Checker's real light-backdrop capture still showing an edge (then check main's clampToDisplay or setSize minimums).

## D-U15 · UI · Notes window density and sidebar
- Question: how to get the reference's grey sidebar and lighter, smaller type without inventing out-of-scope parts?
- Options: CSS grey sidebar now vs waiting for real vibrancy from Shell; title 21-22px (the brief's "1.5x too big") vs 24px vs proportional 26px.
- Pick: CSS grey sidebar (gradient #dcdce1 to #d4d4d9) with Shell asked for optional real vibrancy; no "History" label (the reference has none); rows 33px, 13.5px titles, 19px chips, full-radius blue "N uses" pills; time kept at the right (F55); note title 24px/600, body 14px; "Start Glint" can't wrap.
- Why: the reference sidebar renders (181,181,186), but it's dimmed in that screenshot; a lighter grey reads as a vibrancy sidebar without looking disabled. 22px looked right in the Checker's 1000px window but small next to the reference at 1250px; 24px sits between (the reference's 32pt title at 1250 is 25.6px at 1000).
- Evidence: test-output/ui/history.png, history-1000.png, cmp-history-after.png; notes-history.png samples (U7); tests/screens.spec.mjs sets 1000x720.
- Confidence: med. INFERRED: the reference sidebar's undimmed colour. What would change my mind: Shell enabling vibrancy (then switch to a translucent sidebar), or judges still calling the list sparse with real data (then 30px rows).

## D-U16 · UI · Settings modal scrim, centring, hover row and an About pane
- Question: the sheet sat on a near-white scrim near the top; the sidebar looked empty. What to change without fake entries?
- Options for the sidebar: leave General/Keybinds only; add an About pane backed by app:info; add placeholder rows.
- Pick: scrim rgba(18,18,22,.24), sheet centred (place-items:center), 880x620 max; keybind rows 33px; the hovered row, or the first row while none is hovered, shaded #f2f2f3 (settings.png shows the first row shaded under the cursor). Sidebar: General, Keybinds, a "Glint" label, About (version, platform, notes folder from app:info), Quit Glint.
- Why: About shows only real data Glint already has, and the notes folder is useful. Calendar/Profile/Language/Sign-out stay out (D10).
- Evidence: test-output/ui/settings-keybinds.png, settings-about.png, cmp-settings-after.png; settings.png hover (244,244,245).
- Confidence: med. INFERRED: the scrim's darkness (the reference dims only lightly; the brief asked for darker). What would change my mind: judges calling the scrim too dark against the reference (then .14).

## D-U17 · UI · Vibrancy sidebar with a solid fallback (repair round 2)
- Question: with Shell's NSVisualEffect 'sidebar' window, how dark should the see-through column be, and what happens without it?
- Options: fully clear (material only); a light tint; a mid-grey tint to land on the reference's tone.
- Pick: `html.glint-vibrancy` makes html/body transparent; `.history` gets rgba(96,96,106,.26) over the material; title bar and note pane stay opaque #fafafa. Without the class, a solid grey gradient #d6d6db to #cfcfd5.
- Why: over a dark wallpaper like the reference's, this renders (178,177,176) against the reference's (181,181,186), and over a colourful backdrop the colour shows through. The material alone was too light to match.
- Evidence: test-output/ui/history-vibrancy-{light,busy,dark}.png (real screen captures), cmp-r2-notes.png, U13 samples.
- Confidence: med. INFERRED: the reference's tint may include a dimming overlay. What would change my mind: judges calling the column too dark over the Checker's wallpaper (then .18).

## D-U18 · UI · Note pane frame: pinned pills, toggle in the corner, centred search
- Question: how to pin the pills over the content and move the toggle without breaking scrolling or tests?
- Options: `position: sticky` in the content flow (old; sat mid-page on short notes); `position: fixed` (window-relative, wrong with the sidebar); the pane as a fixed frame with an inner scroller and absolutely placed pills/toggle.
- Pick: the third. #note-pane is a non-scrolling frame; #note-scroll scrolls; #note-float sits 18px above the bottom, centred; #toggle-list at top 10 / left 12. Title bar 44px, search 28px tall and up to 512px wide, centred.
- Why: matches the reference's placement whatever the note length, and keeps every id the tests use.
- Evidence: notes-history.png (pills over "Meeting Context" text, toggle at the pane's top left, search 512pt centred); cmp-r2-notes.png.
- Confidence: high.

## D-U19 · UI · Document typography for the note
- Question: what sizes for the title, section headings, tabs and body, measured at the reference's scale?
- Pick: title 29px/500 (reference cap 21-22px vs Glint's 17px at 24px); "Action Items" 20px/500 like "Next Steps" (cap 15px); summary topics (h1-h3 and bold-only paragraphs) 15px/600 like "Meeting Context" (cap 11px); body and bullets 15px #4b4b53 with grey markers and a 28px indent; tabs as 12.5px text with an underline on a hairline; the date chip carries the time, and the separate date line is gone. A plain-prose summary gets an "Overview" heading (INFERRED: real summaries come back as plain paragraphs, and the reference note reads as headed sections).
- Why: measured, not guessed; the tabs stay (in scope) but no longer look like an app control.
- Evidence: U11 measurements; U13 title cap 21pt in history-vibrancy-dark.png.
- Confidence: med. What would change my mind: a judge reading "Overview" as invented content (then drop it and keep plain prose).

## D-U20 · UI · Page shots vs screen captures for the dashboard
- Question: page screenshots render the see-through sidebar dark. How should ui_shots show the dashboard?
- Pick: page shots (`snap`) remove `glint-vibrancy` and say so in their note (the solid fallback); history-vibrancy-* are real `screencapture -R` captures of the real window over a backdrop window, with protection set off and checked first.
- Why: page shots can't composite the native material; a capture of the real screen is the only honest view of it.
- Confidence: high.

## D-U21 · UI · Sidebar tint and plain rows (repair round 3)
- Question: how dark should the see-through sidebar be, and how should rows look?
- Options for the tint: keep .26; raise the alpha on the same grey; a fully opaque grey.
- Pick: rgba(96,96,111,.34) over the material (fallback #b7b7bc). Rows as plain text with no hover fill, a faint selected wash, duration as grey text, blue "N uses" pill, time at 30% black.
- Why: solved from round 2's measurement ((191,191,192) at .26 means the material is ~224); .34 with a slightly blue tint gives (181,181,184) over a light backdrop against the reference's (181,181,186). It stays translucent, so it moves a little with the wallpaper ((172,169,171) over a dark one).
- Evidence: U14/U16 samples; test-output/ui/history-vibrancy-{light,busy,dark}.png; cmp-r3-notes.png.
- Confidence: med. What would change my mind: the Checker's wallpaper rendering it clearly darker than the reference (then .30).

## D-U22 · UI · Title kept at 29px/500 after measuring
- Question: DeepSeek (code-only) says ~32pt bold; Opus (images) says close. Which?
- Pick: no change. In the compare image the reference cap is 22px (round C, ~1px overshoot) vs Glint 21px, and stems are 3px vs 3-4px.
- Why: measured at the shared scale; a bold 32px title would overshoot both.
- Evidence: U14 measurements.
- Confidence: high. What would change my mind: a measurement on a flat-topped capital in the reference showing more than 22px.

## D-U23 · UI · Back arrow and search submit behaviour
- Question: what do the back arrow and the ↗ button do in Glint, which has no web-style navigation?
- Pick: back walks a stack of previously viewed {note, tab}, closes Settings first if it's open, ⌘[ too, disabled when the stack is empty. ↗ / Enter opens the first session matching the search text (the field still filters as you type); ⌘K focuses it.
- Why: real behaviour for both controls the reference shows, no fake features. "Ask anything" from the search field isn't built, so submit opens the best match instead (INFERRED stand-in).
- Evidence: test-output/ui/nav_check.log (13/13 PASS).
- Confidence: med. What would change my mind: the Lead wanting the search field to send an ask to the AI (needs an AI-side contract).

## D8 · Lead · Pass thresholds, fixed before the Checker runs
- Question: what counts as a pass for each functional test, so a check can't be gamed or loosened later?
- Pick (fixed now; changing one later needs a new decision entry with a reason, and never just to make a test pass):
  - Start: `npm start` launches with exit-free output showing hotkeys registered and the overlay window created.
  - Hotkey: a real OS-level key press (osascript/CGEvent, not test:triggerHotkey) of ⌘\ toggles overlay visibility both ways. If posting keys is blocked for lack of Accessibility permission, the result is BLOCKED (Waiting on me), not pass. Always on top: alwaysOnTop true at level screen-saver, AND a capture with protection temporarily off shows the overlay's pixels on top of another app window covering the same area.
  - Typed ask: a non-empty answer from model deepseek-v4-pro, received as streamed chunks, that is factually right for a question with a checkable answer.
  - Screenshot ask: a real window showing a random code generated per run; the OCR text contains the code and the answer contains the code. usedScreenshot is true.
  - Transcription: a `say` clip through the app's session pipeline (GLINT_AUDIO_FILE). WER at most 10% after normalisation (lowercase, no punctuation, numbers as words).
  - Live suggestions: within 60 s of the last segment, the overlay DOM shows a non-empty Live Insights summary and at least 1 action item derived from the clip (for example its question).
  - Content protection: one screencapture with the overlay open and protection on. A control window with a random marker must be found in OCR of the capture (proves capture works); the overlay's random marker must NOT be found. Positive control: the same capture with protection off must find the overlay marker.
  - Notes: after stop, session.json and notes.md exist with non-empty transcript, summary and at least 1 action item, and the dashboard history list shows the session title.
- Why: each check is paired with a control so a missing permission or a blank capture can't produce a pass.
- Confidence: high.

## Checker

## D-C1 · Checker · Control windows from a separate Electron app
- Question: what "other app window" should the on-top, protection and screenshot tests use?
- Options: TextEdit/Safari driven by AppleScript; a BrowserWindow inside Glint's own process; a separate Electron process.
- Pick: a separate Electron process (tests/fixtures/control-app) launched through Playwright, which places plain HTML windows at exact positions.
- Why: it is another app to the window server, it is never content-protected, and it needs no Automation permission (AppleScript to System Events is blocked by a pending prompt). A window inside Glint could pick up Glint's protection settings and prove nothing.
- Evidence: a_ontop_protection_off.png (bar over the control window), f captures.
- Confidence: high. What would change my mind: the Lead wanting a native app (TextEdit) specifically; that works once Automation is allowed.

## D-C2 · Checker · Real key press route and when the hotkey test is BLOCKED
- Question: how to send a real ⌘\ and when to call the result BLOCKED instead of FAIL?
- Options: osascript System Events only; a CGEvent helper only; both.
- Pick: both. CGEvent (tests/fixtures/keypost.swift, HID tap) first, then osascript with a 10 s AppleEvent timeout. PASS if either flips visibility both ways. BLOCKED only if CGPreflightPostEventAccess is false AND osascript fails. FAIL if a key was accepted but nothing flipped.
- Why: D8 allows osascript or CGEvent; the helper's preflight reports permission without prompting, so BLOCKED is backed by a fact, not a guess.
- Evidence: a_hotkey_ontop.log (`postEventAccess:false`, osascript -1712, dialog seen on screen).
- Confidence: high.

## D-C3 · Checker · Pixel and OCR checks robust to colour management and translucency
- Question: how to judge "overlay pixels drawn over the other window" and "marker present/absent" reliably?
- Pick: sample the control window's colour from the same capture (it lands at 234,51,247 for #ff00ff), then count matching pixels in the bar rect with a ±14 tolerance; OCR with both Vision and tesseract. Absence needs all engines (and a crop OCR) to miss; presence needs any engine to hit.
- Why: a fixed RGB fails on a colour-managed capture (C3 run 1). Vision missed light text on the translucent panel while tesseract read it (C5), so one engine alone would turn a real pass into a false fail; for absence, more engines make a false pass less likely.
- Confidence: high.

## D-C4 · Checker · Re-running c after an environment failure
- Question: c failed in run 1 because a system dialog covered the code. Is a re-run allowed under D8?
- Pick: yes, with identical checks and a new random code, moving only the window position. Run 1 is kept and logged as a failure with its cause.
- Why: the failure came from a dialog my own hotkey probe triggered, not from Glint. The OCR read the covered text and the model answered it faithfully, so run 1 even shows the pipeline working. The threshold was not changed.
- Evidence: c_run1_dialog_covered.png, bc_ask_run1_dialog_covered.log.
- Confidence: high.

## D-C5 · Checker · Screen captures for the council
- Question: how to frame Glint screens when a pending macOS dialog and notifications sit at the top/centre of the screen?
- Pick: overlay shots in a clean bottom-left area on a neutral 16:9 backdrop (the overlay moved with overlay:move); ask-answer on a light document column at the far left; dashboard shots as window-only captures (`screencapture -l`). Protection OFF for all (settings.json in the screens data dir). The ask answer is scrolled to the top before capture, as a user would, to show the question pill like the reference.
- Why: the dialog is the user's to answer; the layout keeps it out without touching it. Downside: notes-history lacks the overlay bar and wallpaper that the reference shows (INFERRED small cost in closeness).
- Confidence: med. What would change my mind: once the dialog is answered, re-run `npx playwright test -c tests/playwright.config.mjs screens` with a top-centre layout.

## D9 · Lead · How the council judges the screens
- Question: what do judges see, and how does a judge that can't see images score?
- Pick: each judge gets the 5 side-by-side images (Reference on the left, Glint on the right) and scores visual closeness 0-10 per screen: layout, proportions, colour, translucency, type, iconography, overall feel. The wording, the product name and the backdrop content are not part of the score, because Glint uses its own branding and real data by design. The prompt names no target score. If DeepSeek V4 Pro (text-only) can't open images, it scores from research/screens/SCREENS.md plus Glint's renderer code, and that score is recorded as "code-only" (the user's CLAUDE.md council rule).
- Why: like-for-like scoring without priming the judges.
- Confidence: med (a code-only score is a weaker signal than one from the images).

## D10 · Lead · Council round 1 outcome and repair scope
- Scores (DeepSeek code-only / Opus / Codex): overlay-bar 8/7.5/5, ask-answer 7/6/7, live-suggestions 7/6.5/4, notes-history 7/5/6, settings 6/8/8. Every screen has at least one judge under 7, so all 5 go to repair round 1 (UI agent).
- Repairs taken (two or more judges agree, or a clear bug): panel translucency (darker, flatter, less blur), compact proportions (bar without the timer, narrower Live Insights, smaller headings, tighter rows), the stop button's look, keycap fill, the clipped light rectangle behind the ask panel (bug), quick-action chip weight and fade, a notes window with a translucent grey dense sidebar, blue "N uses" pills, smaller title, the "Start Glint" wrap bug and the lowercase "history" label, plus a settings modal with a darker scrim, centred, with a hover row and tighter rows.
- Repairs refused (scope): no Share pill, no Next-Steps follow-up email card, no fake Calendar/Profile/Language/Sign-out entries (all out of scope in FEATURES.md: F59, F61, F83, F85, F86). No switch to the newer pill above the ask panel: the user chose the mid-2025 bar for the overlay (D6). These stay as listed differences in REPORT.md.
- Council ordering for later rounds (user's CLAUDE.md): DeepSeek and Opus re-score first; Codex comes back once both are at 9/10 or above, or at the latest after the last repair round, so its scores aren't left stale.
- Confidence: med.

## D11 · Lead · When Codex re-scores (user decision, supersedes the Codex line in D10)
- Question: in council rounds after round 1, when does Codex GPT-6 Luna come back to re-score?
- Options: (a) once DeepSeek and Opus both give 9/10+ (user's CLAUDE.md default, D10); (b) once DeepSeek and Opus both give every screen 7/10+, the BRIEF's bar.
- Pick: (b), by the user's instruction for this goal (2026-11-07 02:35 AEDT). Rounds 2+ run DeepSeek V4 Pro and Claude Opus 5.5 first. When both give every screen 7/10 or more, Codex re-scores. Codex also re-scores at the latest after a screen's last repair round, so its scores aren't left stale. The pass bar is unchanged: each screen needs 7/10+ from every judge that scored (D8, BRIEF). Codex's round-1 scores stand until it re-scores.
- Why: the user said so. It brings Codex in as soon as the other two judges reach the BRIEF's bar, instead of waiting for 9.
- Evidence: user message in the Lead thread.
- Confidence: high.
- What would change my mind: a new user instruction.

## D-C6 · Checker · notes-history captured at the reference's window size
- Question: the UI agent noted that notes-history was captured at 1000×720 pt against a ~1250×900 reference, which makes Glint's text look about 1.25× larger in the side-by-side. Can the capture match without faking anything?
- Options: keep the 1000×720 window-only capture; set the real dashboard window to the reference's size and frame the region the way the reference is framed.
- Pick: the reference image is 2502×1800 px at 2×, i.e. 1251×900 pt, with wallpaper, the overlay bar at top centre and a ~1200×800 pt window. I capture a 1251×900 pt screen region containing a neutral wallpaper window from the control app, Glint's real overlay bar at its default top-centre spot, and Glint's real dashboard set to 1200×800 pt with `setBounds`. Same `screencapture -R` as the overlay shots.
- Why: every pixel is the real app at a window size a user can choose; it's like-for-like scale with the reference. The pending dialog that forced the window-only capture (D-C5) is gone.
- Evidence: test-output/checker/compare/notes-history.png (C16).
- Confidence: high. What would change my mind: the Lead preferring the default window size (1100×760) as "what users see first".

## D12 · Lead · Council round 2 outcome and repair round 2 scope
- Scores (DeepSeek code-only / Opus): overlay-bar 8/8.5, ask-answer 8/7, live-suggestions 8/8, notes-history 6/6.5, settings 7/8. Only notes-history is under 7, from both judges, so it alone gets repair round 2. The other four screens stay at 1 round used and wait for Codex (D11).
- Repairs taken for notes-history (both judges, or my own look at the compare image): a translucent, vibrancy-backed sidebar like the reference (needs Shell: dashboard window vibrancy; UI agent request from round 1); pills "View Transcript" / "Resume Session" pinned at the bottom of the note pane, floating over content, instead of mid-page; a narrower centred search field; the sidebar toggle moved to the note pane's top left as in the reference; lighter, smaller tabs so the pane reads like a document; section headings styled like the reference's "Next Steps"/"Meeting Context"; title size measured against the reference at the same scale (round 1 said too big at the old 1000x720 capture; the capture now matches the reference's size, D-C6). Capture side (Checker): a longer real `say` conversation with several topics and several real sessions in the history list, so the note and list hold as much real content as the reference. Real data only, no fixtures; dates stay real.
- Refused: the reference's newer floating capsule bar (Glint's overlay is the mid-2025 bar app-wide, D6), Share, the Next Steps follow-up email card (F59 out of scope), an avatar/accounts. Settings' scrim stays as is: round 1 asked for darker, round 2 Opus prefers the reference's near-white wash, and both judges now score settings 7+.
- Confidence: med.
- What would change my mind: round 3 scores showing the longer real note doesn't close the gap, or a judge marking a refused item as the main reason under 7.

## D-C7 · Checker · Real data for the notes-history screen (per D12)
- Question: how to make the history list and the open note comparable to the reference (many rows, a long sectioned meeting) using real data only?
- Options: copy other agents' smoke-test sessions; edit session.json; record new real sessions.
- Pick: record 8 new real sessions in one Glint run: 7 short single-topic `say` clips (standup, design review, hiring, marketing, customer call, budget, release) and one 84.6 s two-voice meeting (Samantha as Maya the customer, Daniel as Tom the vendor) covering pilot results (6 weeks, 40 agents, handle time 9 -> 6.5 min, CSAT 81% -> 88%), pricing ($30 list, $24 annual for 200 seats, ~$57,600/yr), security (SOC 2 Type 2 today, DPA by Wednesday), rollout (billing team in December, support in January, two trainings) and agreed next steps. Every clip goes through `session.start({ audioFile })` at realtime pace -> real WhisperX -> real DeepSeek notes. No edits, real timestamps; the longest session's note is shown. Script: test-output/checker/notes-clips/script.txt.
- Why: everything on screen is the app's own output for real audio. Other agents' sessions were test fixtures for their own checks; editing files would be faking.
- Limits: every row is "Today" (the reference spans several days); real dates can't be back-dated without editing.
- Confidence: high.

## D13 · Lead · Council round 3 (notes-history) and repair round 3 scope
- Scores: DeepSeek 7 (code-only), Opus 6. Still under 7 from Opus, so notes-history gets repair round 3 (rounds used: 3 of 5).
- Repairs taken (both judges, or Opus's image-based point I can verify in the compare image): (1) a back arrow at the left of the title bar that really navigates back (previous note/view); (2) the search field ends in a small dark round ↗ submit button instead of the ⌘K keycaps (the ⌘K shortcut keeps working); (3) sidebar: darker see-through tint like the reference, plain text rows without a filled background (only a subtle selected state), duration as small grey text, the time column lighter (F55 keeps it); (4) title weight/size measured against the reference. Capture side (Checker): real asks during the long session so its blue "N uses" pill shows, and more real sessions so the list fills the sidebar's height.
- Refused: the reference's newer floating capsule bar (D6), Share pill, follow-up email card, avatar (F59/F61/F83/F85/F86 out of scope); the Summary/Transcript/Usage tabs stay (F53 in scope, from Cluely's own newer notes view); a single "Today" date group stays because session dates are real and can't be backdated without editing session files.
- Confidence: med. What would change my mind: round 4 showing the refused items as the only remaining reason under 7; then the screen is reported with that reason instead of faking content.

## D-C8 · Checker · More real sessions and real usage for notes-history (per D13)
- Question: how to fill the sidebar (~14-16 rows) and show a real "N uses" pill without editing data?
- Pick: 7 more short single-topic `say` clips (support escalation, Globex partnership, security office hours, churn dashboard, office move, board prep, mobile retro), for 15 real sessions in total with the D-C7 clips; and 3 real asks during the long meeting through the app's own ask API (`glint.ask.ask`, the same IPC the overlay input uses): "How much did average handle time drop in the pilot?", "What price per seat did Tom offer for 200 seats on an annual contract?", "What do we still need before legal will sign?". The asks use `withScreenshot: false`, so the user's own screen content is not OCR'd and sent to DeepSeek; they still use the live transcript.
- Why: the "uses" count is the session's real usage record (ai:exchange -> usage[]), so it reflects real DeepSeek exchanges. Typing into the overlay UI would attach a screenshot by default and send whatever else is on the user's screen.
- Confidence: high.

## D14 · Lead · Codex round-4 re-score and repair round 2 scope (overlay-bar, live-suggestions)
- Scores (Codex, images): overlay-bar 3, ask-answer 8, live-suggestions 5, notes-history 8, settings 8. ask-answer (8/7/8), notes-history (7/7/8) and settings (7/8/8) now have 7+ from every judge that scored: passed. overlay-bar (8/8.5/3) and live-suggestions (8/8/5) go to repair round 2.
- Codex's reasons are about composition, not the overlay's styling: a four-person call grid behind the overlay vs the reference's single video; the panel "overlapping the grid"; the live-suggestions panel holding much more content than the reference's early state. I compared the images myself: the bar and panel are at the same proportion of the frame as the reference (bar ~40-45% and panel ~56% of the frame width in both), so the scale is right; the backdrop and the captured state differ.
- Repair taken (Checker owns the capture, as with D-C6 for notes): (1) a single-speaker, full-frame call backdrop (one CSS-drawn person filling the frame, speaker view, no tile grid or control row), still a neutral test window with no photos or Cluely imagery; (2) overlay-bar framed like the reference: the top of the real screen including the real macOS menu bar, the bar at its real default position, the backdrop filling the screen below, keeping the bar/frame width ratio of the reference; (3) live-suggestions captured at the reference's early state from a real session: the earliest real moment that shows the Actions list (after the first transcript segment, with the summary still short or "Start of Summary"), not a fixture. No UI code changes this round: the two other judges score the styling 8-8.5 and Codex names no styling issue except "bar larger", which the measured ratio doesn't support.
- Codex's scores were given despite the prompt asking judges not to penalise background content; they are recorded as given, not discounted.
- Order (D11): DeepSeek and Opus re-score the two screens first; Codex re-scores them once both are 7+.
- Confidence: med. What would change my mind: Codex still scoring under 7 with the reference's backdrop type and state; then the next round goes to UI styling (bar size and weight).

## D-C9 · Checker · overlay-bar and live-suggestions capture (per D14)
- Question: how to remove the composition gaps Codex named (four-tile grid, overloaded panel) while keeping everything real?
- Pick:
  - Backdrop: one CSS-drawn speaker filling the frame (speaker view), neutral wall, shelf and plant shapes, a name tag; no photos, no tiles, no control row. Pinned at the `floating` window level so another app can't come in front mid-capture (it did in try 2), still below Glint's screen-saver-level overlay.
  - overlay-bar: `screencapture -R` from y=0, so the real macOS menu bar is in frame; Glint's bar left at its real default top-centre position; width = measured bar width / 0.40 (the reference's ratio), 16:9. State from a real session: recording during 6 s of leading silence, Live Insights idle.
  - live-suggestions: the reference's early state, captured from the same real session at the first real transcript segment, before any insights with content arrive: "Start of Summary / No content yet..." plus the UI's own "Suggest follow-up questions" row. A short real clip (one sentence after 6 s of silence) makes this timing reliable (insights with content arrived 3.1-3.4 s after the first segment; captures finished within 0.4 s). Region below the menu bar, width = bar / 0.45 (the reference's ratio), 16:9.
- Why: the panel content and states are the app's own output at real moments. Only the backdrop window is a test fixture, as before.
- Note: the real menu bar shows whatever app is frontmost on the user's machine at capture time.
- Confidence: high. What would change my mind: the Lead wanting the live-suggestions state with real model-generated actions (that state exists 3 s later, with a longer summary).

## D15 · Lead · USER DECISION: stop the look-and-feel loop; accept overlay-bar and live-suggestions
- Question: keep repairing overlay-bar and live-suggestions until every judge scores 7+ (up to 5 rounds each), or stop?
- Pick (user, Ishaan, 2026-11-07): "the UI is good enough as it is". Stop the look-and-feel repair loop: no more UI repair rounds or council re-scores. overlay-bar and live-suggestions are recorded as "accepted by the user after repair round 2" with their latest scores (overlay-bar DeepSeek 8 / Opus 7 / Codex 3; live-suggestions DeepSeek 8 / Opus 6 / Codex 5). This overrides goal condition 5's 7/10 bar for those two screens only. The other three screens passed on their own (7+ from every judge).
- In flight at the time: council round 5. Opus had already returned (overlay-bar 7, live-suggestions 6; test-output/council/r5-claude-opus-5-5.md); the DeepSeek V4 Pro run was cancelled with task_cancel before it returned. Codex never re-scored the D14 recapture.
- Remaining work, per the user: functionality only (live-mic "Me" fix verified live by the Checker; mute goes under Waiting on me rather than a faked pass), finish REPORT.md, check for leftover processes, then stop. No packaging or new features (a separate phase).
- Confidence: high (user instruction). What would change my mind: a new user instruction.

## Closing statement · Lead · 2026-11-07 04:05 AEDT
- Final decisions in force: D6 (mid-2025 bar), D7 (swapped live-suggestions reference), D8 (thresholds, never loosened), D11 (Codex re-scores once DeepSeek and Opus give 7+), D15 (user accepted overlay-bar and live-suggestions after repair round 2 and stopped the look-and-feel loop).
- No Cluely app, binary, source repo, leaked code or third-party clone was used for any decision in this file. All evidence is public pages, public videos, press, reviews and social posts, plus measurements of Glint itself.

# Glint REPORT

Checker run: 2026-11-06, Claude Opus 5.5 (fresh agent, built nothing). All tests drive the real app (`electron .` via Playwright `_electron`, GLINT_TEST=1) with real DeepSeek calls, real WhisperX, real Vision OCR and real `screencapture`. Nothing is mocked; no UI fixtures are used. Thresholds are D8's (DECISIONS.md), applied as written.

Run everything: `node tests/npm_start_capture.mjs 15` (start check), then `npx playwright test -c tests/playwright.config.mjs` (a, b+c, d+e+g, f, screens, ask_screen). Updated after the user's pause/resume (CLONE_LOG C8-C12). Per-test records: `test-output/checker/results/*.json`; logs: `test-output/checker/*.log`.

## Parity

In-scope FEATURES.md rows. "Built" is what the app has; the test column says what the Checker actually exercised. Rows not exercised say why.

| ID | Feature | Status | Covered by |
|---|---|---|---|
| F01 | Floating overlay widget (always on top, translucent) | built | a_ontop PASS (level screen-saver, drawn over another app's window) |
| F02 | Show / hide overlay ⌘\ | built | a_hotkey PASS: a real CGEvent ⌘\ press hid the overlay and a second press showed it again |
| F03 | Ask AI about screen / Assist ⌘↵ | built (⌘↵ key not tested) | Assist chip with screenshot (ask_screen and screens runs: `usedScreenshot:true`, deepseek-v4-pro). ⌘↵ wasn't pressed: key posting only became possible after the pause, and it isn't a Verification item |
| F04 | Typed chat input, Enter to send | built | b, c PASS (typed into `#input`, Enter) |
| F05 | Follow-up keeps the thread | built | bc_ask.log: second ask logged `thread=2`; not a separate gate |
| F06 | Clear conversation ⌘R | built (code), not tested | no Verification item |
| F07 | Move overlay | built (IPC path) | screens run moved the overlay with `overlay:move` (log `overlay moved to ...`); drag and ⌘-arrow keys not tested (needs a real pointer / key posting) |
| F08 | Scroll response ⌘⇧↑/↓ | built (code), not tested | no Verification item |
| F09 | Close / collapse chat | built | `#ask-close` used in screens run; not asserted |
| F10 | Status states | built | stages `capturing > ocr > thinking > streaming` in b/c; session statuses `starting/recording/...` with "Loading transcription model..." in deg_session.log |
| F11 | Ambient chat without a session | built | b, c PASS (no session running) |
| F12 | Markdown answers | built | screens/ask-answer.png (bold lead-ins, bullets); e (bold section headings in Live Insights) |
| F14 | Screen context always on | built | b: typed ask used a screenshot by default (`usedScreenshot:true`, settings default) |
| F20 | Start / stop session (Listen) | built | d/e/g PASS: started with the bar's `#listen` button, stopped with `#stop`; ⌘⇧\ key not tested |
| F21 | Mic + system audio capture | built | file source (d); live mic + system audio (C27): the speaker phrase transcribed as `Them` from the system tap, the mic copy dropped as echo; mic-only speech transcribed as `Me` |
| F22 | Speaker split Me / Them | built | `them` from file (d) and system audio (C27); `me` from the live mic (C27, WER 0%) |
| F23 | Live transcript view (Show Transcript) | built (UI present), not tested | button visible in e/screens captures; toggle not exercised |
| F24 | Live Insights rolling summary | built | e PASS |
| F25 | Dynamic actions (questions, definitions, follow-ups) | built | e PASS (❓ question, 📝 action item, 💬 follow-up from the clip); clicking an action not tested |
| F26 | Assist | built | screens run (real Assist answer from transcript + screen) |
| F27 | What should I say? | built (UI), not tested by Checker | no Verification item (AI agent's smoke covered it, CLONE_LOG I6) |
| F28 | Follow-up questions | built (UI), not tested by Checker | as F27 |
| F29 | Recap | built (UI), not tested by Checker | as F27 |
| F40 | Hidden from screen share | built | f PASS (protection on: overlay marker absent, control found; off: overlay marker found) and a_ontop (bar rect 100% background with protection on) |
| F41 | Toggle in settings + widget | built (setting) | f/a toggled `hideFromScreenShare` through settings:set and the capture changed accordingly; the checkbox UI itself was not clicked |
| F42 | Dashed indicator | built | visible in e_live_insights_overlay.png and g_dashboard_history.png (protection on); by eye only |
| F43 | Dashboard also hidden | built (flag), not capture-tested | dashboard shows the dashed protected border in g_dashboard_history.png; no capture test of the dashboard |
| F44 | Click-through overlay | built (code), not tested | needs a real pointer |
| F50 | Dashboard window | built | g PASS |
| F51 | Auto summary after session | built | g PASS (deepseek-v4-pro, 554 chars) |
| F52 | Action items | built | g PASS (2 items) |
| F53 | Summary / Transcript / Usage tabs | built (tabs present) | tabs visible in g screenshot; only Summary content checked |
| F54 | Copy transcript / summary | built (buttons), not tested | clipboard not checked |
| F55 | History list grouped by day | built | g PASS ("Today" group, title, duration chip; uses chip in screens/notes-history.png) |
| F56 | Auto-titled sessions | built | g PASS (title "Security Review and Database Migration Kickoff") |
| F57 | Resume session | built (button), not tested by Checker | Audio agent tested resume (CLONE_LOG A9) |
| F70 | Settings window | built | screens/settings.png (General, Keybinds, Quit) |
| F71 | Keybinds list | built | screens run read the Keybinds pane text (all 7 bindings with keycaps) |
| F76 | Quit | built (menu item), not tested | Quit Glint visible in settings; tests quit via app.close |

## Test results

| Test | Result | D8 threshold | Measured | Evidence |
|---|---|---|---|---|
| Start (`npm start`) | PASS | launches with exit-free output showing hotkeys registered and the overlay window created | build ok; 11/11 (correction: earlier "13/13" was a miscount; the 7 hotkeys bind 11 accelerators) accelerators `isRegistered=true`; still running at 15 s; clean exit on SIGTERM, 0 leftovers. Note: there is no explicit "overlay created" line; the `whileVisible` keys registering at +4.0 s is the evidence the overlay came up (they register only while it is shown, D-S4) | test-output/checker/npm-start.txt |
| a. Hotkey ⌘\ (real OS key press) | PASS | real OS ⌘\ press toggles visibility both ways; BLOCKED if key posting lacks permission | Run 3 (after the user granted Accessibility): CGEvent route, `postEventAccess:true`, visible true -> false -> true. Runs 1-2 were BLOCKED: CGPreflightPostEventAccess=false; osascript first -1712 (Automation prompt waiting), then `not allowed to send keystrokes (1002)` (kept: a_hotkey_ontop_run2_blocked.log, results/a_hotkey_run2_blocked.json) | test-output/checker/a_hotkey_ontop.log, results/a_hotkey.json |
| a. Always on top | PASS | alwaysOnTop true at level screen-saver AND a protection-off capture shows overlay pixels over another app window covering the same area | alwaysOnTop true, level `screen-saver`; focused magenta window from a separate app under the bar: control colour fills 0.2% of the bar rect with protection off (overlay drawn on top), 91-100% of the control strip below it, 100% of the bar rect with protection on (same in all 3 runs); OCR of the bar crop: `Ask  Show/Hide` | a_ontop_protection_off.png, a_ontop_bar_crop_protection_off.png, a_ontop_bar_crop_protection_on.png |
| b. Typed ask | PASS | non-empty answer from deepseek-v4-pro, streamed chunks, factually right | "What is 36 multiplied by 89?" -> `3204` (correct), model deepseek-v4-pro, 2 chunks (first at 4.3 s), shown in the overlay DOM. Numbers are random per run. Earlier run: 85×97 -> 8245, also correct | bc_ask.log, b_typed_ask_overlay.png |
| c. Screenshot ask | PASS | real window shows a random code; OCR contains it; answer contains it; usedScreenshot true | window from a separate app showed `QUARTZ 100-285`; question did not contain it; answer `QUARTZ 100-285`; usedScreenshot true, 1669 OCR chars; Vision and tesseract both find it in the image the app captured (GLINT_KEEP_SCREENSHOT). Run 1 FAILED for an environment reason: the pending System Events prompt covered the code, OCR read `512-790`, and the model answered that (kept: bc_ask_run1_dialog_covered.log, c_run1_dialog_covered.png). Run 2 moved the window clear of the dialog | bc_ask.log, c_app_screenshot_kept.png, c_screenshot_ask_overlay.png |
| d. Transcription | PASS | `say` clip through GLINT_AUDIO_FILE; WER <= 10% after normalisation | WER 0.0% (0 edits / 54 words); 3 segments, source `file`; "twelve" transcribed as "12" and normalised back | deg_session.log, clip_deg.wav |
| e. Live suggestions | PASS | within 60 s of the last segment: non-empty summary + >=1 action item derived from the clip in the overlay DOM | in DOM 0.1 s after the last segment arrived: summary with 2 bold sections; actions `❓ Can you send the signed contract to their legal team by Friday?`, `📝 Send signed contract ...`, `💬 Suggest follow-up questions about the database migration` (deepseek-flash). The UI's static "Suggest follow-up questions" filler was excluded from the count. Note: the clip's last question (mobile app delivery date) was not among the actions at check time | deg_session.log, e_live_insights_overlay.png |
| f. Content protection | PASS | protection on: control marker found, overlay marker absent; protection off: overlay marker found | markers `OVLH9D4RA` (typed in the overlay input) and `CTLNVEPKP` (other app). On: control found by Vision and tesseract; overlay marker absent in Vision, tesseract and a Vision OCR of the overlay crop. Off: overlay marker found by tesseract (Vision missed it on the translucent panel; the crop shows it drawn) | f_capture_protection_on.png, f_capture_protection_off.png, f_overlay_region_protection_on.png, f_overlay_region_protection_off.png, f_protection.log |
| g. Notes + history | PASS | after stop: session.json + notes.md with non-empty transcript, summary, >=1 action item; history list shows the title | both files written; 3 segments, summary 554 chars, 2 action items; notes.md has Summary / Action items / Transcript; dashboard `#history-list` shows "Security Review and Database Migration Kickoff" | g_dashboard_history.png, g_session.json.copy.json, g_notes.md.copy.md, deg_session.log |
| Optional: live mic (not a gate) | PASS (C27) | mic-only: >=1 `Me` segment with the spoken words; system on: the speaker phrase comes out as `Them` and isn't duplicated as `Me` (Lead's check, not D8) | Raw probe (`say -a 74` at output volume 13, input 56): mean −42.2 dB, max −27.6 dB. **System on**: mic chunk t=4.83 s voiced 1.94 s (peak −27.8 dBFS), not gated as silence, echo check `explainedBySpeakers=1.9s user=0.04s coupling=-28.6dB -> ECHO`, so not transcribed; `them [5.23-6.91s] "Testing the Glint microphone."` (WER 0%); 0 `Me`. **Mic only**: chunk t=0.29 s voiced 2.4 s (peak −25.9 dBFS) transcribed -> `me [4.89-7.21s] "Testing the glint microphone."` (WER 0%); helper nonZeroSamples 154,599. Both on the first try. History: C13 FAIL (gate too strict), C15 INCONCLUSIVE (speakers muted) | mic_live_r5_system.txt, mic_live_r5_miconly.txt, mic_probe_r5.txt |

### Regression after repair round 1 (2026-11-07, C14)

Full `npm run build`, then the same specs and thresholds, unchanged. No test depends on the removed `#timer`. Round-0 results and logs are kept in test-output/checker/round0/.

| Test | Result | Measured | Evidence |
|---|---|---|---|
| Start (`npm start`) | PASS | build ok; 11/11 accelerators `isRegistered=true`; running at 15 s; clean quit, 0 leftovers | npm-start.txt |
| a. Hotkey ⌘\ (real key press) | PASS | CGEvent route: visible true -> false -> true | a_hotkey_ontop.log |
| a. Always on top | PASS | level screen-saver; control colour 0.3% of the bar rect with protection off, 100% with it on; strip below 100% | a_ontop_protection_off.png |
| b. Typed ask | PASS | 78×48 -> `3744` (correct), deepseek-v4-pro, 2 chunks, shown in DOM | bc_ask.log |
| c. Screenshot ask | PASS | `QUARTZ 962-828` in the answer and in Vision + tesseract OCR; usedScreenshot true, 779 chars | bc_ask.log, c_app_screenshot_kept.png |
| d. Transcription | PASS | WER 0.0% (0/54) | deg_session.log |
| e. Live suggestions | PASS | summary + 3 clip-derived actions in the DOM 1.3 s after the last segment (deepseek-flash) | e_live_insights_overlay.png |
| f. Content protection | PASS | on: `CTL4NMK7U` found (Vision + tesseract), `OVLVJ36WH` absent in all three OCRs; off: overlay marker found (tesseract) | f_capture_protection_*.png |
| g. Notes + history | PASS | title "Security Review and Database Migration Planning", 3 segments, 245-char summary, 2 action items, title in the history list | g_dashboard_history.png |

### Regression after repair round 2 (notes/history only, 2026-11-07, C18)

Full `npm run build`; same specs and D8 criteria. Round-1 results kept in test-output/checker/round1/.

| Test | Result | Measured | Evidence |
|---|---|---|---|
| Start (`npm start`) | PASS | build ok; 11/11 accelerators registered; running at 15 s; clean quit, 0 leftovers | npm-start.txt |
| f. Content protection | PASS | on: `CTL3VEJWW` found (Vision), `OVLTX9YJJ` absent in all three OCRs; off: overlay marker found (Vision, tesseract and crop) | f_capture_protection_*.png |
| g. Notes + history | PASS | title "Security Review and Database Migration", 3 segments, 265-char summary, 2 action items, title in the history list; dashboard renders with the new styles (not blank) | g_dashboard_history.png |
| (d, e ran in the same spec) | PASS | WER 0.0%; live insights in the DOM | deg_session.log |

### Regression after the notes-shape fix (AI, D-I8, 2026-11-07, C21)

| Test | Result | Measured | Evidence |
|---|---|---|---|
| Start (`npm start`) | PASS | build ok; 11/11 registered; running at 15 s; clean quit, 0 leftovers | npm-start.txt |
| g. Notes + history | PASS | "Security Review and Database Migration", 3 segments, 503-char summary with 3 `###` sections, 2 action items, title in the history list. Quality note (not a D8 criterion): "Send the signed contract to the legal team by Friday" is now owned by "(Them)"; in the clip the other side asks us to send it (earlier rounds said "(Me)") | g_session.json.copy.json, g_dashboard_history.png |
| (d, e ran in the same spec) | PASS | WER 0.0%; live insights in the DOM | deg_session.log |

### Regression after notes-history repair round 3 + AI owner fix (D13, 2026-11-07, C23)

| Test | Result | Measured | Evidence |
|---|---|---|---|
| Start (`npm start`) | PASS | build ok; 11/11 registered; running at 15 s; clean quit, 0 leftovers | npm-start.txt |
| g. Notes + history | PASS | "Security Review and Database Migration", 3 segments, 404-char summary, 2 action items, title in the history list. Owners (not D8): "Send the signed contract to their legal team by Friday (Me)", "Provide the delivery date for the mobile app (Me)", both correct (the other side asks us) | g_session.json.copy.json |
| (d, e ran in the same spec) | PASS | WER 0.0%; live insights in the DOM | deg_session.log |


Threshold notes (applied as written, not loosened):
- Start: D8 asks for output "showing ... the overlay window created", but the app prints no such line. I counted the `whileVisible` hotkey registrations as that evidence. An explicit log line from Shell would make this unambiguous.
- Typed ask: "streamed chunks" is met by 2 chunks for a one-number answer. A minimum chunk count or a longer answer would make the streaming check stronger. Longer answers streamed in 7+ chunks (c, screens Assist).
- Live suggestions: "within 60 s of the last segment" can be met by insights computed from earlier segments, which is what happened here (0.1 s). The test still required the items to come from the clip.

Key-leak scan (2026-11-06 19:13 AEDT): the DeepSeek key was read in memory and compared byte-for-byte against 137 files (32.2 MB) in test-output/, tests/, REPORT.md, CLONE_LOG.md and DECISIONS.md. **0 hits** (test-output/checker/key_scan.txt). Re-run after repair round 1 (2026-11-07 03:01 AEDT): 247 files (52.1 MB), **0 hits**.

## Screens

Captured from real app data (real file-sourced session with real WhisperX + DeepSeek insights, real Assist ask, real saved sessions) with "Hide from screen share" OFF, so the dashed protected border does not show. Backdrops are neutral windows from a separate test app (CSS-drawn video call, a light document); no photos, no Cluely imagery. Council scores: Lead to fill in.

| Screen | Compare image | Glint capture | Capture note |
|---|---|---|---|
| overlay-bar | test-output/checker/compare/overlay-bar.png | test-output/checker/screens/overlay-bar.png | recaptured for repair round 2 (D14, D-C9, C25-C26; tests/call_screens.spec.mjs): single-speaker full-frame call backdrop (CSS person, no tiles, no control row), filling the screen below the menu bar at the `floating` level; the real macOS menu bar in frame; Glint bar at its real default top-centre position; region width = bar width / 0.40 (ratio 0.400, as in the reference), 16:9. State: real file-sourced session recording during 6 s of leading silence, Live Insights idle ("Start of Summary"), 0 segments before and after the capture. Accepted by eye on the 3rd checked try (try 2 rejected: the user's own app window covered the backdrop; try 3 fine but the person was cropped to a giant head, kept in round4/) |
| live-suggestions | test-output/checker/compare/live-suggestions.png | test-output/checker/screens/live-suggestions.png | recaptured for repair round 2 (D14, D-C9, C25-C26): same speaker backdrop; region below the menu bar, width = bar width / 0.45 (ratio 0.450, as in the reference), 16:9, bar at its default position. State: the reference's early state from a real session, captured 0.28 s after the first real transcript segment and before the first insights with content (those arrived 3.1 s after it): "Start of Summary / No content yet..." + Actions "💬 Suggest follow-up questions" (the UI's own row once speech exists; first row highlighted by the UI's default style). Clip: one short real `say` line after 6 s of silence, so timing is reliable. Accepted on the same tries as overlay-bar |
| ask-answer | test-output/checker/compare/ask-answer.png | test-output/checker/screens/ask-answer.png | recaptured after repair round 1 (C16) with tests/ask_screen.spec.mjs (try 1, accepted by eye): real Assist answer (deepseek-v4-pro, usedScreenshot true, 570 OCR chars) over a full-screen neutral document, scrolled to the top |
| notes-history | test-output/checker/compare/notes-history.png | test-output/checker/screens/notes-history.png | recaptured after repair round 3 (C24, D-C7 + D-C8, try 1 accepted by eye): 15 fresh real sessions in a fresh data dir (14 short `say` clips + the 84.6 s two-voice meeting, realtime pace, real WhisperX + DeepSeek, nothing edited), filling the sidebar. During the long meeting, 3 real asks through the app's ask API (deepseek-v4-pro, transcript context, no screenshot) -> its "3 uses" pill comes from real usage. Long note open: 4 sections with every figure, 5 owned action items. Framing per D-C6; dashboard contentProtection false at capture. Previous image: test-output/checker/round3/compare-notes-history.png |
| settings | test-output/checker/compare/settings.png | test-output/checker/screens/settings.png | Keybinds pane, window-only capture at 1194×796 pt. Recaptured after repair round 1 (C16) |

### Council scores (closeness out of 10)

Judges: DeepSeek V4 Pro (opencode, variant high), Claude Opus 5.5 (effort high), Codex GPT-6 Luna (reasoningEffort high), all read-only. No target score was given to the judges (D9). DeepSeek V4 Pro can't view images, so its scores are **code-only** (from SCREENS.md and src/renderer). Full judge notes: test-output/council/r*-*.md.

| Screen | Round | DeepSeek V4 Pro (code-only) | Claude Opus 5.5 | Codex GPT-6 Luna | All scoring judges ≥ 7? |
|---|---|---|---|---|---|
| overlay-bar | R1 | 8 | 7.5 | 5 | no |
| ask-answer | R1 | 7 | 6 | 7 | no |
| live-suggestions | R1 | 7 | 6.5 | 4 | no |
| notes-history | R1 | 7 | 5 | 6 | no |
| settings | R1 | 6 | 8 | 8 | no |
| overlay-bar | R2 | 8 | 8.5 | (R1: 5, re-scores per D11) | DeepSeek+Opus yes; Codex pending |
| ask-answer | R2 | 8 | 7 | (R1: 7) | DeepSeek+Opus yes; Codex pending |
| live-suggestions | R2 | 8 | 8 | (R1: 4, re-scores per D11) | DeepSeek+Opus yes; Codex pending |
| notes-history | R2 | 6 | 6.5 | (R1: 6) | no |
| notes-history | R3 | 7 | 6 | (R1: 6) | no |
| notes-history | R4 | 7 | 7 | (R1: 6, re-scores per D11) | DeepSeek+Opus yes; Codex pending |
| overlay-bar | R4 (Codex re-score) | (R2: 8) | (R2: 8.5) | 3 | no |
| ask-answer | R4 (Codex re-score) | (R2: 8) | (R2: 7) | 8 | **yes** |
| live-suggestions | R4 (Codex re-score) | (R2: 8) | (R2: 8) | 5 | no |
| notes-history | R4 (Codex re-score) | (R4: 7) | (R4: 7) | 8 | **yes** |
| settings | R4 (Codex re-score) | (R2: 7) | (R2: 8) | 8 | **yes** |
| overlay-bar | R5 (recaptured, D14) | cancelled (D15) | 7 | (R4: 3) | no: **accepted by the user after repair round 2** (D15) |
| live-suggestions | R5 (recaptured, D14) | cancelled (D15) | 6 | (R4: 5) | no: **accepted by the user after repair round 2** (D15) |

**Final screen status** (latest score from each judge):

| Screen | DeepSeek V4 Pro (code-only) | Claude Opus 5.5 | Codex GPT-6 Luna | Repair rounds used | Status |
|---|---|---|---|---|---|
| overlay-bar | 8 (R2) | 7 (R5) | 3 (R4, before the D14 recapture) | 2 | accepted by the user after repair round 2 (D15); not at 7 from Codex |
| ask-answer | 8 (R2) | 7 (R2) | 8 (R4) | 1 | passed: 7+ from every judge |
| live-suggestions | 8 (R2) | 6 (R5) | 5 (R4, before the D14 recapture) | 2 | accepted by the user after repair round 2 (D15); not at 7 from Opus or Codex |
| notes-history | 7 (R4) | 7 (R4) | 8 (R4) | 3 | passed: 7+ from every judge |
| settings | 7 (R2) | 8 (R2) | 8 (R4) | 1 | passed: 7+ from every judge |

Reason for the two accepted screens: on 2026-11-07 the user stopped the look-and-feel repair loop ("the UI is good enough as it is"), overriding goal condition 5's 7/10 bar for overlay-bar and live-suggestions (DECISIONS D15). The judges' remaining notes for both are material and scale: a darker, more see-through panel with less shadow, larger headings and looser spacing (Opus R5); Codex's R4 notes were about the old four-tile backdrop, which the D14 recapture replaced, but Codex never re-scored the new images.
| settings | R2 | 7 | 8 | (R1: 8) | DeepSeek+Opus yes; Codex pending |

Repair rounds used per screen (max 5): overlay-bar 2 (accepted by the user, D15), ask-answer 1 (passed), live-suggestions 2 (accepted by the user, D15), notes-history 3 (passed), settings 1 (passed). Round 1 (D10) landed in CLONE_LOG U7-U10; an earlier attempt failed on a Claude API rate limit before any file edits and doesn't count (L16). notes-history rounds 2-3: D12, D13; overlay-bar and live-suggestions round 2: D14 (capture). Codex GPT-6 Luna re-scored all five in round 4 per D11. The loop was stopped by the user after round 2 for the last two screens (D15); a DeepSeek round-5 run in flight was cancelled.

## Couldn't replicate

What Glint doesn't match, and why. "Public info didn't reveal" means no public page, video or help article showed it.

| Area | What | Why |
|---|---|---|
| Real look of the overlay in use | True on-screen size, backdrop blur strength, animation timing | Public info didn't reveal it: every reference is a zoomed or cropped video frame or help-center screenshot, so sizes are relative and blur can't be measured (SCREENS.md, D-R9). Electron's transparent windows also can't blur the desktop behind a rounded CSS shape, so Glint uses CSS translucency without blur (D-S2, D-U*). |
| "Hide from screen share" indicator | The exact dashed outline Cluely draws in that mode | Public info didn't reveal it: the help center describes a dashed line but shows no image (F42). Glint's 1px dashed border is INFERRED. |
| Ask answer screen | Cluely's newer pill above the answer panel | The user chose the mid-2025 bar for the overlay (D6), so Glint's answer panel sits under that bar; the reference image is the newer pill. Intentional. |
| Transcription speed/accuracy claims | "300 ms", "95% accuracy", "12+ languages" (F33) | Cluely uses a cloud transcription partner. Glint uses local WhisperX in 4-8 s chunks (BRIEF), so a live line shows up about one chunk plus ~2.5 s after speech. English only. |
| Smart mode | Slower reasoning model with live web search (F13) | Needs a web search provider; BRIEF gives none. |
| Fact-check, Pause | Two buttons seen once each in the Smart-mode image (F30, F31) | Public info didn't reveal what they do; marked unknown, not built. |
| Live mic as "Me" | Verified mic capture with the Me label (F21, F22) | Fixed and verified live with `say` through the built-in speakers (C27): mic-only gives `me` "Testing the glint microphone." (WER 0%); with system audio on, the speakers' copy is flagged as echo and comes out once as `them`. Not yet checked with a human voice (Waiting on me). |
| Echo handling | Separating your own speakers' audio from the mic | Glint drops mic chunks that are explained by what the built-in speakers played (an echo reference tap, D-A7 to D-A9). Limits: talking over speaker audio in the same chunk includes the echo words; external/USB/HDMI speakers are not used as an echo reference; no in-signal echo cancellation (Apple voice processing would be the next step). |
| Out-of-scope product areas | Modes/custom prompts, knowledge-base uploads, calendar, meeting auto-detect, languages, accounts, billing, share links, follow-up email, chat with past meetings, mobile, Windows, CRM | Out of scope by BRIEF or because they need accounts or cloud services (FEATURES.md sections 5-6, each with a reason). |
| Look and feel, two screens | overlay-bar and live-suggestions at 7/10 from every judge | Accepted by the user after repair round 2 (D15) at DeepSeek 8 / Opus 7 / Codex 3 and DeepSeek 8 / Opus 6 / Codex 5. Remaining notes: a darker, more see-through panel with less shadow, larger headings and looser spacing (Opus R5). Codex's scores predate the single-speaker recapture (D14). |
| Notes window details | Newer floating capsule bar, Share pill, follow-up email card, avatar, history across several days | The capsule bar is the newer generation (user chose the mid-2025 bar, D6); Share, the email card and accounts are out of scope (F59, F61, F83, F85, F86); the history shows one "Today" group because all test sessions are real and recorded today (dates are never edited). |
| Proctoring/interview evasion | Process masking, dock hiding, tab-switch tricks, platform "undetectable" lists (E1-E8) | Excluded by the rules. Never built. |

## Waiting on me

1. Microphone for T3 Code: **done** (granted; the raw mic now records speech at −22.5 dB peak). Path, for the record: System Settings > Privacy & Security > Microphone > "T3 Code (Beta)". The live `Me` test still fails in-app (see Test results), which is an app issue, not a permission.
2. Accessibility for T3 Code: **done** (granted during the pause; `CGPreflightPostEventAccess` is now true and the hotkey test passed). The path, for the record: System Settings > Privacy & Security > Accessibility > "T3 Code (Beta)".
3. Automation (T3 Code -> System Events): **done** (the dialog was answered; System Events now replies to osascript). Path: System Settings > Privacy & Security > Automation > T3 Code (Beta) > System Events.
4. Screen Recording: already granted. Nothing to do.
5. Not a permission: the Remotion render in ~/story-reels was still using most of the CPU at resume (load average ~82). It slowed WhisperX from ~2 s to over 40 s per chunk during the Checker run. The gated tests ran before the worst of it; re-run screens on a quiet machine if timings matter.
6. Live mic: **verified** on 2026-11-07 with `say` through the built-in speakers (CLONE_LOG C27): mic-only gave a `me` segment with the spoken words, and with system audio on the phrase came out as `them` with the mic copy dropped as echo. Optional human-voice check for tomorrow:
   1. In the project folder, run `node scripts/audio_smoke.mjs --live 15 --no-system` and say a sentence a few seconds in. Expect a `me` segment with your words in the output.
   2. Then run `node scripts/audio_smoke.mjs --live 15` while a short video plays through the Mac's speakers, and speak over it. Expect `them` segments for the video and `me` for you.
   Known limit: when you talk over speaker audio within the same chunk, that `me` chunk is transcribed with the echo words included (the echo filter only drops chunks that are mostly speaker echo; see Audio A16 note).

## Lessons

Written by the Lead at the end of the run (2026-11-07).

**Where public info hit its limits**
- Screens: the public material spans three UI generations (the 2025 hotkey bar, the Aug 2025 dashboard, the newer pill). No single source showed one consistent version, so the user had to pick one (D6), and two reference screens (ask-answer, notes-history) still show the newer bar above them. Judges kept marking that down even though it was a scope decision.
- Behaviour the marketing doesn't show: the exact "Hide from screen share" indicator, what Fact-check and Pause do, how echo from the user's speakers is handled, and the transcription stack behind "300 ms / 95%" claims. Glint's answers to these are marked INFERRED or listed in "Couldn't replicate".
- Reference crops: one reference (live-suggestions) was cropped and had to be swapped for a fuller alt (D7). Judging against a partial screen gave misleading scores.

**What was hardest**
- Proving things for real on one shared Mac: macOS permissions (Accessibility, Automation, Screen Recording, Microphone) each blocked a test until the user granted them; the user's speaker output was muted and on AirPods at different times, which made live mic tests invalid twice; an unrelated heavy render (load 30-90) slowed WhisperX and made ffmpeg drop mic audio, which is why mic capture moved into a Swift helper.
- The live mic: three separate bugs were stacked behind "0 Me segments": a fixed silence gate above this mic's speech level (input volume 8/100), arrival-time padding that broke under load, and the tap's sample-rate switch. Each was only visible after adding level logging, so measuring before changing anything was the fix that mattered.
- Screen scoring: a code-only judge (DeepSeek V4 Pro can't view images) and image judges disagree on details (the stop button colour; the settings scrim, which round 1 wanted darker and round 2 wanted lighter). Repairs were taken only where two judges agreed or the pixels showed a clear bug, and reference pixels were sampled before following a code-only note (D-U12).
- Capture fidelity mattered as much as styling: a clipped drop shadow showed as a light rectangle, the notes window was first captured at a smaller size than the reference (type looked 1.25x too big), and a short 54-word test session left the note pane empty. Recapturing at the reference's size with a longer real conversation changed scores more than some CSS changes did.
- Model output that ignores the prompt: the notes prompt required topic sections, but a real 85 s meeting came back as one paragraph without the numbers that were said. Only looking at a real long session caught it; prompts need validation, not just wording.

**Process**
- Rate limits and a network drop interrupted a repair round before any edits; it was logged and not counted (L16). RESUME.md made the pause and resume clean.
- Thresholds were fixed before the Checker ran (D8) and never loosened; failures went back to the builder agent that owns the file.

- Judges disagree and drift: one judge scored a screen lower after a fix (notes-history Opus 6.5 -> 6) while another rose; a code-only judge can't see capture changes at all. Codex's lowest scores were about the backdrop composition (a four-tile grid) even though the prompt said not to penalise background content, so matching the reference's scene type mattered as much as the overlay's styling.
- Knowing when to stop: the user stopped the look-and-feel loop after round 2 for overlay-bar and live-suggestions (D15). The remaining notes there are material and scale (darker, more see-through, larger headings), which would have been the next UI round.

**Repair rounds per feature/screen** (max 5): overlay-bar 2 (accepted by the user, D15), ask-answer 1 (passed), live-suggestions 2 (accepted by the user, D15), notes-history 3 (passed), settings 1 (passed); live mic (Audio) 1 (verified live with `say`, C27); notes shape and action-item owners (AI) 2 fixes inside notes-history rounds 2-3; every gated D8 functional test passed in every regression run (C14, C18, C21, C23) without loosening a threshold.

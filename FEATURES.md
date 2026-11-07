# FEATURES.md — Cluely parity checklist for Glint

Built by the Researcher agent (Claude Opus 5.5) on 2026-11-06 from public sources only: cluely.com pages, the public help center (support.cluely.com), Cluely's official YouTube channel, two independent YouTube reviews, and press/review search results. No app was installed, no bundle opened, no traffic intercepted, no repo or clone opened. Evidence files are under `research/` (see `research/INDEX.md`); reference images for the scored screens are in `research/screens/` (see `research/screens/SCREENS.md`).

Status values: `in scope` (Glint builds it), `out of scope (reason)`, `unknown` (behaviour not publicly clear). Scope items refer to BRIEF.md "Product scope": (1) overlay + ask AI with screenshot/OCR, (2) live meeting assist, (3) hidden from screen share, (4) notes + summaries + history.

Hotkeys are given for macOS. Cluely uses Ctrl in place of ⌘ on Windows. "Exact" means the keys are printed in an official source; INFERRED means I derived them.

UI generations (see SCREENS.md): Gen A = early 2025 hotkey bar; Gen B = mid/late 2025 hotkey bar + Live Insights; Gen C = Dec 2025 onward pill + chat panel with action chips (current site).

Short source keys used in the tables:

| Key | URL |
|---|---|
| HC-use | https://support.cluely.com/en/articles/12294306-how-to-use-cluely |
| HC-dash | https://support.cluely.com/en/articles/12101340-how-to-use-cluely-s-dashboard-app |
| HC-settings | https://support.cluely.com/en/articles/12418681-how-to-use-cluely-s-settings |
| HC-keybinds | https://support.cluely.com/en/articles/12286442-how-to-change-cluely-keybinds |
| HC-assist | https://support.cluely.com/en/articles/12665135-assist-vs-what-should-i-say-next |
| HC-smart | https://support.cluely.com/en/articles/12063703-how-to-use-smart-mode |
| HC-undet-apps | https://support.cluely.com/en/articles/12364416-what-apps-are-supported-for-undetectability |
| HC-undet-enable | https://support.cluely.com/en/articles/11989293-how-to-enable-undetectability |
| HC-undet-test | https://support.cluely.com/en/articles/11127985-how-to-test-undetectability |
| HC-basic | https://support.cluely.com/en/articles/11128460-basic-checks |
| HC-move | https://support.cluely.com/en/articles/12026989-moving-cluely-screen-position-and-different-displays-or-monitors |
| HC-ambient | https://support.cluely.com/en/articles/12886705-how-to-turn-on-ambient-mode-for-desktop-assistance-or-silent-meetings |
| HC-copy | https://support.cluely.com/en/articles/12084603-how-to-copy-transcript |
| HC-custom | https://support.cluely.com/en/articles/12006358-how-to-customize-cluely |
| HC-lang | https://support.cluely.com/en/articles/12027152-how-to-change-languages |
| HC-free | https://support.cluely.com/en/articles/11127977-using-cluely-for-free |
| HC-pro | https://support.cluely.com/en/articles/12665173-cluely-pro-vs-pro-undetectability |
| HC-mic | https://support.cluely.com/en/articles/13173140-how-to-test-your-microphone-before-a-call |
| HC-audioerr | https://support.cluely.com/en/articles/12005662-audio-capture-error-when-using-listen-mode |
| HC-req | https://support.cluely.com/en/articles/11628643-what-are-the-system-requirements |
| HC-mobile | https://support.cluely.com/en/articles/13008320-how-to-use-cluely-mobile |
| HC-signin | https://support.cluely.com/en/articles/11989288-sign-in-issues-with-cluely |
| site-home | https://cluely.com/ (live fetch `research/pages/home.html`; archived copy `archive/website-attempt/reference/discovery/raw-html/home.html`) |
| site-undet | https://cluely.com/undetectability (`research/pages/undetectability.html`; archived `.../raw-html/undetectability.html`) |
| site-pricing | https://cluely.com/pricing (`research/pages/pricing.html`; archived `.../raw-html/pricing.html`) |
| site-mobile | https://cluely.com/mobile |
| site-download | https://cluely.com/download |
| YT-start | https://www.youtube.com/watch?v=n_DZ7e-0t4U (official, "How to Get Started With Cluely") |
| YT-meet | https://www.youtube.com/watch?v=UFobzGM3nSI (official, "Cluely for Meetings") |
| YT-sales | https://www.youtube.com/watch?v=BUMPdrLtsTA (official, "Cluely for Sales") |
| YT-support | https://www.youtube.com/watch?v=LC5URHc8dmE (official, "Cluely for Support") |
| YT-launch | https://www.youtube.com/watch?v=qHg3_4bU1Dw (official launch video, Apr 2025) |
| YT-personalize | https://www.youtube.com/watch?v=aESiaiw8YGY (official, "How to Personalize Cluely's Responses") |
| YT-AQ | https://www.youtube.com/watch?v=qMuG16tJ3KQ (independent review/tutorial, Artificial Quotient) |
| YT-amitesh | https://www.youtube.com/watch?v=1jK5s6x5AmU (independent review, Amitesh Tutorials, German audio) |

`HCimg/` below means `research/screenshots/support/`.

---

## 1. Overlay + ask AI (BRIEF scope 1)

| ID | Feature | What it does | How the UI looks (evidence) | Hotkeys | Sources | Status |
|---|---|---|---|---|---|---|
| F01 | Floating overlay widget | Always-on-top translucent window over all apps; appears as a small bar/pill at top centre; separate from the dashboard window. "shows up as a translucent window that appears over all other applications" (YT-launch 00:10). | Gen B bar `research/screens/overlay-bar.png`; Gen C pill `research/screens/alt/overlay-bar-alt-current-pill.png`; homepage mock `research/screenshots/site-home-viewport.png` | — | HC-use, YT-launch, site-home | in scope |
| F02 | Show / hide overlay | Toggles visibility of the widget and chat. Option "Hide Chat Also Hides Widget". Does not change screen-share hiding. | Gen C widget settings menu `research/screens/alt/overlay-bar-alt-widget-settings-menu.png`; `Show/Hide ⌘ \` hint in bar `research/screens/overlay-bar.png` | ⌘ \ (exact) | HC-use, HC-settings, HC-ambient, YT-start 00:08 | in scope |
| F03 | Ask AI about screen (Assist / auto-answer) | ⌘↵ with an empty box sends a "screen-only" query: one fresh screenshot plus the running transcript if listening; Cluely infers what you need. Typed text + Enter sends text + fresh screenshot + transcript. "Each query includes at most one screenshot." Glint: OCR text instead of image (BRIEF). | `research/screens/ask-answer.png` ("Assist" bubble, `Sent with screenshot`); Gen A `research/videos/official-get-started/frames/00m05s_frame_0005.jpg` (`Analyzing screen...`) | ⌘ ↵ (exact) | HC-dash §3, HC-assist, HC-use, YT-start 00:01, site-home ("Hit Cmd/Ctrl + Enter") | in scope |
| F04 | Typed chat input | Chat bar "Ask about your screen or conversation, or ⌘ ↵ for Assist"; Enter or send button submits. Gen A focused the input with ⌘⇧↵. | `research/screens/ask-answer.png` (bottom input, blue send button) | Enter to send (exact); ⌘⇧↵ focus/type in chat, Gen A (exact, YT-start 00:40) | HC-use, HC-dash, YT-start | in scope |
| F05 | Follow-up / re-prompt | Pressing ⌘↵ again continues the same thread ("Ask Follow-Up"). | Gen A bar label `Ask Follow-Up ⌘ ↵` `research/videos/official-get-started/frames/00m35s_frame_0027.jpg` | ⌘ ↵ (exact) | YT-start 00:30, HC-dash §3 | in scope |
| F06 | Clear conversation / start over | Clears current conversation context and collapses the chat. | Gen A `Start Over ⌘ R`; Gen B response header `Clear Response ⌘ R` `research/videos/official-for-meetings/frames/00m54s_frame_0008.jpg`; Gen C menu `Collapse Chat ⌘ R` | ⌘ R (exact) | HC-dash, HC-settings, YT-start 00:47 | in scope |
| F07 | Move overlay | Drag by the dot handle / anywhere around the pill, including to other monitors; keyboard nudge. | `⋮` handle in `research/screens/overlay-bar.png`; `research/screenshots/support/12026989_00_Screenshot_2025-08-16_at_2_34_05_PM.png` (bar with `⋮` and home button); homepage "Follows your eyes" `research/screenshots/site-home-section-05.png` | ⌘ ← / → / ↑ / ↓ (exact) | HC-move, HC-use §4, HC-settings, site-home | in scope |
| F08 | Scroll response | Scroll the answer panel without touching the mouse. | Gen C menu row `Scroll Chat ⇧ ⌘ ↑ ↓`; Gen A `⌘ + ↓` toast `research/videos/official-get-started/frames/00m37s_frame_0029.jpg` | ⌘ ⇧ ↑ / ↓ (exact, current); ⌘ ↓ (exact, Gen A video) | HC-settings, YT-start 00:35 | in scope |
| F09 | Close / collapse chat | Hover the chat bar to reveal an X at top right; `Hide` button collapses; scroll-to-bottom button. | `research/screens/ask-answer.png` (`^ Hide` in pill, ↓ round button); `research/screens/alt/overlay-bar-alt-current-expanded.png` | ⌘ R collapses (exact) | HC-use | in scope |
| F10 | Status states | `Analyzing screen...`, `Thinking...`, `Connecting audio...`, "Cluely is listening..." card. | `research/videos/official-get-started/frames/00m05s_frame_0005.jpg`, `.../00m24s_frame_0019.jpg`; `research/screens/alt/live-suggestions-alt-smartmode-chips.png` | — | YT-start, HC-smart | in scope |
| F11 | Ambient (no-meeting) chat | Use the overlay chat without recording a meeting. Cluely gates it behind Settings > General > Advanced: Ambient Chat. Glint: the overlay ask works without a session by default. | (no dedicated image) | ⌘ \ to show (exact) | HC-ambient | in scope |
| F12 | Markdown answers | Answers render headings, bold lead-ins, numbered lists, bullets; long answers scroll and fade at the edge. | `research/videos/official-get-started/frames/00m35s_frame_0027.jpg`; `research/videos/official-for-meetings/frames/00m54s_frame_0008.jpg` | — | YT-start, YT-meet | in scope |
| F13 | Smart mode | Toggle (`⚡ Smart`) for a slower reasoning model with real-time web search and inline source links (8 to 20 s). | `Smart` button in `research/screens/alt/live-suggestions-alt-smartmode-chips.png` and homepage mock | click only | HC-smart, HC-use | out of scope (needs web search; BRIEF has no search provider). The button could map to DeepSeek V4 Pro vs Flash, see DECISIONS D-R8 |
| F14 | Screen context always on | Since v1.89.0 every query uses screen context. | — | — | HC-use | in scope (via OCR) |

## 2. Live meeting assist (BRIEF scope 2)

| ID | Feature | What it does | How the UI looks (evidence) | Hotkeys | Sources | Status |
|---|---|---|---|---|---|---|
| F20 | Start / stop session (Listen) | Starts recording mic + computer audio; red stop button and a count-up timer while recording; auto-ends at meeting end. | Gen A mic→red stop + `00:07` `research/videos/official-get-started/frames/00m24s_frame_0019.jpg`; Gen B `Listen` blue pill `research/screens/notes-history.png` (top bar); Gen C stop square in pill; launch video `Done ■` + tooltip `Save and Close Summary` `research/videos/official-launch-2025/fullres_01m15s.png` | ⌘ ⇧ \ (exact) | HC-settings, HC-dash §2, YT-start 00:15, YT-launch 01:13 | in scope |
| F21 | Mic + system audio capture | Captures "your microphone and your computer's audio"; no bot joins the call; works with Zoom, Meet, Teams, Slack, Webex. | homepage section `research/screenshots/site-home-section-01.png` ("Cluely listens", `00:01 • Recording`, waveform) | — | HC-dash §2, YT-start 00:19, site-home | in scope (system audio if feasible, per BRIEF) |
| F22 | Speaker split (Me / Them) | Transcript differentiates "what you say and what's coming from the computer". | transcript bubbles `Me 0:03` (blue, right) vs `Them 0:13` (grey, left) `research/screenshots/support/12101340_04_Screenshot_2025-09-01_at_1_41_41_PM.png` | — | HC-dash §2 | in scope |
| F23 | Live transcript view | `Show Transcript` in the Live Insights header shows the live transcript; since v1.89 the full live transcript is in the dashboard Transcript tab instead of the widget. | `Show Transcript` + waveform icon `research/screens/live-suggestions.png`; Gen C `Chat | Transcript` tabs `research/screens/alt/live-suggestions-alt-smartmode-chips.png` | — | HC-dash §2, HC-copy, HC-use, YT-AQ 01:56 | in scope |
| F24 | Live Insights rolling summary | Panel that keeps an AI-written running summary with bold section headings and bullets; idle state "Start of Summary / No content yet...". | `research/screens/live-suggestions.png`, `research/screens/overlay-bar.png` (idle) | — | HC-dash §2, YT-meet, YT-sales, YT-support | in scope |
| F25 | Dynamic actions (questions, definitions, follow-ups) | As people talk, detected questions (❓), terms to define, objections and "Suggest follow-up questions" appear as clickable items; clicking asks Cluely and shows the answer with the question as a pill. | `research/screens/live-suggestions.png` (Actions list); `research/videos/official-for-meetings/frames/00m54s_frame_0008.jpg`; Gen C chips under panel in `research/screens/alt/live-suggestions-alt-smartmode-chips.png` (`Define San Francisco`) | click ("Click to ask Cluely") | HC-dash §2, YT-launch 00:46, YT-support 00:09 | in scope |
| F26 | Assist button | General help using transcript + screen ("jump in where needed"). | chip `✦ Assist` in `research/screens/ask-answer.png` | ⌘ ↵ (exact) | HC-use, HC-assist | in scope |
| F27 | "What should I say?" | Line-by-line, natural phrasing of what to say next. | chip `What should I say?`; homepage hero shows the bubble + quoted answer `research/screenshots/site-home-viewport.png` | click only (no public hotkey) | HC-use, HC-assist, site-home | in scope |
| F28 | Follow-up questions | Suggests follow-up questions to ask. | chip `Follow-up questions` | click only | HC-use, YT-launch 00:51 | in scope |
| F29 | Recap | Recaps what has happened in the call so far. | chip `↻ Recap` | click only | HC-use, YT-AQ 02:30 | in scope |
| F30 | Fact-check | Chip seen in the Smart Mode screenshot only. Behaviour not documented. | `research/screens/alt/live-suggestions-alt-smartmode-chips.png` | click only | HC-smart (image only) | unknown (cheap to add as a prompt if wanted) |
| F31 | Pause session | Pause icon next to stop in the Gen C pill. Behaviour not documented. | `research/screens/alt/live-suggestions-alt-smartmode-chips.png` | — | HC-smart (image only) | unknown |
| F32 | Mode picker in widget | Dropdown in the pill to switch the active mode (custom prompt). | `Cluely for Sales (Roy) ⌄` in `research/screens/alt/live-suggestions-alt-smartmode-chips.png` | — | HC-smart, HC-use §3 | out of scope (modes are out, see F60) |
| F33 | Transcription speed / accuracy claims | "300 ms response time", "95% accuracy", "12+ languages"; transcription partner Recall AI / AudioTee. | homepage section `research/screenshots/site-home-section-06.png` | — | site-home, HC-mic | out of scope (marketing claims tied to a cloud provider; Glint uses local WhisperX in rolling chunks, latency will differ) |
| F34 | Auto-end on silence | Recording auto-ends if no audio for 10 minutes. | — | — | HC-ambient | out of scope (not in BRIEF; trivial to add later) |

## 3. Hidden from screen share (BRIEF scope 3)

| ID | Feature | What it does | How the UI looks (evidence) | Hotkeys | Sources | Status |
|---|---|---|---|---|---|---|
| F40 | Invisible to screen share / recordings | Widget never appears in shared screens, recordings or screenshots ("uses the same technology that Zoom does"). Test: take a full-screen screenshot; if Cluely is absent it is hidden. Glint: `setContentProtection(true)`. | homepage split image "Visible to you / Invisible to others" `research/screenshots/site-home-section-04.png` | — | site-home, site-undet, HC-dash §1, HC-undet-test, HC-basic | in scope |
| F41 | Toggle in settings + widget | `Undetectability` toggle in the widget settings menu and in Settings > General (`Detectable` card); dashboard home also has a toggle. Default off. | `research/screens/alt/overlay-bar-alt-widget-settings-menu.png`; `research/screens/alt/settings-alt-general.png`; `research/screens/alt/notes-history-alt-dashboard-activity.png` | none official. An independent review claims ⌘/ (YT-AQ 03:25); not confirmed by any official source | HC-undet-enable, HC-settings, HC-use | in scope (label it "Hide from screen share") |
| F42 | Visual indicator | "When Cluely is in undetectable mode, there will be a dashed line around the widget and dashboard app." | no public image of the dashed outline found | — | HC-undet-apps | in scope (style INFERRED: dashed 1px border) |
| F43 | Dashboard also hidden | Dashboard window is hidden too when undetectable mode is on. | — | — | HC-use §5, HC-use (transcript note) | in scope (apply content protection to every Glint window) |
| F44 | Click-through overlay | BRIEF requires a click-through-able overlay (mouse passes through). Cluely lists "click-through undetectability" among stealth features; that framing is excluded (see E-section), but plain mouse pass-through for usability is in scope. | — | INFERRED: Glint picks its own toggle key | HC-undet-apps, BRIEF.md scope 1 | in scope (as usability, not evasion) |
| F45 | Pricing gate for undetectability | Only "Pro + Undetectability" ($149.99/mo) or legacy Pro unlock it. | pricing page `research/screenshots/site-pricing-full.png` | — | site-pricing, HC-pro, HC-free | out of scope (no accounts/billing in Glint) |

## 4. Notes, summaries and history (BRIEF scope 4)

| ID | Feature | What it does | How the UI looks (evidence) | Hotkeys | Sources | Status |
|---|---|---|---|---|---|---|
| F50 | Dashboard app window | Normal window (separate from widget) with search bar, `Start Cluely`, avatar; opened by clicking the logo on the widget, the dock icon, or cluely.com/open. | `research/screens/alt/notes-history-alt-dashboard-activity.png`; `research/screenshots/support/12101340_00_Dashboard_V2.png` | — | HC-use §5, HC-dash §1 | in scope (as Glint's history window; no account, no calendar) |
| F51 | Auto summary after session | Stopping a session generates a summary from the meeting's meaningful audio; "After a meeting ends, Cluely will bring you to the auto generated notes." | `research/screens/notes-history.png`; homepage notes mock `research/screens/alt/notes-history-alt-homepage-action-items.png` | — | HC-dash §1, HC-copy, YT-launch 01:23 | in scope |
| F52 | Action items / next steps | Notes include `Action Items` (homepage) or `Next Steps` (Aug 2025) sections. | `research/screens/alt/notes-history-alt-homepage-action-items.png`; `research/screens/notes-history.png` | — | site-home, HC-dash | in scope |
| F53 | Summary / Transcript / Usage tabs | Each meeting note has three tabs: Summary (detailed notes), Transcript (full, live-updating, speaker + timestamp), Usage (all AI chat during the meeting). | `research/screens/alt/notes-history-alt-transcript-tab.png` | — | HC-copy | in scope |
| F54 | Copy transcript / summary | `Copy full transcript` and `Copy full summary` buttons. | `research/screens/alt/notes-history-alt-transcript-tab.png`; homepage notes mock | — | HC-copy, HC-dash, site-home | in scope |
| F55 | History list | "Your Activity" list grouped by day (`Today`, `Fri, Sep 19`), each row: title, duration chip (`1:21`), uses chip (`4 uses`), time at right; list/grid toggle. | `research/screens/alt/notes-history-alt-dashboard-activity.png`; left column of `research/screens/notes-history.png` | — | HC-dash §1, YT-launch 01:23 | in scope |
| F56 | Auto-titled sessions | Meetings get AI titles ("Cluely App Outage: Debugging, Customer Impact, Recovery"). | `research/screenshots/support/12101340_00_Dashboard_V2.png` | — | HC-dash | in scope (INFERRED: title generated with the summary) |
| F57 | Resume session | Continue a past session and keep its context. | `▶ Resume Session` pill in `research/screens/alt/notes-history-alt-transcript-tab.png` | — | HC-dash §1 | in scope |
| F58 | Delete meeting / manual edit of summary | Remove a meeting; click summary text to edit. | — | — | HC-dash §1 | out of scope (not in BRIEF; small, can be added later) |
| F59 | Follow-up email draft | "Next Steps: write a follow-up email", with Copy and Send email; `Follow-up email` button on notes. | `research/screens/notes-history.png` | — | HC-dash, HC-free, YT-launch 01:15 | out of scope (beyond BRIEF item 4; sending email needs accounts) |
| F60 | Chat with a meeting / ask about past meetings | `Ask about this meeting...` bar on a note; dashboard `Search or ask AI...` across all meetings ("what are yesterday's action items"). | `research/screens/alt/notes-history-alt-transcript-tab.png`; `research/videos/official-launch-2025/frames/` t=01:30 | ⌘ K focuses search (exact keycap shown in `research/screens/alt/settings-alt-general.png`) | HC-copy, HC-free, YT-launch 01:28 | out of scope (beyond BRIEF; possible stretch) |
| F61 | Share notes via public link | Generates a public link to the summary. | `🔗 Share` pill in `research/screens/notes-history.png` | — | HC-dash, YT-launch 01:42, HC-mobile | out of scope (needs cloud hosting) |

## 5. Settings and app shell

| ID | Feature | What it does | How the UI looks (evidence) | Hotkeys | Sources | Status |
|---|---|---|---|---|---|---|
| F70 | Settings window | Sheet with sidebar General / Calendar / Keybinds / Profile / Language, Support links, Sign out, Quit. | `research/screens/settings.png`; `research/screens/alt/settings-alt-general.png` | — | HC-settings | in scope (Glint subset: General with screen-share toggle, Keybinds list; no Calendar/Profile/Language) |
| F71 | Keybinds list | Shows all shortcuts (list in F02 to F08, F20). | `research/screens/settings.png` | see rows | HC-settings, HC-dash | in scope |
| F72 | Rebind shortcuts | Click edit, press new key; supported keys A-Z, 0-9, F1-F24, arrows, punctuation, numpad, media keys. Pro-tier feature. | `research/screens/settings.png` | — | HC-keybinds, site-pricing | out of scope (beyond BRIEF; nice-to-have) |
| F73 | Theme light / dark / system | Theme dropdown `System Preference`. | `research/screens/alt/settings-alt-general.png` | — | HC-settings | out of scope (Glint ships one theme matching the references) |
| F74 | Open at login, check for updates, version | General settings rows. | `research/screens/alt/settings-alt-general.png` | — | HC-settings | out of scope (packaging/updates not in BRIEF) |
| F75 | Microphone test | 15-second mic test with 12 level bars and a test transcript (Mac only). | no image | — | HC-mic | out of scope (nice-to-have; could help the permissions flow) |
| F76 | Quit | Dock > Quit or Settings > Quit Cluely. | `research/screens/settings.png` | — | HC-dash §6 | in scope (tray/menu quit) |

## 6. Other Cluely features (all out of scope)

| ID | Feature | What it does | How the UI looks (evidence) | Hotkeys | Sources | Status |
|---|---|---|---|---|---|---|
| F80 | Modes / custom prompts / templates | Profile > Manage Modes: per-scenario system prompts, templates (Sales, Recruiting, Team Meet, Looking for work, Lecture). | `research/screenshots/support/12006358_00_Screenshot_2025-12-04_at_5_48_47_PM.png`; mode dropdown `research/screenshots/support/12294306_07_Screenshot_2025-12-09_at_5_51_08_PM.png` | — | HC-custom, HC-use §3, YT-launch 02:02 | out of scope (beyond BRIEF; Glint has one fixed system prompt) |
| F81 | Knowledge-base file upload | Upload PDF/.docx/.txt as context (3 files free, unlimited Pro). | `research/screenshots/support/12006358_02_Screenshot_2025-12-04_at_5_51_04-E2-80-AFPM.png` | — | HC-custom, YT-AQ 02:48, site-pricing | out of scope (beyond BRIEF) |
| F82 | Personalize text | Free-text "about me / company" context on the web dashboard (2025). | `research/videos/official-personalize/contact_00.jpg` | — | YT-personalize | out of scope (beyond BRIEF) |
| F83 | Google Calendar integration | Upcoming meetings, meeting alerts ("Meeting in 2 minutes … Join and Take Notes"), pre-call briefs that research participants. Google only. | `research/screenshots/support/12294306_01_notifications_enriched.png`; `research/screenshots/support/12101340_02_Meeting_BRiefs.png` | — | HC-dash §1, HC-settings | out of scope (needs OAuth/cloud) |
| F84 | Auto-detect meetings | "Zoom meeting detected — Take Notes" and "Done with your meeting? — Get Notes" notifications; ends on calendar end or mic change. | `research/screenshots/support/12294306_02_meeting_detected.png`; `.../12294306_05_meeting_done.png` | — | HC-use | out of scope (beyond BRIEF) |
| F85 | Languages | Settings > Language: transcription input (EN, ES, FR, DE, IT, PT) and output language (21 listed). | `research/screenshots/support/12027152_00_Language.png` | — | HC-lang, site-home ("12+ languages") | out of scope (Glint is English-first; WhisperX could add more later) |
| F86 | Accounts, sign-in, profile, delete account | Google/email sign-in, profile tab. | Profile/Sign out items in `research/screens/settings.png` | — | HC-signin, HC-settings | out of scope (local app, no accounts) |
| F87 | Pricing tiers and limits | Starter free (limited AI responses/notes, 3 files), Pro $19.99/mo, Pro + Undetectability $149.99/mo; free limit resets every 24 h. | `research/screenshots/site-pricing-full.png`; in-app Billing tab (Dec 2025) showing a "Pro + Undetectability, monthly $75 / month" plan and a "$42 / month" upgrade offer, so real prices vary from the list price `research/screenshots/support/11128019_00_Screenshot_2025-12-09_at_6_54_36_PM.png` | — | site-pricing, HC-free, HC-pro, https://support.cluely.com/en/articles/11128019-cancel-subscription | out of scope (no billing) |
| F88 | iOS mobile app | In-person recording, summaries, transcript, chat; no phone-call assist yet. | `research/screenshots/site-mobile-full.png`; `research/screenshots/support/13008320_*` | — | site-mobile, HC-mobile | out of scope (desktop only) |
| F89 | Windows app | Windows 11 build. | `research/screenshots/site-download-full.png` | Ctrl in place of ⌘ | site-download, HC-req | out of scope (BRIEF is macOS) |
| F90 | Integrations (CRM, Slack, Notion) | An independent review (2025) says there are none and notes must be copied out. A greyed-out `CRM` tab appears in the Dec 2025 settings sidebar, so a CRM integration may be in progress; no public docs. | `research/screenshots/support/11128019_00_Screenshot_2025-12-09_at_6_54_36_PM.png` (sidebar) | — | YT-AQ 05:21, https://support.cluely.com/en/articles/11128019-cancel-subscription | out of scope (needs third-party accounts; beyond BRIEF) |
| F91 | Model choice | Pro lists "access to GPT-5 and Claude 4 models". | — | — | HC-pro | out of scope (Glint uses DeepSeek per BRIEF) |

---

## Excluded: proctoring / interview-evasion

BRIEF.md puts every feature for evading exam proctoring or interview-cheating detection out of scope. These are logged here and not built. The line I drew: hiding the overlay from screen share (content protection) is in scope (F40); anything aimed at defeating detection by interview, exam or proctoring software is excluded.

| ID | What Cluely's public material describes | Source | Status |
|---|---|---|---|
| E1 | "Invisible to system/activity monitor", "process name masking" | HC-undet-apps | out of scope (proctoring/detection evasion) |
| E2 | "Invisible to dock/tray" as a stealth feature | HC-undet-apps | out of scope (detection evasion). Glint may still use a normal menu-bar/tray presence |
| E3 | "Browser detection prevention", "WebRTC blocking", "13+ other advanced stealth features … designed to counter detection methods used by interview platforms" | HC-undet-apps | out of scope (detection evasion) |
| E4 | Keybind-only interaction so focus/blur and click events are not seen by "active browser tab checkers" ("Do not click into Cluely. Only use the undetectable key binds") | HC-undet-apps, HC-undet-test, HC-undet-enable | out of scope (focus/tab-switch detection evasion). Glint keeps the same hotkeys for convenience only; no claims or tests about evading tab checkers |
| E5 | Tested-undetectable lists for interview/assessment platforms (CodeSignal OAs, HackerRank, CoderPad, Codility) and the list of proctoring tools it does not beat (Proctorio, Honorlock, Respondus, etc.) | HC-undet-apps | out of scope (interview/proctoring evasion) |
| E6 | Settings copy "Cluely is currently detectable by screen-sharing and proctoring softwares" | `research/screens/alt/settings-alt-general.png`, HC-settings | Glint wording must refer to screen share only |
| E7 | "Looking for work — Answer interview questions with confidence and clarity" mode template; "Cluely for Interviews" video; "Interview Coder" | HC-custom image; https://www.youtube.com/watch?v=CqqIdBt5F-Y (seen in channel listing, not watched) | out of scope (interview cheating) |
| E8 | Launch-video use case of lying on a date with live prompts ("cheat on everything") | YT-launch | not a feature; noted as context only |

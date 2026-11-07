# Reference screens (Cluely, public sources only)

One reference image per Glint screen to be built and scored. Alternates (other UI generations, other states) are in `alt/`. Everything below is what I saw in the image unless marked INFERRED. Colours are sampled pixel values from the image (they include whatever is behind a translucent surface, so treat them as "as rendered", not as the source token). Sizes in "pt" assume Retina 2x screenshots unless noted.

Cluely has shipped at least three widget generations in public material; this matters for building and judging:

- **Gen A (Apr to mid 2025)**: a flat dark bar with text buttons and hotkey keycaps (`Ask AI ⌘↵`, `Start Over ⌘R`, `Show/Hide ⌘\`, timer, mic), plus a separate "AI Response" panel. Seen in the official "How to Get Started" video.
- **Gen B (mid to late 2025)**: same hotkey bar (waveform+chevron, stop, `Ask ⌘↵`, `Show/Hide ⌘\`, ⋮) plus a "Live Insights" panel. Seen in the official "Cluely for Meetings/Sales/Support" videos and in help-center screenshots from Aug to Sep 2025.
- **Gen C (Dec 2025, v1.89+, and the 2026 homepage)**: a rounded pill (logo, `Ask`/`Hide`, stop) above a rounded chat panel with action chips `Assist · What should I say? · Follow-up questions · Recap`, input "Ask about your screen or conversation, or ⌘ ↵ for Assist", `Smart` toggle and a round blue send button. Seen in help-center screenshots dated 2025-12-09 and on https://cluely.com/ today (fetched 2026-11-06).

Picks: the overlay bar and live-suggestions references are Gen B, because only Gen B shows hotkey hints in the bar and a live suggestions panel during a meeting. The ask-answer reference is Gen C, the newest and clearest. See DECISIONS.md D-R4 for why, and what the UI agent should do about the mix.

---

## overlay-bar.png — idle floating bar with hotkey hints

- **File**: `research/screens/overlay-bar.png` (1280x720), copied from `research/videos/official-for-meetings/fullres_00m00s.png`.
- **Source**: official Cluely YouTube video "Cluely for Meetings", https://www.youtube.com/watch?v=UFobzGM3nSI, t=00:00. The video is zoomed in on the top of a macOS desktop (the menu bar shows "Tools Window Help"), so absolute sizes are scaled.
- **Layout**: a single horizontal bar centred at the top of the screen, just below the macOS menu bar (about 8 to 10pt gap, INFERRED from the frame). The bar spans about 40% of the visible frame width. Left to right:
  1. A small audio-waveform glyph with an up chevron `^` (opens/collapses the panel below; INFERRED from the help text "Click the toggle icon").
  2. A round light-grey **stop** button (white circle with a dark square) showing a session is recording.
  3. Text `Ask` followed by two small keycaps `⌘` `↵`.
  4. Text `Show/Hide` followed by keycaps `⌘` `\`.
  5. A vertical `⋮` (three dots): drag handle / menu. The help center says "3 Vertical Dots: Drag & drop move the command bar anywhere on your screen" (https://support.cluely.com/en/articles/12101340-how-to-use-cluely-s-dashboard-app).
- **Below the bar** (same frame): the idle "Live Insights" panel (see live-suggestions.png) reading `Start of Summary`, `• No content yet...`, footer `Click to ask Cluely`.
- **Colours**: bar fill is a very dark, slightly translucent charcoal (about #1a1a1e to #202024 at 75 to 85% opacity; the homepage CSS uses `rgba(24,23,28,0.8)` for the Gen C pill, see `research/pages/home-widget-computed-styles.json`). Hairline light border (about 1px, white at ~15 to 25%). Text white, 12 to 13px, medium weight. Keycaps: small rounded squares (radius ~4px) with a slightly lighter fill (#3a3a3f-ish) and light-grey glyphs.
- **Shape**: rounded rectangle, radius about 10 to 12px (Gen B); Gen C uses a full pill (CSS `border-radius: 9999px`).
- **Translucency/blur**: background content shows faintly through (the white stripe of the video behind the bar is visible as a lighter band). Backdrop blur is likely but not provable from a 720p frame (INFERRED).
- **Typography**: sans-serif, Inter/Geist-like. The homepage mock uses `Geist` (computed font-family `Geist, "Geist Fallback", ui-sans-serif`).
- **Hotkey hint text (exact)**: `Ask ⌘ ↵`, `Show/Hide ⌘ \`. Gen A variant (`alt/overlay-bar-alt-2025-hotkey-bar.png`, official "How to Get Started" video https://www.youtube.com/watch?v=n_DZ7e-0t4U t=00:05) reads `Ask AI ⌘ ↵ · Start Over ⌘ R · Show/Hide ⌘ \ · 00:00 · 🎤 · ⋮`, and after the first answer `Ask Follow-Up ⌘ ↵`. While recording, the mic turns into a red circular stop button and a timer counts up (`00:07`).
- **Animation**: in the Gen A video, pressing ⌘↵ shows an on-screen keycap toast `⌘ + ↵` in the centre of the screen (part of the video edit, not necessarily the app). A slim status strip under the bar shows `Analyzing screen...`, then `Thinking...` with a spinner logo, then the answer panel expands downwards. Listening shows a small "Cluely is listening..." card with a blue chat bubble "It will start listening to your microphone and computer audio." and the caption "Cluely adapts responses to this conversation".
- **Alternates**: `alt/overlay-bar-alt-current-pill.png` (Gen C idle pill, 170x49: logo circle, blue `✦ Ask` pill button #04388c, dark stop button; from https://support.cluely.com/en/articles/12294306-how-to-use-cluely), `alt/overlay-bar-alt-current-expanded.png` (Gen C pill `logo · ^ Hide · ■` above the chat panel), `alt/overlay-bar-alt-widget-settings-menu.png` (Gen C settings popover listing every widget hotkey).

## ask-answer.png — AI answer after a question, with screenshot context

- **File**: `research/screens/ask-answer.png` (1248x876, about 624x438pt at 2x), copied from `research/screenshots/support/12294306_06_Screenshot_2025-12-09_at_5_49_24_PM.png`.
- **Source**: help-center article "How to Use Cluely", https://support.cluely.com/en/articles/12294306-how-to-use-cluely (screenshot dated 2025-12-09, Gen C).
- **Layout** (top to bottom):
  1. **Pill** centred above the panel, separate from it with a ~12px gap: dark capsule (#464549 as rendered) holding a white outlined Cluely-style logo circle on the left, a darker inner pill button `^ Hide`, and a round dark button with a white square (stop). Pill about 290x84px in the image (about 145x42pt).
  2. **Panel**: wide rounded rectangle about 1080x705px in the image (about 540x350pt), corner radius about 24px in the image (about 12 to 16pt; the homepage CSS uses 16px). Fill mid-dark grey, about #4e4e51 as rendered over a white page; INFERRED real fill is a dark charcoal at roughly 70 to 80% opacity.
  3. Top right inside the panel: the user's message as a **bubble** `Assist`, blue-to-violet gradient (#4f46e5 to #8b5cf6 range), radius ~12px with a soft purple glow. Under it, right-aligned small grey text `Sent with screenshot` plus a small image icon. This is the screenshot-context indicator.
  4. **Answer text**: left-aligned, white, about 17 to 18px in the image (about 15pt at 1x?), line height ~1.6, paragraphs separated by a blank line. The text fades out at the bottom edge (mask gradient) where it scrolls.
  5. A round dark **scroll-to-bottom** button with a white down arrow at the right edge, just above the chips.
  6. **Action chips row**: `✦ Assist • ✎ What should I say? • 💬 Follow-up questions • ↻ Recap`, white text with small line icons, separated by grey dots. No chip backgrounds.
  7. **Input**: full-width rounded field (radius ~12px, 1px border rgba(155,155,155,0.4)), placeholder `Ask about your screen or conversation, or ⌘ ↵ for Assist` where `⌘` and `↵` are small outlined keycaps. Round navy-blue **send** button (#1e3a8a to #04388c gradient, white paper-plane/play icon) at the right.
- **Typography**: sans-serif (Geist on the homepage mock). Chips and input text ~13px at 1x; answer text larger (~15px).
- **Behaviour (help center)**: "Type anything and click CMD Enter … or hit Submit"; pressing ⌘↵ with an empty box sends a screen-only query with one screenshot; "Each query includes at most one screenshot"; transcript included if Listen is on; ⌘R clears context (https://support.cluely.com/en/articles/12101340-how-to-use-cluely-s-dashboard-app).
- **Alternates**: `alt/ask-answer-alt-homepage-viewed-screen.png` (homepage mock, 2026: blue `Assist` bubble, grey label `Viewed screen` above the answer, panel #4c4b50-ish with 1px light border and soft outer glow `rgba(207,226,255,0.24) 0 0 0 1px`), and the Gen A answer panel in `research/videos/official-get-started/frames/00m35s_frame_0027.jpg` (dark panel with header `Thinking...`, bold title `Tips for a Demo Video`, numbered bold sub-headings and bullets, a thin scrollbar on the right).

## live-suggestions.png — live meeting assist panel

- **File**: `research/screens/live-suggestions.png` (1280x720), copied from `research/videos/official-for-meetings/fullres_01m03s.png`.
- **Source**: official "Cluely for Meetings", https://www.youtube.com/watch?v=UFobzGM3nSI, t=01:03 (Gen B). Same panel in "Cluely for Sales" https://www.youtube.com/watch?v=BUMPdrLtsTA t=02:20 and "Cluely for Support" https://www.youtube.com/watch?v=LC5URHc8dmE t=00:04 to 00:12.
- **Layout**: a single translucent dark card under the bar, about 55% of the (zoomed) frame width; INFERRED about 440 to 480pt wide on a real screen and growing in height with content up to roughly half the screen, then scrolling.
  - **Header row**: `Live Insights` (white, semibold, ~13px) on the left; on the right `Show Transcript` with a small waveform icon, and a `—` minimise glyph.
  - **Body**: a rolling, AI-written summary with **bold section headings** (`Comfort and Mobility Considerations`, `Economic Considerations`; in the idle state `Start of Summary` with `• No content yet...`) and bullet points (white text ~14px, nested bullets indented). Older content scrolls up and fades.
  - **Actions** heading followed by suggested items, each prefixed with a small red `❓` (questions just asked in the meeting, e.g. `What is the question being asked?`, `What is better: plantar grade or digitigrade for comfort?`) or a speech-bubble icon (`Suggest follow-up questions`, `Define <term>`). Clicking an item asks Cluely about it.
  - **Footer**: centred grey `Click to ask Cluely`.
- **After clicking an action** (`research/videos/official-for-meetings/frames/00m54s_frame_0008.jpg`): the card header changes to a logo + `Clear Response ⌘ R` keycap on the left, the clicked question shown as a grey pill on the right (`❓ What is the economic difference between plantar and digiti...`), copy and close icons; the answer streams in below with bold lead-ins.
- **Colours**: card fill dark charcoal (#1a1c1f where over dark video) at roughly 70 to 80% opacity; the bright fur suit and stage letters show clearly through it, so translucency is high. Text white; secondary text grey (#9ca3af-ish). Corner radius ~10 to 12px. Thin light border.
- **Help-center description** (https://support.cluely.com/en/articles/12101340-how-to-use-cluely-s-dashboard-app): "Dynamic Insights: As you talk, keywords, questions, and objections from your transcript will appear on the Live Insights widget … Click any of these cards to get help." "Show Transcript … shows you the live transcript."
- **Alternates**: `alt/live-suggestions-alt-smartmode-chips.png` (Gen C, help center "How to Use Smart Mode": pill with mode dropdown `Cluely for Sales (Roy) ⌄`, pause, stop, drag dots, close X; panel tabs `Chat | Transcript`, status `Connecting audio...`; chips `What should I say next? • Follow-up questions • Fact-check • Recap`; and suggestion chips stacked under the panel: `What's onboarding like?`, `Define San Francisco`, `Define Atlanta, GA`, each a dark rounded pill with an icon). `alt/live-suggestions-alt-sales.png` (Gen B, "Cluely for Sales" t=00:04).

## notes-history.png — post-meeting notes, action items and session history

- **File**: `research/screens/notes-history.png` (2502x1800, about 1250x900pt), copied from `research/screenshots/support/12101340_03_Screenshot_2025-09-01_at_1_40_12_PM.png`.
- **Source**: help-center "How to Use Cluely's Dashboard App", https://support.cluely.com/en/articles/12101340-how-to-use-cluely-s-dashboard-app (screenshot dated 2025-09-01).
- **Layout**: a standard macOS window (traffic lights, light theme) with the Gen B hotkey bar floating above it (`logo · Listen (blue pill with waveform) · T Ask question · 👁 · ⋮`).
  - **Title bar row**: back arrow, a centred rounded search field `Search or ask AI...` with a small dark circular `↗` button at its right end, a light-blue `Start Cluely` button and a round avatar at top right.
  - **Left column (history)**, about 35% width, here dimmed by an overlay: sessions grouped by date headings (`Fri, Aug 15`, `Thu, Aug 14`, …, grey 14px); each row is a title (`Cluely x TOOTRiS`) followed by a grey duration chip (`22:18`) and a light-blue usage chip (`5 uses`).
  - **Right column (note)**: large bold title `Cluely for Legal Solutions` (~32pt), a grey date chip with calendar icon `Wed, Aug 13`, a light-blue `🔗 Share` pill at right. Section `Next Steps` with a card `Write a follow-up email / Draft a professional follow-up email based on this session's content and key discussion point`, expanded to show `Copy` and a blue `Send email` button above the drafted email text. Section `Meeting Context` with grey bullets.
  - **Floating bottom buttons**: `View Transcript` and `Resume Session`, light grey pills with shadow.
- **Colours**: white/very light grey (#fafafa) surfaces, black headings, grey body text (#4b5563-ish), accent blue (#3b82f6-ish) for links and chips, light-blue chip fill (#dbeafe-ish).
- **Typography**: SF Pro / Inter-like sans; title ~32pt bold, section headings ~22pt semibold, body ~16pt.
- **Alternates**: `alt/notes-history-alt-transcript-tab.png` (Gen C note page: date + attendee breadcrumb, title `Alex <> Alexa QA Testing`, segmented tabs `Summary | Transcript | Usage`, mode dropdown `15m Discovery Call`, `Copy full transcript`, transcript lines `Alexa 0:04` in blue + text, top-right `Follow-up email` (with blue dot) and `Share ⌄`, bottom `▶ Resume Session` pill and `Ask about this meeting...` input with `↗`), `alt/notes-history-alt-homepage-action-items.png` (2026 homepage mock: `Action Items` bullet list, `Copy full summary`), `alt/notes-history-alt-dashboard-activity.png` (home: `My Cluely`, `Mode: default`, `Undetectability` toggle, big gradient `Start Cluely` button, upcoming-meeting cards, `YOUR ACTIVITY` list grouped by day with duration and `4 uses` chips).

## settings.png — settings (keybinds tab)

- **File**: `research/screens/settings.png` (1194x796, 1x), copied from `research/screenshots/support/12101340_05_Settings_Keybind.png`.
- **Source**: help-center "How to Use Cluely's Dashboard App" and "How to Use Cluely's Settings?", https://support.cluely.com/en/articles/12418681-how-to-use-cluely-s-settings (screenshot from Sep 2025).
- **Layout**: modal sheet over the dimmed dashboard, about 900x680pt, radius ~12px, soft shadow. Left sidebar (~240pt, #fafafa) with `✕` close at top, items with line icons: `General`, `Calendar`, `Keybinds` (selected: light-grey rounded highlight), `Profile`, `Language`; section label `Support` with `Changelog`, `Help Center`; bottom `Sign out`, `Quit Cluely`. Right pane (white): heading `Keyboard shortcuts`, sub-text `Cluely works with these easy to remember commands. Click the edit button to change a keybind.`; groups `General`, `Window`, `Scroll`; each row = icon + label + right-aligned light-grey keycaps.
- **Exact rows**: Toggle visibility of Cluely `⌘ \`; Ask Cluely about your screen or audio `⌘ ↵`; Clear the current conversation with Cluely `⌘ R`; Start or stop a Cluely session `⌘ ⇧ \`; Move the window position up/down/left/right `⌘ ↑/↓/←/→`; Scroll the response window up/down `⌘ ⇧ ↑/↓`.
- **Alternate**: `alt/settings-alt-general.png` (General tab: top card `👁 Detectable — Cluely is currently detectable by screen-sharing and proctoring softwares` with a toggle; `General settings` rows `Open Cluely when you log in` (blue toggle on), `Theme` (`System Preference` dropdown), `Version` (`Check for updates`); footer `About v1.55.1`). For Glint, the toggle should be described as "Hide from screen share" (content protection), not proctoring.

## Screens with no usable public image

None of the five is missing. Gaps: no public image shows the window at true 1:1 scale on a full desktop with a known resolution, so overlay sizes relative to the screen are INFERRED (best full-desktop views: `research/videos/official-launch-2025/frames/` around t=01:03 to 01:20, low resolution). No public image shows the Gen C live-insights state during a real meeting other than the Smart Mode screenshot.

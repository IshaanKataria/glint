# DECISIONS

Every real choice. Format: question, options considered, pick, why, evidence, confidence (low/med/high), what would change my mind. Old entries are never edited; reversals are added as new entries that reference the old one.

---

## D001 · Who does page discovery and scoping
- Question: The brief says "first, find the pages from the nav, footer and sitemap" but only assigns Recon to *capture*. Who discovers and scopes?
- Options: (a) Recon agent discovers and scopes; (b) Lead discovers and scopes, Recon only captures; (c) one Recon task that discovers, scopes and captures.
- Pick: (b) Lead does discovery (sitemap, robots, rendered nav/footer links) and writes SCOPE.md; Recon then captures exactly the scoped list.
- Why: scoping is a planning call, which the brief gives to the Lead; it is a handful of requests; and it lets the user review scope before any capture budget is spent on the wrong pages.
- Evidence: BRIEF.md "Lead: plans, assigns work"; "Recon: captures every scoped page".
- Confidence: med
- What would change my mind: if the nav is rendered client-side in a way that needs a lot of interaction to reveal, I would hand discovery to Recon instead.

## D002 · How agents log without colliding
- Question: Several agents will run in parallel; how do they all log steps to CLONE_LOG.md without clobbering each other?
- Options: (a) everyone edits CLONE_LOG.md directly; (b) each agent appends to its own `logs/<agent>.md`, and the Lead appends a pointer + the agent's closing note to CLONE_LOG.md when it finishes; (c) one log file per step.
- Pick: (b).
- Why: "each agent owns its own files" (BRIEF.md); concurrent Edit-tool writes to one file can lose entries; (b) keeps every step recorded verbatim and still gives one ordered top-level log.
- Evidence: BRIEF.md Agents and Logging sections.
- Confidence: high
- What would change my mind: if agents ran strictly one at a time, a single shared file would be simpler.

## D003 · Which blog post is the "representative" one
- Question: the brief wants the blog index plus one representative post. Which post?
- Options: `/blog/ai-notetaker-guide` (Guide; footer-linked), `/blog/cluely-vs-otter` (Comparison; footer-linked), `/blog/virality` (Journal essay), `/blog/people-search-live` (Feature update).
- Pick: `/blog/cluely-vs-otter`.
- Why: Comparison is the most common post type (3 of 7: vs-otter, vs-granola, otter-alternatives). It is linked from the footer, and it uses the full set of post components (comparison tables, FAQ accordion, "Other posts" cards), so the template it proves out covers the other posts too.
- Evidence: h1/h2 and category labels per post in `reference/discovery/raw-html/blog__*.html` (step 005 output).
- Confidence: med
- What would change my mind: if the user sees "representative" as "typical prose post", then `/blog/ai-notetaker-guide` (a Guide, also with an FAQ) is the next best pick.

## D004 · /start and /affiliate out of scope
- Question: both are in the sitemap but in neither the nav nor the footer. Clone them?
- Options: (a) include /start step 1 only; (b) include the whole /start funnel; (c) exclude both.
- Pick: (c) exclude both.
- Why: /affiliate is just a redirect to `/`. /start is an ad-landing onboarding funnel; its later steps lead into signup or download, which the rules forbid us to go through, so a faithful clone would be guesswork past step 1. It is also not one of the page types the brief lists.
- Evidence: `reference/discovery/start-1440-discovery.png`; affiliate hop list in step 006.
- Confidence: med
- What would change my mind: the user asking for /start step 1 as an extra marketing page (it is cheap: one screen).

## D005 · Viewports and device emulation for every screenshot (original and clone)
- Question: what exactly is "390px" and "1440px"? A plain narrow desktop window, or a phone?
- Options: (a) desktop Chrome at both widths; (b) 390 = iPhone emulation (iPhone Safari UA, is_mobile, has_touch), 1440 = desktop Chrome on macOS with a normal (non-headless) UA; (c) DPR 2/3 for crisper detail.
- Pick: (b), device scale factor 1 at both widths. Viewports: 390x844 and 1440x900. The same settings are used for the original and the clone.
- Why: real 390px visitors are on phones, and the site sniffs the UA (its header shows "Get for Mac"; the raw HTML also carries "Download on the App Store"), so a desktop UA at 390 would capture a page no real visitor sees. A non-headless UA avoids any headless detection. DPR 1 keeps the pixel diff cheap and 1:1.
- Evidence: step 005 text snippet shows both "Download on the App Store" and "Get the desktop app" in the server HTML; the header "Get for Mac" link in `reference/discovery/home-links-1440.json`.
- Confidence: med
- What would change my mind: if the iPhone UA triggers an app-install interstitial that hides the page, fall back to (a) at 390 and log it.

## D006 · One screenshot procedure, owned by Recon, reused by the Checker
- Question: how do we keep the original and clone screenshots comparable?
- Options: (a) Recon and Checker each write their own screenshot code; (b) Recon writes one script with a "shots-only" mode that takes any base URL, and the Checker runs that same script against the clone.
- Pick: (b).
- Why: the pixel diff is only meaningful if the scroll routine, waits, viewport, UA and full-page method are identical. The Checker reusing a tool does not make it a builder; it still writes no page code.
- Evidence: BRIEF.md scoring loop.
- Confidence: high
- What would change my mind: if the script has a bug that only shows on the clone; then the Checker logs it and the Lead decides on a fix applied to both sides.

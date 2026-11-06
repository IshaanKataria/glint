# PLAN (Lead)

Draft, written while Recon captures. Nothing below the checkpoint starts until the user OKs SCOPE.md and reference/.

## Phase 0: scope and capture (running)
- [x] Discovery from sitemap, nav and footer → SCOPE.md (16 in, the rest out with reasons)
- [ ] Recon captures all 16 pages at 390 and 1440 into `reference/` (brief: `briefs/recon.md`)
- [ ] Lead reviews reference/ (spot-checks full-page shots for blank sections), merges recon logs
- [ ] **CHECKPOINT: user OK on SCOPE.md + reference/**

## Phase 1: foundation
- Stack (D-to-be-logged): **Astro, static output, plain CSS with custom properties, no Tailwind, vanilla JS for behaviour.** Why: 16 static pages that share one header/footer, which Astro components handle without duplication; zero JS by default; `npm run build && npm run preview` gives one local URL. Alternatives: hand-written static HTML (shared header/footer duplicated 16 times) or Next.js (heavier, and tempts copying the original's build output).
- Design system agent (Opus 5.5 high) owns `clone/` scaffold, `clone/src/styles/tokens.css`, `clone/src/styles/base.css`, `clone/public/fonts/`, `design/TOKENS.md`. Done when: tokens cover colours, type scale, spacing, radii, shadows, breakpoints, each traced to a `styles-*.json` source; fonts load locally; `npm run build` passes.

## Phase 2: pages (parallel, each builder owns its own files)
| Builder | Pages | Also owns |
|---|---|---|
| A: shell + home | `/` | `Layout.astro`, `Header.astro`, `Footer.astro`, `/stub/*` pages (download, signup, newsletter, not-cloned) |
| B: product | `/pricing`, `/undetectability`, `/mobile`, `/download` | its page files and page CSS |
| C: content | `/manifesto`, `/press`, `/careers`, `/blog`, `/blog/cluely-vs-otter` | its page files and page CSS |
| D: legal | 6 legal pages | one shared `LegalLayout.astro` |

A ships the shell first (layout plus all 16 routes as stubs that return 200). B, C and D start after that.
Behaviour hooks contract: builders mark interactive parts with `data-*` attributes (`data-menu`, `data-accordion`, `data-reveal`, `data-marquee`, `data-toggle`). They write static markup only.

## Phase 3: interactions
- Interactions agent (Opus 5.5 high) owns `clone/src/scripts/*` and `clone/src/styles/motion.css`: mobile menu, sticky header, hovers, FAQ accordion, pricing toggles, scroll reveals, marquees, typing effects, video. Evidence: `reference/pages/*/states/`, `scroll-*.webm`, `notes.md`, `reference/js/`.

## Phase 4: scoring loop (Checker is a fresh agent every round, never a builder)
- Checker (Sonnet 5.5 high, new `delegate_task` each round) runs `reference/_tools/capture.py --shots-only` against the local clone, copies the original shots into `comparison/<slug>/`, and pixel-diffs each page at both widths. Match % = 1 − mismatched pixels / pixels in the union canvas (taller image wins; missing height counts as mismatch), with a per-pixel colour tolerance fixed before round 1 and logged. Writes `comparison/scores.json` and a diff PNG per shot.
- Council (after pixel scores settle): DeepSeek V4 Pro (opencode, variant high), Claude Opus 5.5 (effort high), Codex GPT-6 Luna (reasoningEffort high), read-only, each fed side-by-side PNGs (original | clone) per page per width, scoring closeness /10 per page. No target score is ever mentioned. A judge that returns nothing = `no score`, no substitute.
- Repairs: findings go back to the builder who owns the page (continued in its own T3 thread). Max 5 repair rounds per page, counted in `comparison/rounds.json`.

## Phase 5: report
- `REPORT.md`: per page, side-by-side images, a table (pixel % at 390/1440, each judge's score, final /10, differences), "Couldn't copy", "Lessons", rounds per page. Final lines of CLONE_LOG.md and DECISIONS.md state that no source repo or archive copy was used.

## Anti-cheat checks (run by the Checker every round, results in its report)
- `grep -r "cluely.com" clone/src clone/public` must show only plain `<a href>` text links (no `src=`, no `@import`, no `url(`, no fetch/iframe).
- No `<iframe>` anywhere in `clone/`.
- No PNG/JPG in `clone/public` whose hash matches any file in `reference/pages/*/shot-*` or `states/`.
- Clone screenshots taken with the network blocked to cluely.com and its CDNs (any blocked request is listed as a failure).

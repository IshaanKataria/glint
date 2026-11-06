# SCOPE

Every page found on https://cluely.com, from three sources:
1. `robots.txt` → `sitemap.xml` → `sitemap-0.xml` (24 URLs): `reference/discovery/sitemap-0.xml`
2. Rendered homepage header and footer at 1440px and 390px: `reference/discovery/home-links-1440.json`, `home-links-390.json`
3. Every `<a href>` in the server HTML of all 24 sitemap pages: `reference/discovery/crawl-summary.json`

The crawl found no internal page outside the sitemap. The only extra internal path was `/cdn-cgi/l/email-protection`, which is Cloudflare's email-obfuscation endpoint, not a page.

Discovered: 2026-11-06 14:19–14:22 AEDT. All 24 sitemap URLs returned 200.

## In scope (16 pages)

| # | Path | What it is | Why in |
|---|------|------------|--------|
| 1 | `/` | Home: "#1 Undetectable AI for Meetings" hero with a faux overlay app demo, feature sections, undetectability section, footer | Main marketing page |
| 2 | `/pricing` | "Start for free." Plan cards with Desktop/Mobile and Monthly/Annually toggles, plus a feature comparison table | Pricing (the brief names it) |
| 3 | `/undetectability` | "Undetectable in every way": feature suite with faux meeting-participants UI | Marketing page, linked in the footer |
| 4 | `/mobile` | "AI meeting notes on the go": the iPhone app page | Marketing page, linked in the header nav |
| 5 | `/download` | "Download the Cluely desktop app": Mac/Windows download page | Marketing page, linked in the footer. Its download buttons point to local stub pages in the clone |
| 6 | `/manifesto` | "We want to cheat on everything." Long-form manifesto | Marketing page, linked in the footer |
| 7 | `/press` | "Cluely In the Press": list of press articles by year | Marketing page, linked in the footer. Article links stay as plain external hrefs and are never opened |
| 8 | `/careers` | Careers: animated letter-by-letter headline, 2 videos, "No open roles right now" | Marketing page, linked in the footer |
| 9 | `/blog` | Blog index: categories, post cards, "Stay updated" newsletter input | Blog index (the brief names it). The newsletter button points to a local stub |
| 10 | `/blog/cluely-vs-otter` | Representative blog post (Comparison): comparison table, pricing table, FAQ accordion, "Other posts" | One representative post. Why this one: see D003 |
| 11 | `/privacy-policy` | Privacy Policy | Legal page |
| 12 | `/terms` | Terms of Service | Legal page |
| 13 | `/terms/refund-policy` | Refund Policy | Legal page |
| 14 | `/terms/cancellation-policy` | Cancellation Policy, with an "On this page" sidebar | Legal page |
| 15 | `/investment-disclaimer` | Investment Solicitation Disclaimer, with an "On this page" sidebar | Legal page |
| 16 | `/marketing-disclosure` | Marketing Disclosure ("Satirical content warning", etc.) | Legal page |

## Out of scope: cluely.com pages

| Path | What it is | Why out |
|------|------------|---------|
| `/start` | "Get started" onboarding funnel: a 7-step progress bar, "Never blank in an interview again.", "See how it works" button. Rendered client-side (empty server HTML) | Not linked from the nav, footer or any page body; it is an ad landing funnel whose later steps lead to signup or download, which the rules forbid us to go through. Seen once at 1440px for discovery only: `reference/discovery/start-1440-discovery.png` |
| `/affiliate` | Client-side redirect to `/` (hops `/affiliate` → `/`; server HTML has no content and no title) | Not a distinct page. Seen once: `reference/discovery/affiliate-1440-discovery.png` |
| `/blog/ai-notetaker-guide` | Blog post (Guide) | Skipped: the brief keeps only one representative post |
| `/blog/cluely-vs-granola` | Blog post (Comparison) | Skipped: only one representative post |
| `/blog/otter-ai-alternatives` | Blog post (Comparison) | Skipped: only one representative post |
| `/blog/meeting-bots-surveillance` | Blog post (Update) | Skipped: only one representative post |
| `/blog/people-search-live` | Blog post (Update / Feature) | Skipped: only one representative post |
| `/blog/virality` | Blog post (Journal) | Skipped: only one representative post |
| `/#undetectability` | Header-nav anchor to the undetectability section of the homepage | Not a separate page; covered by `/` |
| `/cdn-cgi/l/email-protection` | Cloudflare email-obfuscation endpoint | Not a page |

In the clone, links to skipped blog posts go to a local "not cloned" stub page, so internal links never 404.

## Out of scope: external subdomains and third-party links (logged as skipped, never opened)

| URL | What it is | Why out |
|-----|------------|---------|
| `https://api.v2.cluely.com/desktop-download/mac/latest.dmg` (+ `?glass=bisect` in the header) and `.../win/latest.exe` | Desktop app installers | Rules: never download or run the desktop app. In the clone these go to a local stub |
| `https://support.cluely.com/en/` | Help center | External subdomain |
| `https://cluelyhq.notion.site/bugbounty` | Bug bounty page on Notion | External host |
| `https://cluely.trust.pagerduty.com/posts/dashboard/` | Status page ("All systems operational") | External host |
| `https://trust.delve.co/cluely` | Trust center (linked from the privacy policy) | External host |
| `https://apps.apple.com/app/apple-store/id6755442775` | iOS App Store listing | External host |
| `https://x.com/cluely`, `https://discord.gg/cluely`, `https://www.instagram.com/cluely/` | Social profiles | External hosts |
| `https://github.com/cluely` | GitHub org (footer "Follow us on GitHub") | **Seen in the footer HTML and logged; not opened.** The rules forbid source repos |
| `mailto:help@cluely.com` | Contact email | Not a page. Kept as a plain mailto href in the clone; never sent |
| ~30 press-article URLs on `/press` (Fortune, TechCrunch, Business Insider, ...) | Third-party news articles | External; full list in `reference/discovery/crawl-summary.json` |
| `https://stripe.com/us/privacy`, `https://www.aboutcookies.org/`, `http://www.allaboutdnt.com` | Third-party references in the privacy policy | External |

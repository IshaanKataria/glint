import argparse, json, sys
from playwright.sync_api import sync_playwright

def main():
    ap = argparse.ArgumentParser(description="Render a page and list nav/footer/all links (discovery only).")
    ap.add_argument("url"); ap.add_argument("out_json")
    ap.add_argument("--width", type=int, default=1440)
    a = ap.parse_args()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": a.width, "height": 900})
        pg.goto(a.url, wait_until="networkidle", timeout=60000)
        pg.wait_for_timeout(2000)
        data = pg.evaluate("""() => {
          const pick = (root) => [...root.querySelectorAll('a[href]')].map(a => ({text:(a.innerText||a.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,60), href:a.href}));
          const header = document.querySelector('header, nav');
          const footer = document.querySelector('footer');
          return JSON.stringify({
            title: document.title,
            header: header ? pick(header) : [],
            footer: footer ? pick(footer) : [],
            all: pick(document),
            subdomains_in_scripts: [...document.querySelectorAll('script[src],link[href]')].map(e=>e.src||e.href)
          });
        }""")
        d = json.loads(data)
        json.dump(d, open(a.out_json, "w"), indent=2)
        b.close()
    print("TITLE:", d["title"])
    for k in ("header", "footer"):
        print("=" * 60); print(k.upper(), len(d[k])); print("=" * 60)
        for l in d[k]: print(f"{l['text'][:40]:40s} {l['href']}")
    seen = {l['href'] for l in d['header'] + d['footer']}
    extra = sorted({l['href'] for l in d['all']} - seen)
    print("=" * 60); print("OTHER LINKS IN BODY", len(extra)); print("=" * 60)
    for h in extra: print(h)

if __name__ == "__main__":
    if len(sys.argv) == 1: sys.argv.append("-h")
    main()

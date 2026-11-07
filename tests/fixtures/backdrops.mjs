// Neutral backdrops for the look-and-feel captures (no Cluely imagery, no photos).
const tile = (name, hue, x) => `<div class="t"><div class="bg" style="background:radial-gradient(ellipse at 50% 35%,hsl(${hue},28%,72%),hsl(${hue},22%,38%) 70%)"></div>
  <div class="head" style="left:${x}%"></div><div class="body" style="left:${x - 9}%"></div><div class="name">${name}</div></div>`;
export const CALL = `<!doctype html><html><head><title>Team call</title><style>
body{margin:0;background:#1b1c1f;font:500 15px -apple-system,Helvetica;color:#fff;height:100vh;overflow:hidden}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:8px;height:calc(100vh - 76px);box-sizing:border-box}
.t{position:relative;border-radius:12px;overflow:hidden}.bg{position:absolute;inset:0}
.head{position:absolute;top:26%;width:18%;aspect-ratio:1;border-radius:50%;background:#e9c9a8;transform:translateX(-50%)}
.body{position:absolute;top:58%;width:36%;height:60%;border-radius:45% 45% 0 0;background:#3d4a63;transform:translateX(-25%)}
.name{position:absolute;left:12px;bottom:10px;background:rgba(0,0,0,.55);padding:4px 10px;border-radius:6px;font-size:13px}
.bar{height:60px;display:flex;align-items:center;justify-content:center;gap:14px}
.b{width:44px;height:44px;border-radius:50%;background:#33353a}.b.r{background:#d93b3b;width:64px;border-radius:22px}
</style></head><body><div class="grid">${tile('Priya (Acme)', 200, 50)}${tile('Marcus', 30, 52)}${tile('Dana L.', 140, 48)}${tile('You', 260, 50)}</div>
<div class="bar"><div class="b"></div><div class="b"></div><div class="b r"></div><div class="b"></div><div class="b"></div></div></body></html>`;

export const DOC = `<!doctype html><html><head><title>Release notes draft</title><style>
body{margin:0;background:#fff;font:400 15px/1.5 -apple-system,Helvetica;color:#222;padding:150px 60px 30px}
h1{font-size:26px;margin:0 0 12px}code{background:#f2f2f4;padding:2px 6px;border-radius:4px;font-size:15px}
</style></head><body><h1>Release 2.4 checklist (draft)</h1>
<p>Blocking issue: the <code>sync_worker</code> retries forever when the token expires, so customers see a spinner after 60 minutes.</p>
<p>Proposed fix: refresh the token before each retry and cap retries at 5 with exponential backoff.</p>
<p>Open question from QA: should we ship 2.4 on Thursday or wait for the fix?</p></body></html>`;

export const WALLPAPER = `<!doctype html><html><body style="margin:0;height:100vh;background:linear-gradient(180deg,#6f86a3 0%,#9aa9b8 45%,#c9b9a1 75%,#5a4636 100%)"></body></html>`;

/** Full-screen light document; text sits low so the ask panel floats over plain white (like the reference). */
export const DOC_FULL = DOC.replace('padding:150px 60px 30px', 'padding:640px 120px 30px');

/** D-C9: single-speaker, full-frame call view (speaker view). CSS shapes only: no photos, no tiles, no control row.
 *  Sized in px so head + shoulders sit inside the ~470-530 pt tall capture regions at the top of the screen (try 4). */
export const SPEAKER = `<!doctype html><html><head><title>Call - speaker view</title><style>
html,body{margin:0;height:100%;overflow:hidden}
body{background:radial-gradient(ellipse at 55% 30%,#e4dccb 0%,#cfc5b1 45%,#a99d86 100%);position:relative;font:500 14px -apple-system,Helvetica}
.shelf{position:absolute;left:22%;top:120px;width:150px;height:300px;background:#8a7559;border-radius:6px;box-shadow:inset 0 -8px 0 #6f5d45}
.shelf i{position:absolute;bottom:8px;width:9%;border-radius:2px}
.plant{position:absolute;right:23%;top:150px;width:130px;height:230px;background:radial-gradient(ellipse at 50% 35%,#7f9a6a,#5b7449 70%,transparent 72%)}
.pot{position:absolute;right:25%;top:360px;width:70px;height:70px;background:#b9a48a;border-radius:0 0 10px 10px}
.hair{position:absolute;left:50%;top:150px;width:150px;height:172px;transform:translateX(-50%);background:#2e241d;border-radius:48% 48% 40% 40%}
.head{position:absolute;left:50%;top:172px;width:128px;height:160px;transform:translateX(-50%);background:#d9a982;border-radius:46% 46% 44% 44%}
.neck{position:absolute;left:50%;top:318px;width:52px;height:50px;transform:translateX(-50%);background:#c99772}
.body{position:absolute;left:50%;top:356px;width:470px;height:600px;transform:translateX(-50%);background:linear-gradient(#4b5f7d,#3b4b63);border-radius:44% 44% 0 0}
.name{position:absolute;left:calc(50% - 400px);top:440px;background:rgba(0,0,0,.5);color:#fff;padding:5px 11px;border-radius:7px}
</style></head><body>
<div class="shelf"><i style="left:8%;height:40%;background:#c4553e"></i><i style="left:20%;height:52%;background:#3e6c8f"></i><i style="left:32%;height:46%;background:#d9b44a"></i><i style="left:44%;height:36%;background:#5f8a5a"></i></div>
<div class="plant"></div><div class="pot"></div>
<div class="hair"></div><div class="body"></div><div class="neck"></div><div class="head"></div>
<div class="name">Priya (Acme)</div></body></html>`;

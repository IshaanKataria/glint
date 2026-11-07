// Step 4 (not a gate), D-C7: notes-history from REAL data comparable to the reference.
// 8 real sessions (7 short clips + one ~75 s two-voice meeting) through session.start({ audioFile }) at realtime pace
// -> real WhisperX transcripts and DeepSeek notes; then the D-C6 framing with the longest session's note open.
// Usage: CHECKER_TRY=<n> npx playwright test -c tests/playwright.config.mjs notes_screen
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { launchGlint, launchControl, openWin, display, winState, waitWindow, waitFor, img, quit, logTo, record, sleep, unwrap, OUT, ROOT } from './helpers.mjs';
import { WALLPAPER } from './fixtures/backdrops.mjs';

const TRY = process.env.CHECKER_TRY ?? '1';
const CLIPS = join(OUT, 'notes-clips');
const SHOTS = join(OUT, 'screens'), CMP = join(OUT, 'compare');

// [voice, line]. Samantha = Maya (customer, product lead); Daniel = Tom (vendor).
const LONG = [
  ['Samantha', "Thanks for joining, Tom. Let's go through the pilot results, the pricing, and the rollout plan."],
  ['Daniel', 'Sure. The pilot ran for six weeks with forty agents. Average handle time dropped from nine minutes to six and a half minutes.'],
  ['Samantha', "That's great. What about customer satisfaction?"],
  ['Daniel', 'Satisfaction went from eighty one percent to eighty eight percent. The biggest gain was on billing questions.'],
  ['Samantha', 'Our finance team asked about pricing. What would two hundred seats cost per year?'],
  ['Daniel', 'List price is thirty dollars per seat per month. For two hundred seats on an annual contract we can do twenty four dollars, so about fifty seven thousand six hundred dollars a year.'],
  ['Samantha', 'OK. Security is the other topic. Our security team needs the SOC 2 report and a data processing agreement before legal will sign.'],
  ['Daniel', 'I can send the SOC 2 Type Two report today, and our legal team will share the data processing agreement by Wednesday.'],
  ['Samantha', "Great. For the rollout, we'd like to start with the billing team in December, then add the support team in January."],
  ['Daniel', "That works. We'll schedule two training sessions for the billing team in the first week of December."],
  ['Samantha', 'So the next steps are: you send the SOC 2 report and the agreement, I get finance approval for the annual contract by next Friday, and we book the training dates.'],
  ['Daniel', "Agreed. I'll also send a summary email with the pilot numbers this afternoon."],
];
const SHORT = [
  [['Daniel', "Quick standup. The login bug is fixed and deployed. Next, I'll review the payment retry pull request this afternoon."]],
  [['Samantha', 'Design review for the onboarding screens. We agreed to cut the setup steps from five to three.'], ['Daniel', 'Priya will update the mockups by Thursday.']],
  [['Samantha', 'Hiring sync. We have three final round candidates for the backend role. Interviews are on Tuesday and Wednesday, and we will decide by Friday.']],
  [['Daniel', 'Marketing check-in. The webinar has two hundred and forty registrations.'], ['Samantha', 'Can we send the reminder email on Monday morning?']],
  [['Samantha', 'Customer call with Acme. They want single sign-on with Okta before their renewal in March.'], ['Daniel', 'I promised them a timeline by next week.']],
  [['Daniel', "Budget review. Cloud costs rose twelve percent last month, mostly from storage. Let's move old logs to cold storage and review again in two weeks."]],
  [['Samantha', 'Release planning for version two point four. The token refresh fix goes in first, then the new export feature. Code freeze is next Thursday.']],
  // D-C8: seven more short real sessions so the history list fills the sidebar
  [['Daniel', 'Support escalation review. Three enterprise tickets breached the four hour response target this week.'], ['Samantha', 'We will add a second on-call engineer for weekends starting Saturday.']],
  [['Samantha', 'Partner sync with Globex. They want to resell our product in Germany and need a German interface by the second quarter.']],
  [['Daniel', 'Security office hours. The penetration test found two medium issues in the admin panel.'], ['Samantha', 'Both fixes ship in Thursday\'s release.']],
  [['Samantha', 'Data team check-in. The new churn dashboard is live, and monthly churn is down to two point one percent.'], ['Daniel', 'Great, please share it with sales.']],
  [['Daniel', 'Office move planning. We move to the fifth floor on December twelfth. Everyone should pack their desks by the tenth.']],
  [['Samantha', 'Board prep. The deck needs the revenue chart and the hiring plan. Draft due to the CEO on Monday.']],
  [['Daniel', 'Mobile app retro. The crash rate fell to zero point three percent after the last update.'], ['Samantha', 'Next sprint we focus on offline mode.']],
];
// D-C8: real asks during the long meeting (app ask API, transcript context, no screenshot so no other screen content is sent)
const ASKS = [
  { at: 35, q: 'How much did average handle time drop in the pilot?' },
  { at: 65, q: 'What price per seat did Tom offer for 200 seats on an annual contract?' },
  { at: 'end', q: 'What do we still need before legal will sign?' },
];

/** say each line with its voice, join with 0.45 s gaps, write 16 kHz mono s16 wav. */
function makeClip(name, lines) {
  const dir = join(CLIPS, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const parts = [];
  lines.forEach(([voice, text], i) => {
    const aiff = join(dir, `${i}.aiff`), wav = join(dir, `${i}.wav`);
    execFileSync('say', ['-v', voice, '-o', aiff, '--', text]);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', aiff, '-af', 'apad=pad_dur=0.45', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', wav]);
    parts.push(wav);
  });
  const list = join(dir, 'list.txt');
  writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const out = join(CLIPS, `${name}.wav`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out]).toString());
  return { file: out, dur, text: lines.map(([v, t]) => `${v}: ${t}`).join('\n') };
}

const region = (file, r) => execFileSync('/usr/sbin/screencapture', ['-x', '-R', `${r.x},${r.y},${r.width},${r.height}`, '-t', 'png', file]);

test('screens: notes-history from 15 real sessions', async () => {
  test.setTimeout(30 * 60_000);
  mkdirSync(CLIPS, { recursive: true }); mkdirSync(SHOTS, { recursive: true }); mkdirSync(CMP, { recursive: true });
  const log = logTo(`notes_screen_try${TRY}.log`);
  const clips = SHORT.map((l, i) => ({ name: `short${i + 1}`, ...makeClip(`short${i + 1}`, l) }));
  clips.push({ name: 'long', ...makeClip('long', LONG) });
  writeFileSync(join(CLIPS, 'script.txt'), clips.map((c) => `## ${c.name} (${c.dur.toFixed(1)} s)\n${c.text}`).join('\n\n') + '\n');
  log('clips', clips.map((c) => `${c.name} ${c.dur.toFixed(1)}s`));
  let glint, ctl;
  const out = { try: TRY, sessions: [] };
  try {
    glint = await launchGlint({
      dataDir: 'data-notes', log,
      settings: { hideFromScreenShare: false, attachScreenshotByDefault: true, answerModel: 'deepseek-v4-pro', liveModel: 'deepseek-flash' },
      env: { GLINT_AUDIO_FILE_PACE: 'realtime', GLINT_WHISPER_PREWARM: '1' },
    });
    const { app, overlay } = glint;
    await overlay.evaluate(() => {
      const c = (window.__n = { status: [], fileDone: [] });
      window.glint.session.onStatus((s) => c.status.push(s));
      window.glint.ext.on('audio:fileDone', (d) => c.fileDone.push(d));
    });
    for (const c of clips) {
      const st = unwrap(await overlay.evaluate((f) => window.glint.session.start({ audioFile: f }), c.file));
      const id = st.sessionId;
      const t0 = Date.now();
      const asks = [];
      const doAsk = async (q) => {
        const r = await overlay.evaluate(async (q) => {
          const res = await window.glint.ask.ask(q, { withScreenshot: false, includeTranscript: true, source: 'input' });
          if (!res.ok) return { error: res.error };
          const rid = res.value.requestId;
          return await new Promise((resolve) => {
            const off = window.glint.ask.onDone((e) => { if (e.requestId === rid) { off(); resolve({ answer: e.answer, meta: e.meta }); } });
            window.glint.ask.onError((e) => { if (e.requestId === rid) resolve({ error: e.error }); });
          });
        }, q);
        const a = { q, atSec: +((Date.now() - t0) / 1000).toFixed(1), answer: r.answer, model: r.meta?.model, sessionId: r.meta?.sessionId, usedScreenshot: r.meta?.usedScreenshot, error: r.error };
        asks.push(a);
        log('ask', a);
      };
      if (c.name === 'long') {
        for (const a of ASKS.filter((a) => a.at !== 'end')) {
          await waitFor(async () => Date.now() - t0 >= a.at * 1000, { timeout: 5 * 60_000, every: 500, label: `ask at ${a.at}s` });
          await doAsk(a.q);
        }
      }
      await waitFor(() => overlay.evaluate((id) => window.__n.fileDone.find((d) => d.sessionId === id), id), { timeout: 10 * 60_000, every: 1000, label: `fileDone ${c.name}` });
      if (c.name === 'long') for (const a of ASKS.filter((a) => a.at === 'end')) await doAsk(a.q);
      unwrap(await overlay.evaluate(() => window.glint.session.stop()));
      const saved = await waitFor(() => overlay.evaluate((id) => window.__n.status.find((s) => s.sessionId === id && (s.state === 'saved' || s.state === 'error')), id), { timeout: 5 * 60_000, every: 1000, label: `saved ${c.name}` });
      const rec = unwrap(await overlay.evaluate((id) => window.glint.history.get(id), id));
      const s = { clip: c.name, audioSec: +c.dur.toFixed(1), id, state: saved.state, title: rec.title, durationMs: rec.durationMs, segments: rec.segments.length, actionItems: rec.actionItems.length, summaryChars: (rec.summaryMarkdown ?? '').length, uses: rec.usage.length, ...(asks.length ? { asks } : {}) };
      out.sessions.push(s);
      log('session', s);
    }
    const longId = out.sessions.at(-1).id;

    // D-C6 framing: wallpaper window BEHIND (vibrancy blurs what is behind the dashboard), overlay bar top centre, dashboard 1200x800 in front.
    ctl = await launchControl();
    const disp = await display(app);
    const wa = disp.workArea;
    const reg = { x: Math.round((disp.bounds.width - 1251) / 2), y: wa.y, width: 1251, height: 900 };
    await openWin(ctl, 'wall', { ...reg, html: WALLPAPER, focus: false });
    await overlay.evaluate((id) => window.glint.app.openDashboard({ view: 'history', sessionId: id }), longId);
    const dash = await waitWindow(app, 'dashboard.html');
    await app.evaluate(({ BrowserWindow, app: a }, b) => {
      const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('dashboard'));
      w.setBounds(b); a.focus({ steal: true }); w.focus(); w.moveTop();
    }, { x: reg.x + 26, y: reg.y + 56, width: 1200, height: 800 });
    await waitFor(async () => (await dash.locator('#history-list').innerText()).includes(out.sessions.at(-1).title), { timeout: 20_000, label: 'history rows' });
    await waitFor(() => overlay.evaluate(() => document.querySelector('#status').hidden), { timeout: 12_000, label: 'status strip gone' }).catch(() => {});
    await sleep(1500);
    const dst = await winState(overlay, 'dashboard');
    const ost = await winState(overlay, 'overlay');
    log('dashboard state', dst, '| overlay state', ost);
    out.dashboardContentProtection = dst.contentProtection;
    out.overlayContentProtection = ost.contentProtection;
    expect(dst.contentProtection, 'dashboard must not be protected for the capture').toBe(false);
    region(join(SHOTS, 'notes-history.png'), reg);
    out.listText = await dash.locator('#history-list').innerText();
    out.noteHead = (await dash.locator('#note').innerText()).slice(0, 600);
    log('history list:', out.listText);
    log('note head:', out.noteHead);
    out.compare = img('sidebyside', join(ROOT, 'research/screens/notes-history.png'), join(SHOTS, 'notes-history.png'), join(CMP, 'notes-history.png'), '--height', 900).out;
    log('compare ->', out.compare);
  } finally {
    record(`screens_notes_history_try${TRY}`, { note: 'not a gate; protection OFF; 15 real sessions, 3 real asks in the long one', measured: out });
    await quit(ctl);
    await quit(glint?.app);
  }
});

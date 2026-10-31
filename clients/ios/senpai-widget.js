// Senpai poster widget for Scriptable (iOS): home screen, lock screen and StandBy.
// Shows the poster the wallpaper shows now (GET /api/wall/now): the question, and in the
// poster's second hour its answer. Tapping it opens the feed. See clients/README.md.
//
// Set these three in Scriptable's Keychain once (run the script in the app; it asks):
//   senpai_url, senpai_client_id, senpai_client_secret (an Access service token)

const COLOURS = { fact: '#ffd84d', principle: '#ff8fb8', mechanism: '#5fe0e8', tradeoff: '#ffad5c', procedure: '#8ce99a' };
const INK = new Color('#12131a');

async function setting(key, prompt) {
  if (Keychain.contains(key)) return Keychain.get(key);
  if (config.runsInWidget) return null;
  const a = new Alert();
  a.title = prompt;
  a.addTextField(key);
  a.addAction('Save');
  await a.present();
  const value = a.textFieldValue(0).trim();
  if (value) Keychain.set(key, value);
  return value || null;
}

async function current(base, id, secret) {
  const r = new Request(`${base.replace(/\/+$/, '')}/api/wall/now`);
  r.headers = { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret };
  r.timeoutInterval = 20;
  return r.loadJSON();
}

function widget(data, base) {
  const w = new ListWidget();
  const family = config.widgetFamily || 'medium';
  const accessory = family.startsWith('accessory');
  const p = data && data.poster;
  w.url = `${base}/feed`;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (!p) {
    w.addText(data ? 'Open a lesson to start.' : 'Could not reach Senpai.').font = Font.mediumSystemFont(12);
    return w;
  }
  if (accessory) {   // lock screen: monochrome, a few words
    const t = w.addText(data.reveal ? p.claim : p.ask);
    t.font = Font.semiboldSystemFont(12);
    t.minimumScaleFactor = 0.6;
    return w;
  }
  w.backgroundColor = new Color(COLOURS[p.kind] || COLOURS.fact);
  w.setPadding(12, 14, 12, 14);
  const who = w.addText(`${p.speaker} · ${p.tag || p.lesson}`);
  who.font = Font.mediumSystemFont(10);
  who.textColor = INK;
  who.textOpacity = 0.65;
  w.addSpacer(4);
  const ask = w.addText(p.ask);
  ask.font = Font.boldSystemFont(family === 'small' ? 13 : family === 'large' ? 20 : 15);
  ask.textColor = INK;
  ask.minimumScaleFactor = 0.55;
  if (data.reveal && family !== 'small') {
    w.addSpacer(6);
    const claim = w.addText(p.claim);
    claim.font = Font.systemFont(family === 'large' ? 15 : 11);
    claim.textColor = INK;
    claim.minimumScaleFactor = 0.6;
  }
  w.addSpacer();
  const foot = w.addText(data.reveal ? p.lesson : 'Answer appears next hour · tap to practise');
  foot.font = Font.systemFont(9);
  foot.textColor = INK;
  foot.textOpacity = 0.55;
  return w;
}

async function main() {
  const base = await setting('senpai_url', 'Senpai address (https://leetcode.nikhil.ing)');
  const id = await setting('senpai_client_id', 'Access service token client id');
  const secret = await setting('senpai_client_secret', 'Access service token secret');
  let data = null;
  if (base && id && secret) {
    try { data = await current(base, id, secret); } catch (e) { data = null; }
  }
  const w = widget(data, base || '');
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
}

await main();

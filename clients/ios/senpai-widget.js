// Senpai poster widget for Scriptable (iOS): home screen, lock screen and StandBy.
// Shows what the wallpaper shows now (GET /api/wall/now): the lesson you hold worst and its weak
// ideas, all of them. Tapping it opens the feed. See clients/README.md.
//
// Set these three in Scriptable's Keychain once (run the script in the app; it asks):
//   senpai_url, senpai_client_id, senpai_client_secret (an Access service token)

const BG = new Color('#13224d');
const ACCENTS = ['#ffd84d', '#5fe0e8', '#ff8fb8', '#8ce99a', '#ffad5c'].map((c) => new Color(c));

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
  const shown = data && (data.poster || data.card);
  w.url = `${base}/feed`;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  if (!shown) {
    w.addText(data ? 'Open a lesson to start.' : 'Could not reach Senpai.').font = Font.mediumSystemFont(12);
    return w;
  }
  if (family.startsWith('accessory')) {   // lock screen: monochrome, the lesson's name
    const t = w.addText(shown.title);
    t.font = Font.semiboldSystemFont(12);
    t.minimumScaleFactor = 0.6;
    return w;
  }
  w.backgroundColor = BG;
  w.setPadding(12, 14, 12, 14);
  const title = w.addText(shown.title);
  title.font = Font.heavySystemFont(family === 'large' ? 18 : 13);
  title.textColor = ACCENTS[0];
  title.minimumScaleFactor = 0.6;
  const ideas = family === 'small' ? shown.ideas.slice(0, 1) : shown.ideas;
  ideas.forEach((idea, i) => {
    w.addSpacer(5);
    const t = w.addText(idea);
    t.font = Font.semiboldSystemFont(family === 'large' ? 14 : 10);
    t.textColor = ACCENTS[(i + 1) % ACCENTS.length];
    t.minimumScaleFactor = 0.5;
  });
  w.addSpacer();
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

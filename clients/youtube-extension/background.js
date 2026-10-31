// Fetches what you are learning from Leetcode Senpai (/api/wall/topics), searches YouTube for each
// topic (you are signed in there already, so no API key), and caches the shelf for a few hours.
import {pick, videosFrom} from './parse.js';

const DEFAULTS = {base: 'https://leetcode.nikhil.ing', clientId: '', clientSecret: '', topics: 4, perTopic: 2};
const FRESH = 3 * 3600 * 1000;

async function settings() {
  return {...DEFAULTS, ...(await chrome.storage.sync.get(Object.keys(DEFAULTS)))};
}

async function topics(s) {
  const headers = s.clientId ? {'CF-Access-Client-Id': s.clientId, 'CF-Access-Client-Secret': s.clientSecret} : {};
  const r = await fetch(`${s.base.replace(/\/+$/, '')}/api/wall/topics?n=${s.topics}`, {headers, credentials: 'include', redirect: 'manual'});
  if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) throw Object.assign(new Error('signed out'), {signedOut: true});
  if (!r.ok) throw new Error(`Senpai answered ${r.status}`);
  return (await r.json()).topics || [];
}

async function search(query) {
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {credentials: 'include'});
  if (!r.ok) throw new Error(`YouTube search answered ${r.status}`);
  return videosFrom(await r.text());
}

async function build() {
  const s = await settings();
  const ts = await topics(s);
  const taken = new Set(), videos = [];
  for (const t of ts) {
    try {
      for (const v of pick(await search(t.query), s.perTopic, taken)) videos.push({...v, topic: t.title, why: t.why});
    } catch { /* one search failing leaves the others */ }
  }
  return {at: Date.now(), videos, base: s.base};
}

async function shelf(force) {
  const {cache} = await chrome.storage.local.get('cache');
  if (!force && cache && Date.now() - cache.at < FRESH && cache.videos.length) return cache;
  try {
    const fresh = await build();
    await chrome.storage.local.set({cache: fresh});
    return fresh;
  } catch (e) {
    const s = await settings();
    return {at: Date.now(), videos: cache?.videos || [], base: s.base, error: e.signedOut ? 'signed-out' : String(e.message || e)};
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'shelf') { shelf(!!msg.force).then(reply); return true; }
  return false;
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

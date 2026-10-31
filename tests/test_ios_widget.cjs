// The Scriptable widget (clients/ios/senpai-widget.js) against a stand-in for Scriptable's API.
// Run: node tests/test_ios_widget.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'clients', 'ios', 'senpai-widget.js'), 'utf8');

async function run({ family, data, keychain = { senpai_url: 'https://x.test', senpai_client_id: 'id', senpai_client_secret: 's' }, fail = false }) {
  const texts = [], requests = [];
  let shown = null;
  class Text { constructor(t) { this.text = t; texts.push(this); } }
  class ListWidget {
    addText(t) { return new Text(t); }
    addSpacer() {}
    setPadding() {}
    async presentMedium() { shown = this; }
  }
  class Request {
    constructor(url) { this.url = url; requests.push(this); }
    async loadJSON() { if (fail) throw new Error('offline'); return data; }
  }
  const env = {
    ListWidget, Request, Color: class { constructor(hex) { this.hex = hex; } },
    Font: new Proxy({}, { get: () => size => ({ size }) }),
    Keychain: { contains: k => k in keychain, get: k => keychain[k], set: (k, v) => { keychain[k] = v; } },
    Alert: class {}, config: { runsInWidget: true, widgetFamily: family },
    Script: { setWidget: w => { shown = w; }, complete: () => {} },
  };
  const fn = new Function(...Object.keys(env), `return (async () => {\n${source}\n})();`);
  await fn(...Object.values(env));
  return { shown, texts: texts.map(t => t.text), requests };
}

const poster = { kind: 'mechanism', ask: 'Why delete, not set?', claim: 'Deletes are order-insensitive.', lesson: 'Cache-aside',
  speaker: 'Jo', tag: 'Before it fades' };

(async () => {
  let r = await run({ family: 'medium', data: { poster, reveal: false } });
  assert.strictEqual(r.requests[0].url, 'https://x.test/api/wall/now');
  assert.strictEqual(r.requests[0].headers['CF-Access-Client-Id'], 'id');
  assert.ok(r.texts.includes('Why delete, not set?') && !r.texts.includes('Deletes are order-insensitive.'));
  assert.strictEqual(r.shown.url, 'https://x.test/feed');
  assert.strictEqual(r.shown.backgroundColor.hex, '#5fe0e8');

  r = await run({ family: 'large', data: { poster, reveal: true } });
  assert.ok(r.texts.includes('Deletes are order-insensitive.'));

  r = await run({ family: 'accessoryRectangular', data: { poster, reveal: true } });
  assert.deepStrictEqual(r.texts, ['Deletes are order-insensitive.']);

  r = await run({ family: 'small', data: null, fail: true });
  assert.deepStrictEqual(r.texts, ['Could not reach Senpai.']);

  r = await run({ family: 'small', data: null, keychain: {} });
  assert.strictEqual(r.requests.length, 0);
  console.log('ios widget: ok');
})().catch(e => { console.error(e); process.exit(1); });

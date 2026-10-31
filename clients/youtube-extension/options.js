const KEYS = {base: 'https://leetcode.nikhil.ing', clientId: '', clientSecret: '', topics: 4, perTopic: 2};
chrome.storage.sync.get(Object.keys(KEYS)).then(s => {
  for (const [k, d] of Object.entries(KEYS)) document.getElementById(k).value = s[k] ?? d;
});
document.getElementById('save').addEventListener('click', async () => {
  const v = k => document.getElementById(k).value.trim();
  await chrome.storage.sync.set({base: v('base') || KEYS.base, clientId: v('clientId'), clientSecret: v('clientSecret'),
                                 topics: Math.max(1, Math.min(12, Number(v('topics')) || 4)),
                                 perTopic: Math.max(1, Math.min(4, Number(v('perTopic')) || 2))});
  const d = await chrome.runtime.sendMessage({type: 'shelf', force: true});
  document.getElementById('saved').textContent = d.error === 'signed-out' ? 'Saved, but Senpai says you are signed out.'
    : d.error ? `Saved. ${d.error}` : `Saved: ${d.videos.length} videos ready.`;
});

// The YouTube extension's parser (clients/youtube-extension/parse.js). Run: node tests/test_youtube_extension.mjs
import assert from 'node:assert/strict';
import {pick, seconds, videosFrom} from '../clients/youtube-extension/parse.js';

const vr = (id, length, title = `Video ${id}`) => ({videoRenderer: {videoId: id, title: {runs: [{text: title}]},
  ownerText: {runs: [{text: 'Chan'}]}, lengthText: length ? {simpleText: length} : undefined, shortViewCountText: {simpleText: '5k views'}}});
const data = {contents: {twoColumnSearchResultsRenderer: {primaryContents: {sectionListRenderer: {contents: [
  {itemSectionRenderer: {contents: [vr('a', '9:01'), {shelfRenderer: {content: {items: [vr('b', '0:45')]}}}, vr('c', '1:42:10'), vr('d', '30:14'), vr('a', '9:01')]}}]}}}}};
const html = `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;

const vids = videosFrom(html);
assert.deepEqual(vids.map(v => v.id), ['a', 'b', 'c', 'd', 'a']);
assert.equal(vids[0].title, 'Video a');
assert.equal(vids[0].channel, 'Chan');
assert.equal(seconds('1:42:10'), 6130);
assert.deepEqual(pick(vids, 5).map(v => v.id), ['a', 'd']);   // no Shorts, no 100-minute streams, no repeats
const taken = new Set(['a']);
assert.deepEqual(pick(vids, 1, taken).map(v => v.id), ['d']);
assert.deepEqual(videosFrom('<html>no data</html>'), []);
console.log('youtube extension: ok');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compose, upgrade } = require('../static/dictate.js');

test('dictation appends after existing text with one space', () => {
  assert.equal(compose('use a heap', ['then pop k times'], ''), 'use a heap then pop k times');
  assert.equal(compose('use a heap ', ['then pop'], ''), 'use a heap then pop');
  assert.equal(compose('line\n', ['next'], ''), 'line\nnext');
});

test('dictation joins final and interim pieces and drops blanks', () => {
  assert.equal(compose('', [' two pointers', 'from both ends '], ' shrink'), 'two pointers from both ends shrink');
  assert.equal(compose('', ['', '  '], ''), '');
  assert.equal(compose('kept', [], ''), 'kept');
});

test('the accurate transcript replaces the live one in place', () => {
  assert.equal(upgrade('Plan: use a hash nap of counts', 'use a hash nap of counts', 'use a hash map of counts'),
    'Plan: use a hash map of counts');
  // text typed after the dictation survives
  assert.equal(upgrade('o of n time. then sort', 'o of n time.', 'O(n) time.'), 'O(n) time. then sort');
  // the latest occurrence is the dictated one
  assert.equal(upgrade('heap heap', 'heap', 'Heap'), 'heap Heap');
});

test('edits inside the live transcript win over the accurate one', () => {
  assert.equal(upgrade('use a hash map of counts', 'use a hash nap of counts', 'use a hashmap of counts'),
    'use a hash map of counts');
  assert.equal(upgrade('same', 'same', ''), 'same');
  assert.equal(upgrade('same', '', 'x'), 'same');
  // extending the last dictated word is an edit, not a match
  assert.equal(upgrade('two pointers', 'two pointer', 'Two pointer'), 'two pointers');
  assert.equal(upgrade('a two pointer', 'two pointer', 'Two pointer'), 'a Two pointer');
  assert.equal(upgrade('it is a heap.', 'a heap', 'a min-heap'), 'it is a min-heap.');
});

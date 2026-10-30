const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compose } = require('../static/dictate.js');

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

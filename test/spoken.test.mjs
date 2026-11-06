import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardinal, moneyWords, ordinal, timeWords, yearWords } from '../src/numbers.mjs';
import { chunk, normalize, toSpoken } from '../src/spoken.mjs';

test('numbers as words', () => {
  assert.equal(cardinal(0), 'zero');
  assert.equal(cardinal(42), 'forty-two');
  assert.equal(cardinal(1250), 'one thousand two hundred fifty');
  assert.equal(cardinal(987000000), 'nine hundred eighty-seven million');
  assert.equal(ordinal(1), 'first');
  assert.equal(ordinal(22), 'twenty-second');
  assert.equal(ordinal(40), 'fortieth');
  assert.equal(yearWords(2026), 'twenty twenty-six');
  assert.equal(yearWords(2005), 'two thousand five');
  assert.equal(yearWords(1905), 'nineteen oh five');
  assert.equal(yearWords(1900), 'nineteen hundred');
  assert.equal(timeWords(15, 30, ''), 'three thirty in the afternoon');
  assert.equal(timeWords(9, 5, 'am'), 'nine oh five in the morning');
  assert.equal(timeWords(12, 0, 'pm'), 'noon');
  assert.equal(moneyWords('$', '19.99'), 'nineteen dollars ninety-nine');
  assert.equal(moneyWords('$', '1'), 'one dollar');
  assert.equal(moneyWords('$', '0.50'), 'fifty cents');
  assert.equal(moneyWords('$', '1.2', 'B'), 'one point two billion dollars');
});

const cases = [
  ['The update costs $19.99 and saves 45% of the time.', 'The update costs nineteen dollars ninety-nine and saves forty-five percent of the time.'],
  ['Version v2.6.2 shipped in 2026.', 'Version version two point six point two shipped in twenty twenty-six.'],
  ['It takes 10-20 ms, e.g. at 3:30 pm.', 'It takes ten to twenty milliseconds, for example at three thirty in the afternoon.'],
  ['Download 5 GB from https://example.com/a?b=1 today.', 'Download five gigabytes from the link on this page today.'],
  ['Read the guide (https://example.com/guide) first.', 'Read the guide first.'],
  ['Write to me@example.com.', 'Write to me at example dot com.'],
  ['Run `npm install` and then `client.connect({ retries: 3 })`.', 'Run npm install and then the code on the page.'],
  ['Open `config.json` now.', 'Open config dot json now.'],
  ['Use **bold**, _italic_ and [a link](https://x.y).', 'Use bold, italic and a link.'],
  ['The 1990s; the 3rd of 1,250 users.', 'The nineteen nineties. The third of one thousand two hundred fifty users.'],
  ['C++ & C# (and more) are here.', 'C plus plus and C sharp, and more, are here.'],
  ['MP3, x86 and 3D stay as they are.', 'MP3, x86 and 3D stay as they are.'],
  ['At 5 p.m. we met.', 'At five in the afternoon we met.'],
  ['It is 3x faster in 4K at 1080p, with Node.js 18+.', 'It is three times faster in four K at ten eighty p, with Node.js eighteen plus.'],
  ['Settings → Export', 'Settings, then Export'],
  ['Read/write and and/or.', 'Read or write and and or.'],
  ['Call 555-123-4567.', 'Call five five five, one two three, four five six seven.'],
  ['A list: 1/3 of $1.2B, €50, £3.', 'A list: one third of one point two billion dollars, fifty euros, three pounds.'],
  ['Done on 2026-11-06.', 'Done on November sixth, twenty twenty-six.'],
  ['Edit /etc/hosts now.', 'Edit the path on the page now.'],
  ['Hello 👋 world — again.', 'Hello world, again.'],
  ['See the docs, etc. Then go.', 'See the docs, and so on. Then go.'],
];

for (const [input, expected] of cases) {
  test(`normalize: ${input}`, () => assert.equal(normalize(input), expected));
}

test('normalize: other languages keep numbers and drop URLs', () => {
  assert.equal(normalize('Es kostet 45% mehr: https://example.de', { language: 'German' }), 'Es kostet 45% mehr:');
});

test('normalize: replacements', () => {
  assert.equal(normalize('The API is fast.', { replace: { API: 'A P I' } }), 'The A P I is fast.');
});

test('toSpoken: title, list ordinals, notices and headings', () => {
  const blocks = [
    { type: 'heading', level: 2, text: 'Setup' },
    { type: 'paragraph', text: 'Do these steps:' },
    { type: 'list', ordered: true, items: [{ text: 'Open the app', level: 0 }, { text: 'Select a voice', level: 0 }, { text: 'Inner', level: 1 }] },
    { type: 'skip', what: 'code' },
    { type: 'skip', what: 'code' },
    { type: 'skip', what: 'table' },
  ];
  const r = toSpoken({ title: 'My post', blocks });
  assert.deepEqual(r.paragraphs, [
    'My post.',
    'Do these steps.',
    'First, Open the app. Second, Select a voice. Inner.',
    'There is a code example on the page.',
    'There is a table on the page.',
  ]);
  assert.deepEqual(r.skipped, { code: 2, table: 1 });
  const h = toSpoken({ title: 'T', blocks }, { headings: true, readTitle: false, notices: false, intro: 'An audio version.' });
  assert.deepEqual(h.paragraphs.slice(0, 2), ['An audio version.', 'Setup.']);
  assert.ok(!h.text.includes('code example'));
});

test('chunk: parts are not longer than the limit and keep the text', () => {
  const paras = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${'Some words here. '.repeat(5 + (i % 9))}`.trim());
  const parts = chunk(paras, 1900);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 1900, `part has ${p.length} characters`);
  assert.equal(parts.join('\n\n'), paras.join('\n\n'));
  const long = chunk([`${'A long sentence with many words. '.repeat(100)}`.trim()], 500);
  for (const p of long) assert.ok(p.length <= 500);
  assert.equal(long.join(' ').replace(/\s+/g, ' '), `${'A long sentence with many words. '.repeat(100)}`.trim());
});

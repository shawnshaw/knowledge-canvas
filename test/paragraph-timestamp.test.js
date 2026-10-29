import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addParagraphTimestamp,
  formatTimestampMarker,
  parseTimestampMarker,
  scanParagraphs,
  stampChangedParagraphs,
} from '../src/paragraph-timestamp.js';

const clock = (iso) => () => new Date(iso);
const CREATED = '2026-10-17T14:30:00.000Z';
const UPDATED = '2026-10-17T15:12:00.000Z';

test('a well-formed marker parses and anything else does not', () => {
  assert.deepEqual(parseTimestampMarker(`<!-- kc-time: {"createdAt":"${CREATED}"} -->`), { createdAt: CREATED });
  assert.deepEqual(parseTimestampMarker(`<!-- kc-time: {"createdAt":"${CREATED}","updatedAt":"${UPDATED}"} -->`), {
    createdAt: CREATED,
    updatedAt: UPDATED,
  });
  assert.equal(parseTimestampMarker('普通正文'), null);
  assert.equal(parseTimestampMarker('<!-- kc-time: {} -->'), null);
  assert.equal(parseTimestampMarker('<!-- kc-time: not json -->'), null);
  assert.equal(parseTimestampMarker(`<!-- kc-time: {"createdAt":"${CREATED}","updatedAt":"nope"} -->`), null);
});

test('the marker is written exactly as documented', () => {
  assert.equal(formatTimestampMarker({ createdAt: CREATED }), `<!-- kc-time: {"createdAt":"${CREATED}"} -->`);
  assert.equal(
    formatTimestampMarker({ createdAt: CREATED, updatedAt: UPDATED }),
    `<!-- kc-time: {"createdAt":"${CREATED}","updatedAt":"${UPDATED}"} -->`,
  );
});

test('a marker is inserted after the paragraph under the cursor', () => {
  const text = `第一段。\n\n第二段。`;
  const result = addParagraphTimestamp(text, 0, clock(CREATED));
  assert.equal(result.added, true);
  assert.equal(result.text, `第一段。\n\n<!-- kc-time: {"createdAt":"${CREATED}"} -->\n第二段。`);
});

test('a cursor inside the second paragraph marks that paragraph only', () => {
  const text = `第一段。\n\n第二段。`;
  const result = addParagraphTimestamp(text, text.indexOf('第二段'), clock(CREATED));
  assert.equal(result.text, `第一段。\n\n第二段。\n<!-- kc-time: {"createdAt":"${CREATED}"} -->`);
});

test('an already marked paragraph is never marked twice', () => {
  const text = `第一段。\n\n<!-- kc-time: {"createdAt":"${CREATED}"} -->`;
  const result = addParagraphTimestamp(text, 0, clock(UPDATED));
  assert.equal(result.added, false);
  assert.equal(result.text, text);
  assert.equal(result.marker.createdAt, CREATED);
});

test('blank lines, fenced code, frontmatter and marker lines are not paragraphs', () => {
  const text = [
    '---',
    'title: 测试',
    '---',
    '',
    '```js',
    'const a = 1;',
    '```',
    '',
    `<!-- kc-time: {"createdAt":"${CREATED}"} -->`,
  ].join('\n');
  assert.equal(addParagraphTimestamp(text, text.indexOf('const a'), clock(UPDATED)), null, 'the cursor sits in the code block');
  assert.equal(addParagraphTimestamp(text, 0, clock(UPDATED)), null, 'frontmatter is not a paragraph');
  const markerOffset = text.indexOf('<!-- kc-time');
  assert.equal(addParagraphTimestamp(text, markerOffset, clock(UPDATED)), null, 'the marker is not a paragraph');
});

test('changing a marked paragraph stamps updatedAt and keeps createdAt', () => {
  const previous = `第一段。\n\n<!-- kc-time: {"createdAt":"${CREATED}"} -->\n\n第二段。`;
  const next = `第一段改。\n\n<!-- kc-time: {"createdAt":"${CREATED}"} -->\n\n第二段。`;
  const result = stampChangedParagraphs(next, previous, clock(UPDATED));
  assert.equal(result.updated, 1);
  assert.equal(
    result.text,
    `第一段改。\n\n<!-- kc-time: {"createdAt":"${CREATED}","updatedAt":"${UPDATED}"} -->\n\n第二段。`,
  );
});

test('a no-op save leaves timestamps untouched', () => {
  const text = `第一段。\n\n<!-- kc-time: {"createdAt":"${CREATED}"} -->`;
  const result = stampChangedParagraphs(text, text, clock(UPDATED));
  assert.equal(result.updated, 0);
  assert.equal(result.text, text);
});

test('only the paragraph that actually changed is stamped', () => {
  const previous = [
    '甲。',
    `<!-- kc-time: {"createdAt":"${CREATED}"} -->`,
    '',
    '乙。',
    `<!-- kc-time: {"createdAt":"2026-10-17T14:40:00.000Z"} -->`,
  ].join('\n');
  const next = previous.replace('乙。', '乙改。');
  const result = stampChangedParagraphs(next, previous, clock(UPDATED));
  assert.equal(result.updated, 1);
  assert.match(result.text, /"createdAt":"2026-10-17T14:40:00.000Z","updatedAt":"2026-10-17T15:12:00.000Z"/);
  assert.ok(result.text.startsWith('甲。'), 'the untouched paragraph keeps its own marker');
});

test('an unmarked paragraph is never given an updatedAt', () => {
  const previous = '甲。';
  const next = '甲改。';
  const result = stampChangedParagraphs(next, previous, clock(UPDATED));
  assert.equal(result.updated, 0);
  assert.equal(result.text, next);
});

test('the scan records markers against the nearest preceding paragraph', () => {
  const text = `甲。\n\n<!-- kc-time: {"createdAt":"${CREATED}"} -->\n\n乙。`;
  const { blocks } = scanParagraphs(text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, '甲。');
  assert.equal(blocks[0].marker.createdAt, CREATED);
  assert.equal(blocks[1].marker, null);
});

test('a fenced block never absorbs a marker', () => {
  const text = ['```', `<!-- kc-time: {"createdAt":"${CREATED}"} -->`, '```'].join('\n');
  assert.equal(scanParagraphs(text).blocks.length, 0);
  const result = stampChangedParagraphs(`${text}\n`, text, clock(UPDATED));
  assert.equal(result.updated, 0);
});

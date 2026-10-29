import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXCERPT_CONTEXT,
  EXCERPT_VERSION,
  createExcerptAnchor,
  excerptSourcePath,
  excerptTextFromQuote,
  formatLocalTimestamp,
  locateExcerpt,
  markExcerptsUpdated,
  markdownReference,
  staleExcerptIds,
  validateExcerptAnchor,
} from '../src/excerpt-anchor.js';

const SOURCE = '第一段文字。\n第二段里有复利这个词，复利很重要。\n第三段也提到复利。';

test('creates an anchor that snapshots the quote and its context', () => {
  const start = SOURCE.indexOf('复利这个词');
  const anchor = createExcerptAnchor({ source: SOURCE, start, end: start + 5, sourceFile: 'Notes/Book.md' });
  assert.equal(anchor.version, EXCERPT_VERSION);
  assert.equal(anchor.sourceFile, 'Notes/Book.md');
  assert.equal(anchor.quote, '复利这个词');
  assert.equal(anchor.start, start);
  assert.equal(anchor.end, start + 5);
  assert.equal(SOURCE.slice(start - anchor.prefix.length, start), anchor.prefix);
  assert.equal(SOURCE.slice(start + 5, start + 5 + anchor.suffix.length), anchor.suffix);
  assert.ok(anchor.prefix.length <= EXCERPT_CONTEXT);
  assert.ok(anchor.suffix.length <= EXCERPT_CONTEXT);
});

test('a whitespace-only selection cannot become an anchor', () => {
  assert.equal(createExcerptAnchor({ source: 'a   b', start: 1, end: 4, sourceFile: 'A.md' }), null);
  assert.equal(createExcerptAnchor({ source: 'abc', start: 1, end: 1, sourceFile: 'A.md' }), null);
  assert.equal(createExcerptAnchor({ source: '', start: 0, end: 0, sourceFile: 'A.md' }), null);
});

test('reversed and out-of-range offsets are normalized instead of throwing', () => {
  const anchor = createExcerptAnchor({ source: 'abcdef', start: 4, end: 2, sourceFile: 'A.md' });
  assert.equal(anchor.quote, 'cd');
  assert.equal(anchor.start, 2);
  assert.equal(anchor.end, 4);
  const clamped = createExcerptAnchor({ source: 'abcdef', start: 3, end: 99, sourceFile: 'A.md' });
  assert.equal(clamped.quote, 'def');
});

test('a valid anchor passes validation and a broken one explains itself', () => {
  const good = createExcerptAnchor({ source: SOURCE, start: 0, end: 5, sourceFile: 'A.md' });
  assert.equal(validateExcerptAnchor(good), null);

  assert.match(validateExcerptAnchor(null), /对象/);
  assert.match(validateExcerptAnchor({ ...good, version: 2 }), /版本/);
  assert.match(validateExcerptAnchor({ ...good, sourceFile: '  ' }), /sourceFile/);
  assert.match(validateExcerptAnchor({ ...good, quote: '' }), /quote/);
  assert.match(validateExcerptAnchor({ ...good, start: 'x' }), /start\/end/);
  assert.match(validateExcerptAnchor({ ...good, start: 5, end: 1 }), /start\/end/);
  assert.match(validateExcerptAnchor({ ...good, start: -1 }), /start\/end/);
  assert.match(validateExcerptAnchor({ ...good, prefix: undefined }), /prefix\/suffix/);
});

test('locates the quote at its original offsets when the source is unchanged', () => {
  const anchor = createExcerptAnchor({ source: SOURCE, start: SOURCE.indexOf('复利这个词'), end: SOURCE.indexOf('复利这个词') + 5, sourceFile: 'A.md' });
  assert.deepEqual(locateExcerpt(SOURCE, anchor), { found: true, start: anchor.start, end: anchor.end, strategy: 'offsets' });
});

test('falls back to a unique quote match after the text before it changed', () => {
  const start = SOURCE.indexOf('复利这个词');
  const anchor = createExcerptAnchor({ source: SOURCE, start, end: start + 5, sourceFile: 'A.md' });
  const edited = `新增的开头。\n${SOURCE}`;
  const located = locateExcerpt(edited, anchor);
  assert.equal(located.found, true);
  assert.equal(located.strategy, 'unique');
  assert.equal(edited.slice(located.start, located.end), '复利这个词');
});

test('disambiguates repeated quotes using prefix and suffix context', () => {
  const start = SOURCE.lastIndexOf('复利');
  const anchor = createExcerptAnchor({ source: SOURCE, start, end: start + 2, sourceFile: 'A.md' });
  assert.ok(anchor.prefix.endsWith('也提到'));

  // Prepending text shifts every offset, so the saved offsets miss and the two
  // occurrences of 复利 have to be told apart by context.
  const edited = `补一句。\n${SOURCE}`;
  const located = locateExcerpt(edited, anchor);
  assert.equal(located.found, true);
  assert.equal(located.strategy, 'context');
  assert.equal(edited.slice(located.start, located.end), '复利');
  assert.equal(edited.slice(located.start - 3, located.start), '也提到');
});

test('multiple matches tie on context, so the nearest original offset wins', () => {
  const source = '复利。\n\n复利。';
  const anchor = { version: 1, sourceFile: 'A.md', quote: '复利', start: 6, end: 8, prefix: '', suffix: '。' };
  const located = locateExcerpt(source, anchor);
  assert.equal(located.found, true);
  assert.equal(located.strategy, 'context');
  assert.equal(located.start, 5);
});

test('reports a miss instead of guessing when the quote is gone', () => {
  const anchor = createExcerptAnchor({ source: SOURCE, start: 0, end: 5, sourceFile: 'A.md' });
  assert.deepEqual(locateExcerpt('完全不同的内容', anchor), { found: false, strategy: 'none' });
  assert.deepEqual(locateExcerpt(SOURCE, { ...anchor, quote: '' }), { found: false, strategy: 'none' });
  assert.deepEqual(locateExcerpt(SOURCE, null), { found: false, strategy: 'none' });
});

test('builds the degraded canvas text from the quote', () => {
  assert.equal(excerptTextFromQuote('复利'), '> 复利');
  assert.equal(excerptTextFromQuote('第一行\n第二行'), '> 第一行\n> 第二行');
  assert.equal(excerptTextFromQuote('  两侧留白  '), '> 两侧留白');
});

test('repeated quotes with no usable context are reported as a miss, not a guess', () => {
  const source = '复利。\n\n复利。';
  const anchor = { version: 1, sourceFile: 'A.md', quote: '复利', start: 6, end: 8, prefix: '完全对不上', suffix: '也对不上' };
  assert.deepEqual(locateExcerpt(source, anchor), { found: false, strategy: 'none' });

  // one side of the context still matching is enough to trust the match
  const halfContext = { ...anchor, suffix: '。' };
  assert.equal(locateExcerpt(source, halfContext).found, true);
});

test('a sourceFile that is not Markdown is rejected', () => {
  const good = createExcerptAnchor({ source: 'abc', start: 0, end: 3, sourceFile: 'Notes/Book.md' });
  assert.equal(validateExcerptAnchor(good), null);
  assert.match(validateExcerptAnchor({ ...good, sourceFile: 'assets/image.png' }), /sourceFile/);
  assert.match(validateExcerptAnchor({ ...good, sourceFile: 'no-extension' }), /sourceFile/);
  assert.match(validateExcerptAnchor({ ...good, sourceFile: '  ' }), /sourceFile/);
});

test('one rule decides what counts as a Markdown reference', () => {
  assert.equal(markdownReference('A.md'), 'A.md');
  assert.equal(markdownReference('  Notes/A.md  '), 'Notes/A.md');
  assert.equal(markdownReference('Notes/A.MD'), 'Notes/A.MD');
  assert.equal(markdownReference('image.png'), null);
  assert.equal(markdownReference('A'), null);
  assert.equal(markdownReference(''), null);
  assert.equal(markdownReference(undefined), null);
  assert.equal(markdownReference(42), null);
});

test('excerptSourcePath normalizes the path the anchor points at', () => {
  assert.equal(excerptSourcePath({ sourceFile: 'A.md ' }), 'A.md');
  assert.equal(excerptSourcePath({ sourceFile: 'Notes/B.md' }), 'Notes/B.md');
  assert.equal(excerptSourcePath({ sourceFile: 'image.png' }), null);
  assert.equal(excerptSourcePath(null), null);
  assert.equal(excerptSourcePath(undefined), null);
});

test('a new anchor records its creation time from the injected clock', () => {
  const anchor = createExcerptAnchor({
    source: 'abcdef',
    start: 1,
    end: 3,
    sourceFile: 'A.md',
    now: () => new Date('2026-10-17T14:30:00.000Z'),
  });
  assert.equal(anchor.createdAt, '2026-10-17T14:30:00.000Z');
});

test('timestamps are optional for old anchors but must be real when present', () => {
  const anchor = createExcerptAnchor({ source: 'abcdef', start: 1, end: 3, sourceFile: 'A.md' });
  assert.equal(validateExcerptAnchor(anchor), null);
  assert.equal(validateExcerptAnchor({ ...anchor, createdAt: undefined, updatedAt: undefined }), null);
  assert.match(validateExcerptAnchor({ ...anchor, createdAt: 'yesterday' }), /createdAt/);
  assert.match(validateExcerptAnchor({ ...anchor, updatedAt: '2026-13-40' }), /updatedAt/);
  assert.equal(validateExcerptAnchor({ ...anchor, updatedAt: '2026-10-17T15:12:00.000Z' }), null);
});

test('a local timestamp label is blank when the value cannot be parsed', () => {
  assert.notEqual(formatLocalTimestamp('2026-10-17T14:30:00.000Z'), '');
  assert.equal(formatLocalTimestamp('not a date'), '');
});

test('only excerpts whose quote disappeared are considered stale', () => {
  const source = '甲段里提到复利。\n\n乙段也有复利。';
  const anchor = createExcerptAnchor({ source, start: source.indexOf('复利'), end: source.indexOf('复利') + 2, sourceFile: 'A.md' });
  const nodes = [
    { id: 'e1', kcExcerpt: anchor },
    { id: 'e2', kcExcerpt: { ...anchor, sourceFile: 'B.md' } },
    { id: 'e3', kcExcerpt: { ...anchor, sourceFile: 'C.md', quote: '不存在的句子', start: 0, end: 3, prefix: '', suffix: '' } },
  ];
  assert.deepEqual(staleExcerptIds(nodes, 'A.md', source), []);

  const edited = source.replaceAll('复利', '收益');
  assert.deepEqual(staleExcerptIds(nodes, 'A.md', edited), ['e1']);
});

test('marking excerpts rewrites only the given ids and keeps createdAt', () => {
  const nodes = [
    { id: 'e1', kcExcerpt: { createdAt: '2026-10-01T00:00:00.000Z' } },
    { id: 'e2', kcExcerpt: { createdAt: '2026-10-02T00:00:00.000Z' } },
  ];
  const changed = markExcerptsUpdated(nodes, ['e1'], '2026-10-17T15:12:00.000Z');
  assert.equal(changed, 1);
  assert.deepEqual(nodes[0].kcExcerpt, {
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-17T15:12:00.000Z',
  });
  assert.deepEqual(nodes[1].kcExcerpt, { createdAt: '2026-10-02T00:00:00.000Z' });
});

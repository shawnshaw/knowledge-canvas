import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOLD_MARKER,
  CODE_MARKER,
  HIGHLIGHT_MARKER,
  HEADING_LEVELS,
  ITALIC_MARKER,
  LIST_PREFIX,
  QUOTE_PREFIX,
  setHeading,
  toggleInlineFormat,
  toggleLinePrefix,
} from '../src/markdown-format.js';

test('exposes the first-version format menu constants', () => {
  assert.equal(BOLD_MARKER, '**');
  assert.equal(ITALIC_MARKER, '*');
  assert.equal(HIGHLIGHT_MARKER, '==');
  assert.equal(CODE_MARKER, '`');
  assert.equal(QUOTE_PREFIX, '> ');
  assert.equal(LIST_PREFIX, '- ');
  assert.deepEqual(HEADING_LEVELS, [0, 1, 2, 3]);
});

test('bold wraps the selection and keeps it selected', () => {
  assert.deepEqual(toggleInlineFormat({ text: '复利很重要', start: 0, end: 2 }, BOLD_MARKER), {
    text: '**复利**很重要', start: 2, end: 4,
  });
});

test('bold unwraps text that already carries exactly that marker', () => {
  assert.deepEqual(toggleInlineFormat({ text: '**复利**很重要', start: 2, end: 4 }, BOLD_MARKER), {
    text: '复利很重要', start: 0, end: 2,
  });
});

test('italic on bold text adds emphasis instead of stripping a single star', () => {
  assert.deepEqual(toggleInlineFormat({ text: '**复利**', start: 2, end: 4 }, ITALIC_MARKER), {
    text: '***复利***', start: 3, end: 5,
  });
});

test('highlight and inline code toggle their own markers', () => {
  assert.deepEqual(toggleInlineFormat({ text: 'abc', start: 0, end: 3 }, HIGHLIGHT_MARKER), {
    text: '==abc==', start: 2, end: 5,
  });
  assert.deepEqual(toggleInlineFormat({ text: '==abc==', start: 2, end: 5 }, HIGHLIGHT_MARKER), {
    text: 'abc', start: 0, end: 3,
  });
  assert.deepEqual(toggleInlineFormat({ text: 'const a', start: 0, end: 7 }, CODE_MARKER), {
    text: '`const a`', start: 1, end: 8,
  });
  assert.deepEqual(toggleInlineFormat({ text: '`const a`', start: 1, end: 8 }, CODE_MARKER), {
    text: 'const a', start: 0, end: 7,
  });
});

test('a caret inserts an empty marker pair and lands inside it', () => {
  assert.deepEqual(toggleInlineFormat({ text: 'ab', start: 1, end: 1 }, BOLD_MARKER), {
    text: 'a****b', start: 3, end: 3,
  });
});

test('inline formatting never touches text outside the selection', () => {
  assert.equal(toggleInlineFormat({ text: '前选中后', start: 1, end: 3 }, BOLD_MARKER).text, '前**选中**后');
});

test('quote prefixes every selected line and toggles back off', () => {
  const text = '第一行\n第二行\n第三行';
  const on = toggleLinePrefix({ text, start: 0, end: 5 }, QUOTE_PREFIX);
  assert.equal(on.text, '> 第一行\n> 第二行\n第三行');
  // the selection ends up covering exactly the whole lines the selection touched
  assert.deepEqual([on.start, on.end], [0, '> 第一行\n> 第二行'.length]);
  assert.equal(toggleLinePrefix(on, QUOTE_PREFIX).text, text);
});

test('list prefixes selected lines with a dash', () => {
  assert.equal(toggleLinePrefix({ text: '甲\n乙', start: 0, end: 1 }, LIST_PREFIX).text, '- 甲\n乙');
});

test('each line toggles independently so a mixed block never double-prefixes', () => {
  assert.equal(toggleLinePrefix({ text: '> 甲\n乙', start: 0, end: 5 }, QUOTE_PREFIX).text, '甲\n> 乙');
});

test('blank lines inside a selection are left alone', () => {
  assert.equal(toggleLinePrefix({ text: '甲\n\n乙', start: 0, end: 4 }, LIST_PREFIX).text, '- 甲\n\n- 乙');
});

test('line formatting never touches text outside the selection', () => {
  assert.equal(toggleLinePrefix({ text: '前\n选中\n后', start: 2, end: 4 }, LIST_PREFIX).text, '前\n- 选中\n后');
});

test('heading sets and clears the level on whole lines only', () => {
  const text = '标题\n正文一\n正文二';
  const h1 = setHeading({ text, start: 0, end: 2 }, 1);
  assert.equal(h1.text, '# 标题\n正文一\n正文二');
  assert.deepEqual([h1.start, h1.end], [0, '# 标题'.length]);
  assert.equal(setHeading({ text, start: 0, end: 2 }, 2).text, '## 标题\n正文一\n正文二');
  assert.equal(setHeading({ text: '# 标题\n正文一\n正文二', start: 3, end: 5 }, 0).text, '标题\n正文一\n正文二');
  assert.equal(setHeading({ text: '## 标题\n正文一', start: 3, end: 5 }, 3).text, '### 标题\n正文一');
});

test('heading applies to every selected line', () => {
  assert.equal(setHeading({ text: '甲\n乙\n丙', start: 0, end: 3 }, 2).text, '## 甲\n## 乙\n丙');
});

test('a caret still formats its whole line', () => {
  assert.equal(setHeading({ text: '甲\n乙', start: 2, end: 2 }, 1).text, '甲\n# 乙');
  assert.equal(toggleLinePrefix({ text: '甲\n乙', start: 2, end: 2 }, LIST_PREFIX).text, '甲\n- 乙');
});

test('heading level 0 is 正文 and only strips an existing heading', () => {
  assert.equal(setHeading({ text: '#### 甲\n乙', start: 0, end: 2 }, 0).text, '甲\n乙');
  assert.equal(setHeading({ text: '甲', start: 0, end: 1 }, 0).text, '甲');
});

test('heading is never applied to a blank line', () => {
  assert.equal(setHeading({ text: '甲\n\n乙', start: 0, end: 4 }, 1).text, '# 甲\n\n# 乙');
});

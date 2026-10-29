function frontmatterValue(content, key) {
  const match = content.match(new RegExp(`^${key}:\\s*["']?([^\\n"']+)["']?\\s*$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

function displayLink(value) {
  const match = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  const target = match ? (match[2] || match[1]) : value;
  return target.split('/').at(-1) ?? '';
}

export function toReadFlowCard(file, content, frontmatter = {}) {
  if (frontmatter.type !== 'highlight') return null;
  const body = content.replace(/^---\n[\s\S]*?\n---\s*/, '');
  const quoteMatch = body.match(/(?:^|\n)((?:>[^\n]*(?:\n|$))+)/);
  const excerpt = (quoteMatch?.[1] ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.replace(/^>\s?/, '').trimEnd())
    .join('\n')
    .trim();
  const commentMatch = body.match(/^## 我的想法\s*\n([\s\S]*?)(?=^##\s|\s*$)/m);
  const comment = commentMatch?.[1]?.trim() ?? '';
  const book = displayLink(String(frontmatter.book ?? frontmatterValue(content, 'book')));
  const title = excerpt.replace(/\s+/g, ' ').slice(0, 36) || file.basename || 'ReadFlow 摘录';
  return {
    kind: 'readflow',
    title,
    excerpt,
    comment,
    book,
    chapter: String(frontmatter.chapter ?? frontmatterValue(content, 'chapter')),
    sourceId: String(frontmatter.id ?? frontmatterValue(content, 'id')),
  };
}

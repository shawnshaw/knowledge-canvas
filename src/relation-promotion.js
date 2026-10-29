export class RelationSourceRequiredError extends Error {
  constructor() {
    super('Undirected relation requires an explicit source node');
    this.name = 'RelationSourceRequiredError';
  }
}

function wikilink(path) {
  return `[[${path.replace(/\.md$/i, '')}]]`;
}

function appendRelation(content, line) {
  if (content.split('\n').some((existing) => existing.trim() === line)) return null;
  const heading = /^## 相关链接\s*$/m.exec(content);
  if (!heading) {
    const separator = content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
    return `${content}${separator}## 相关链接\n\n${line}\n`;
  }
  const sectionStart = heading.index + heading[0].length;
  const nextHeading = /^##\s+/m.exec(content.slice(sectionStart));
  const insertion = nextHeading ? sectionStart + nextHeading.index : content.length;
  const before = content.slice(0, insertion);
  const after = content.slice(insertion);
  const separator = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  return `${before}${separator}${line}\n${after ? `\n${after}` : ''}`;
}

export function previewPromotion(edge, nodes, files, sourceNode) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let pairs;
  if (edge.fromEnd === 'arrow' && edge.toEnd === 'arrow') pairs = [[edge.fromNode, edge.toNode], [edge.toNode, edge.fromNode]];
  else if (edge.toEnd === 'arrow') pairs = [[edge.fromNode, edge.toNode]];
  else if (edge.fromEnd === 'arrow') pairs = [[edge.toNode, edge.fromNode]];
  else {
    if (!sourceNode || ![edge.fromNode, edge.toNode].includes(sourceNode)) throw new RelationSourceRequiredError();
    pairs = [[sourceNode, sourceNode === edge.fromNode ? edge.toNode : edge.fromNode]];
  }
  const changes = [];
  for (const [fromId, toId] of pairs) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    const file = files[fromId];
    if (!from || !to || !file) throw new Error('Relation references a missing node or Markdown file');
    const append = `- ${wikilink(to.file)}${edge.label?.trim() ? ` — ${edge.label.trim()}` : ''}`;
    const content = appendRelation(file.content, append);
    if (content !== null) changes.push({ path: from.file, expectedMtime: file.mtime, append, content });
  }
  return { edgeId: edge.id, changes };
}

export async function applyPromotion(preview, repository) {
  const results = [];
  for (const change of preview.changes) results.push(await repository.save(change.path, change.expectedMtime, change.content));
  return results;
}

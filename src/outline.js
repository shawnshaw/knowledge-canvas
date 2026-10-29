import { isGroupNode } from './board-model.js';

// Group frames are background containers: they never appear in the outline and can
// never become a parent, a child, or a relation endpoint.
export function projectOutline(nodes, edges) {
  const items = nodes
    .filter((node) => !isGroupNode(node))
    .map((node) => ({ nodeId: node.id, node, parentId: null, children: [] }));
  const byId = new Map(items.map((item) => [item.nodeId, item]));
  const crossReferences = [];
  for (const edge of edges) {
    if (!byId.has(edge.fromNode) || !byId.has(edge.toNode)) continue;
    const directed = (edge.fromEnd ?? 'none') === 'none' && edge.toEnd === 'arrow';
    if (!directed) {
      crossReferences.push({ from: edge.fromNode, to: edge.toNode });
      continue;
    }
    const child = byId.get(edge.toNode);
    let ancestor = byId.get(edge.fromNode);
    let createsCycle = false;
    while (ancestor) {
      if (ancestor.nodeId === child.nodeId) { createsCycle = true; break; }
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : null;
    }
    if (child.parentId || createsCycle) crossReferences.push({ from: edge.fromNode, to: edge.toNode });
    else child.parentId = edge.fromNode;
  }
  for (const item of items) if (item.parentId) byId.get(item.parentId)?.children.push(item);
  return { roots: items.filter((item) => !item.parentId), items, crossReferences };
}

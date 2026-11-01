var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.js
var main_exports = {};
__export(main_exports, {
  default: () => KnowledgeCanvasPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian8 = require("obsidian");

// src/board-catalog.js
var DEFAULT_BOARD_PATH = "Canvas/\u77E5\u8BC6\u753B\u677F.canvas";
var BOARD_FOLDER = "Canvas/Knowledge Canvas";
var READFLOW_BOARD_FOLDER = `${BOARD_FOLDER}/ReadFlow`;
var BOARD_EXTENSION = ".canvas";
var ILLEGAL_NAME_CHARS = /[\\/:*?"<>|]/g;
function normalizeBoardName(value) {
  const raw = String(value != null ? value : "").trim();
  if (!raw) throw new Error("Invalid canvas name");
  if (raw.split("/").some((segment) => {
    const trimmed = segment.trim();
    return trimmed === "" || trimmed === "." || trimmed === "..";
  })) throw new Error("Invalid canvas name");
  const name = raw.replace(ILLEGAL_NAME_CHARS, "_").trim();
  if (!name || name === "." || name === "..") throw new Error("Invalid canvas name");
  return name;
}
function boardPathForName(name) {
  return `${BOARD_FOLDER}/${normalizeBoardName(name)}${BOARD_EXTENSION}`;
}
function boardNameFromPath(path) {
  return path.slice(BOARD_FOLDER.length + 1, -BOARD_EXTENSION.length);
}
function isManagedBoardPath(path) {
  return typeof path === "string" && path.startsWith(`${BOARD_FOLDER}/`) && path.toLowerCase().endsWith(BOARD_EXTENSION);
}
function isReadFlowBoardPath(path) {
  return typeof path === "string" && path.startsWith(`${READFLOW_BOARD_FOLDER}/`) && path.toLowerCase().endsWith(BOARD_EXTENSION);
}
function listManagedBoards(paths) {
  const names = (paths != null ? paths : []).filter(isManagedBoardPath).filter((path) => !isReadFlowBoardPath(path)).map(boardNameFromPath).sort((a, b) => a.localeCompare(b, "zh-CN"));
  return [
    { name: "\u77E5\u8BC6\u753B\u677F", path: DEFAULT_BOARD_PATH, isDefault: true },
    ...names.map((name) => ({ name, path: `${BOARD_FOLDER}/${name}${BOARD_EXTENSION}`, isDefault: false }))
  ];
}
function listReadFlowBoards(paths) {
  return (paths != null ? paths : []).filter(isReadFlowBoardPath).sort((a, b) => a.localeCompare(b, "zh-CN")).map((path) => ({
    name: path.split("/").at(-1).replace(/\.canvas$/i, ""),
    path,
    isDefault: false,
    readFlow: true
  }));
}
function isAllowedBoardPath(path) {
  return path === DEFAULT_BOARD_PATH || isManagedBoardPath(path);
}

// src/board-import.js
var IMPORT_CARD = Object.freeze({ width: 320, height: 220 });
var IMPORT_GAP = 24;
function isMarkdownPath(path) {
  return /\.md$/i.test(String(path != null ? path : "").trim());
}
function isInsideFolder(path, folderPath) {
  const root = String(folderPath != null ? folderPath : "").replace(/^\/+|\/+$/g, "");
  const value = String(path != null ? path : "");
  return !root || value.startsWith(`${root}/`);
}
function planImport(paths, existingPaths) {
  const existing = new Set(existingPaths != null ? existingPaths : []);
  const seen = /* @__PURE__ */ new Set();
  const duplicates = [];
  const added = [];
  const skippedExisting = [];
  const skippedInvalid = [];
  for (const raw of paths != null ? paths : []) {
    const path = String(raw != null ? raw : "").trim();
    if (!isMarkdownPath(path)) {
      skippedInvalid.push(path);
      continue;
    }
    if (seen.has(path)) {
      duplicates.push(path);
      continue;
    }
    seen.add(path);
    if (existing.has(path)) skippedExisting.push(path);
    else added.push(path);
  }
  return { added, skippedExisting, skippedInvalid, duplicates };
}
function contentRightTop(nodes) {
  let right = -Infinity;
  let top = Infinity;
  for (const node of nodes != null ? nodes : []) {
    right = Math.max(right, node.x + node.width);
    top = Math.min(top, node.y);
  }
  return (nodes == null ? void 0 : nodes.length) ? { right, top } : null;
}
function layoutImportedCards(paths, existingNodes = [], { size = IMPORT_CARD, gap = IMPORT_GAP } = {}) {
  const ordered = [...paths != null ? paths : []].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (!ordered.length) return [];
  const bounds2 = contentRightTop(existingNodes);
  const baseX = bounds2 ? bounds2.right + gap : 0;
  const baseY = bounds2 ? bounds2.top : 0;
  const columns = Math.ceil(Math.sqrt(ordered.length));
  return ordered.map((path, index) => ({
    path,
    point: {
      x: baseX + index % columns * (size.width + gap),
      y: baseY + Math.floor(index / columns) * (size.height + gap)
    }
  }));
}

// src/excerpt-anchor.js
var EXCERPT_VERSION = 1;
var EXCERPT_CONTEXT = 32;
var MARKDOWN_PATH = /\.md$/i;
function markdownReference(value) {
  if (typeof value !== "string") return null;
  const path = value.trim();
  return MARKDOWN_PATH.test(path) ? path : null;
}
function excerptSourcePath(anchor) {
  return markdownReference(anchor == null ? void 0 : anchor.sourceFile);
}
function slice(source, from, to) {
  return String(source).slice(Math.max(0, from), Math.max(0, to));
}
function createExcerptAnchor({ source, start, end, sourceFile, now = () => /* @__PURE__ */ new Date() }) {
  const text = String(source != null ? source : "");
  const from = Math.max(0, Math.min(Number(start) || 0, Number(end) || 0));
  const to = Math.min(text.length, Math.max(Number(start) || 0, Number(end) || 0));
  const quote = text.slice(from, to);
  if (!quote.trim()) return null;
  const stamp = typeof now === "function" ? now() : now;
  return {
    version: EXCERPT_VERSION,
    sourceFile: String(sourceFile != null ? sourceFile : ""),
    quote,
    start: from,
    end: to,
    prefix: slice(text, from - EXCERPT_CONTEXT, from),
    suffix: slice(text, to, to + EXCERPT_CONTEXT),
    createdAt: stamp instanceof Date ? stamp.toISOString() : new Date(stamp).toISOString()
  };
}
function isIsoTimestamp(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}
function validateExcerptAnchor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "\u6458\u5F55\u5143\u6570\u636E\u4E0D\u662F\u5BF9\u8C61";
  if (value.version !== EXCERPT_VERSION) return `\u4E0D\u652F\u6301\u7684\u6458\u5F55\u7248\u672C\uFF1A${String(value.version)}`;
  if (!excerptSourcePath(value)) return "\u6458\u5F55\u7684 sourceFile \u5FC5\u987B\u662F Markdown \u8DEF\u5F84";
  if (typeof value.quote !== "string" || !value.quote.trim()) return "\u6458\u5F55\u7F3A\u5C11 quote";
  if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.end < value.start) {
    return "\u6458\u5F55\u7684 start/end \u4E0D\u5408\u6CD5";
  }
  if (typeof value.prefix !== "string" || typeof value.suffix !== "string") return "\u6458\u5F55\u7684 prefix/suffix \u4E0D\u5408\u6CD5";
  if (value.createdAt !== void 0 && !isIsoTimestamp(value.createdAt)) return "\u6458\u5F55\u7684 createdAt \u4E0D\u662F\u5408\u6CD5\u65F6\u95F4";
  if (value.updatedAt !== void 0 && !isIsoTimestamp(value.updatedAt)) return "\u6458\u5F55\u7684 updatedAt \u4E0D\u662F\u5408\u6CD5\u65F6\u95F4";
  return null;
}
function formatLocalTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}
function staleExcerptIds(nodes, sourceFile, content) {
  const ids = [];
  for (const node of nodes != null ? nodes : []) {
    const anchor = node == null ? void 0 : node.kcExcerpt;
    if (!anchor || anchor.sourceFile !== sourceFile) continue;
    if (!locateExcerpt(content, anchor).found) ids.push(node.id);
  }
  return ids;
}
function markExcerptsUpdated(nodes, ids, updatedAt) {
  const target = ids instanceof Set ? ids : new Set(ids != null ? ids : []);
  let changed = 0;
  for (const node of nodes != null ? nodes : []) {
    if (!target.has(node == null ? void 0 : node.id) || !node.kcExcerpt) continue;
    node.kcExcerpt = { ...node.kcExcerpt, updatedAt };
    changed += 1;
  }
  return changed;
}
function occurrencesOf(text, quote) {
  const matches = [];
  let index = text.indexOf(quote);
  while (index !== -1) {
    matches.push(index);
    index = text.indexOf(quote, index + 1);
  }
  return matches;
}
function contextScore(text, at, quote, prefix, suffix) {
  let score = 0;
  if (prefix && at >= prefix.length && text.slice(at - prefix.length, at) === prefix) score += 1;
  if (suffix && text.slice(at + quote.length, at + quote.length + suffix.length) === suffix) score += 1;
  return score;
}
function locateExcerpt(source, anchor) {
  const text = String(source != null ? source : "");
  const quote = typeof (anchor == null ? void 0 : anchor.quote) === "string" ? anchor.quote : "";
  if (!quote) return { found: false, strategy: "none" };
  const { start, end } = anchor;
  if (Number.isInteger(start) && Number.isInteger(end) && end > start && text.slice(start, end) === quote) {
    return { found: true, start, end, strategy: "offsets" };
  }
  const matches = occurrencesOf(text, quote);
  if (!matches.length) return { found: false, strategy: "none" };
  if (matches.length === 1) {
    return { found: true, start: matches[0], end: matches[0] + quote.length, strategy: "unique" };
  }
  const prefix = typeof anchor.prefix === "string" ? anchor.prefix : "";
  const suffix = typeof anchor.suffix === "string" ? anchor.suffix : "";
  let best = matches[0];
  let bestScore = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const at of matches) {
    const score = contextScore(text, at, quote, prefix, suffix);
    const distance2 = Number.isInteger(start) ? Math.abs(at - start) : 0;
    if (score > bestScore || score === bestScore && distance2 < bestDistance) {
      best = at;
      bestScore = score;
      bestDistance = distance2;
    }
  }
  if (bestScore <= 0) return { found: false, strategy: "none" };
  return { found: true, start: best, end: best + quote.length, strategy: "context" };
}
function excerptTextFromQuote(quote) {
  return String(quote != null ? quote : "").split("\n").map((line) => `> ${line.trim()}`.trimEnd()).join("\n");
}

// src/delete-plan.js
function nodeFileReferences(node) {
  var _a;
  if (!node || typeof node !== "object") return [];
  const id = typeof node.id === "string" ? node.id : "";
  const paths = /* @__PURE__ */ new Set();
  for (const value of [node.file, (_a = node.kcExcerpt) == null ? void 0 : _a.sourceFile]) {
    const path = markdownReference(value);
    if (path) paths.add(path);
  }
  return [...paths].map((file) => ({ id, file }));
}
function documentNodes(document2) {
  var _a;
  if (Array.isArray((_a = document2 == null ? void 0 : document2.board) == null ? void 0 : _a.nodes)) return document2.board.nodes;
  if (Array.isArray(document2 == null ? void 0 : document2.nodes)) return document2.nodes;
  return null;
}
function extractCanvasFileReferences(raw) {
  let document2;
  try {
    document2 = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error("\u753B\u5E03\u65E0\u6CD5\u89E3\u6790");
  }
  if (!document2 || !Array.isArray(document2.nodes)) throw new Error("\u753B\u5E03\u65E0\u6CD5\u89E3\u6790");
  return document2.nodes.flatMap(nodeFileReferences);
}
function classifySelection(board, selectedIds) {
  const nodeIds = board.nodes.filter((node) => selectedIds.has(node.id)).map((node) => node.id);
  const edgeIds = board.edges.filter((edge) => selectedIds.has(edge.id)).map((edge) => edge.id);
  return { nodeIds, edgeIds };
}
function analyzeDelete(board, selectedIds, canvasDocuments = [], { isMissing = () => false, currentPath = "" } = {}) {
  var _a, _b;
  const { nodeIds, edgeIds } = classifySelection(board, selectedIds);
  const removedIds = new Set(nodeIds);
  const selected = board.nodes.filter((node) => removedIds.has(node.id));
  const filePaths = [...new Set(selected.map((node) => node.file).filter((file) => typeof file === "string"))];
  const uncertain = [];
  const references = /* @__PURE__ */ new Map();
  for (const document2 of canvasDocuments != null ? canvasDocuments : []) {
    if (document2 == null ? void 0 : document2.error) {
      uncertain.push({ path: document2.path, reason: String((_a = document2.error.message) != null ? _a : document2.error) });
      continue;
    }
    const nodes = documentNodes(document2);
    if (!nodes) {
      uncertain.push({ path: document2.path, reason: "\u753B\u5E03\u65E0\u6CD5\u89E3\u6790" });
      continue;
    }
    const isCurrentCanvas = document2.board === board || currentPath !== "" && document2.path === currentPath;
    for (const node of nodes) {
      for (const reference of nodeFileReferences(node)) {
        if (isCurrentCanvas && removedIds.has(reference.id)) continue;
        if (!references.has(reference.file)) references.set(reference.file, /* @__PURE__ */ new Set());
        references.get(reference.file).add(document2.path);
      }
    }
  }
  const blockedTrash = [];
  const missingPaths = [];
  for (const path of filePaths) {
    if (isMissing(path)) {
      missingPaths.push(path);
      continue;
    }
    const refs = [...(_b = references.get(path)) != null ? _b : []].sort();
    if (refs.length) blockedTrash.push({ path, references: refs });
  }
  return { nodeIds, edgeIds, filePaths, blockedTrash, missingPaths, uncertain };
}
function planTrashTargets(plan) {
  const missing = new Set(plan.missingPaths);
  const paths = plan.filePaths.filter((path) => !missing.has(path));
  const reasons = [];
  if (plan.uncertain.length) {
    reasons.push(`\u6709\u753B\u5E03\u65E0\u6CD5\u8BFB\u53D6\u6216\u89E3\u6790\uFF1A${plan.uncertain.map((item) => item.path).join("\u3001")}`);
  }
  if (plan.blockedTrash.length) {
    reasons.push(`\u6E90\u6587\u4EF6\u4ECD\u88AB\u5176\u4ED6\u5361\u7247\u6216\u753B\u5E03\u5F15\u7528\uFF1A${plan.blockedTrash.map((item) => `${item.path}\uFF08${item.references.join("\u3001")}\uFF09`).join("\uFF1B")}`);
  }
  if (!paths.length && !reasons.length) reasons.push("\u6CA1\u6709\u53EF\u79FB\u5165\u5E9F\u7EB8\u7BD3\u7684\u6E90\u6587\u4EF6");
  return { paths, disabled: reasons.length > 0, reason: reasons.join("\uFF1B") };
}
var DELETE_LIST_LIMIT = 5;
function revalidateTrashTargets(paths, canvasDocuments = []) {
  var _a, _b;
  const targets = [...new Set(paths != null ? paths : [])];
  const references = /* @__PURE__ */ new Map();
  const uncertain = [];
  for (const document2 of canvasDocuments != null ? canvasDocuments : []) {
    if (document2 == null ? void 0 : document2.error) {
      uncertain.push({ path: document2.path, reason: String((_a = document2.error.message) != null ? _a : document2.error) });
      continue;
    }
    const nodes = documentNodes(document2);
    if (!nodes) {
      uncertain.push({ path: document2.path, reason: "\u753B\u5E03\u65E0\u6CD5\u89E3\u6790" });
      continue;
    }
    for (const node of nodes) {
      for (const reference of nodeFileReferences(node)) {
        if (!references.has(reference.file)) references.set(reference.file, /* @__PURE__ */ new Set());
        references.get(reference.file).add(document2.path);
      }
    }
  }
  const allowed = [];
  const blocked = [];
  for (const path of targets) {
    const refs = [...(_b = references.get(path)) != null ? _b : []].sort();
    if (refs.length) blocked.push({ path, references: refs, reason: "referenced" });
    else if (uncertain.length) blocked.push({ path, references: uncertain.map((item) => item.path), reason: "uncertain" });
    else allowed.push(path);
  }
  return { allowed, blocked, uncertain };
}
function listRemovalTargets(plan, limit = DELETE_LIST_LIMIT) {
  const names = plan.filePaths.slice(0, limit);
  return { names, extra: Math.max(0, plan.filePaths.length - names.length) };
}
function summarizeTrash(results) {
  const deleted = results.filter((result) => result.ok).map((result) => result.path);
  const failed = results.filter((result) => !result.ok).map((result) => {
    var _a;
    return { path: result.path, reason: String((_a = result.reason) != null ? _a : "") };
  });
  const parts = [];
  if (deleted.length) parts.push(`\u6E90\u6587\u4EF6\u5DF2\u79FB\u5165\u5E9F\u7EB8\u7BD3\uFF1A${deleted.join("\u3001")}`);
  if (failed.length) parts.push(`\u672A\u80FD\u79FB\u5165\u5E9F\u7EB8\u7BD3\uFF1A${failed.map((item) => `${item.path}\uFF08${item.reason}\uFF09`).join("\uFF1B")}`);
  return { deleted, failed, message: parts.join("\uFF1B") };
}

// src/board-management.js
var BOARD_EXTENSION2 = ".canvas";
var FOLDER_LIST_LIMIT = 5;
function boardNameFromPath2(path) {
  var _a;
  const file = (_a = String(path != null ? path : "").split("/").at(-1)) != null ? _a : "";
  return file.replace(/\.canvas$/i, "");
}
function canManageBoard(path) {
  const value = String(path != null ? path : "");
  if (!value) return { allowed: false, reason: "\u6CA1\u6709\u53EF\u7BA1\u7406\u7684\u753B\u5E03" };
  if (value === DEFAULT_BOARD_PATH) return { allowed: false, reason: "\u9ED8\u8BA4\u753B\u5E03\u4E0D\u80FD\u91CD\u547D\u540D\u6216\u5220\u9664" };
  if (isReadFlowBoardPath(value)) return { allowed: false, reason: "ReadFlow \u4E66\u677F\u7531 ReadFlow \u7BA1\u7406" };
  if (!value.startsWith(`${BOARD_FOLDER}/`)) return { allowed: false, reason: `\u53EA\u6709 ${BOARD_FOLDER} \u4E0B\u7684\u753B\u5E03\u53EF\u4EE5\u91CD\u547D\u540D\u6216\u5220\u9664` };
  if (!value.toLowerCase().endsWith(BOARD_EXTENSION2)) return { allowed: false, reason: "\u76EE\u6807\u4E0D\u662F\u753B\u5E03\u6587\u4EF6" };
  return { allowed: true, reason: "" };
}
function joinSegments(segments) {
  return segments.filter((segment) => segment !== "").join("/");
}
function stripSlashes(value) {
  return String(value != null ? value : "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
function renameBoardNoteFolder(noteFolder, name) {
  const folder = stripSlashes(noteFolder);
  if (!folder) return null;
  const segments = folder.split("/");
  return joinSegments([...segments.slice(0, -1), normalizeBoardName(name)]);
}
function isInsideFolderPath(path, folder) {
  const root = stripSlashes(folder);
  return Boolean(root) && String(path != null ? path : "").startsWith(`${root}/`);
}
function replaceFolderPrefix(path, from, to) {
  return `${stripSlashes(to)}/${String(path).slice(stripSlashes(from).length + 1)}`;
}
function planBoardRename({ path, name, existingPaths = [], folderPaths = [], noteFolder = null, renameNoteFolder = false } = {}) {
  const manage = canManageBoard(path);
  if (!manage.allowed) throw new Error(manage.reason);
  let nextName;
  try {
    nextName = normalizeBoardName(name);
  } catch (e) {
    throw new Error("\u753B\u5E03\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A\uFF0C\u4E5F\u4E0D\u80FD\u5305\u542B . \u6216 .. \u8DEF\u5F84\u7247\u6BB5");
  }
  const toPath = `${BOARD_FOLDER}/${nextName}${BOARD_EXTENSION2}`;
  if (toPath === path) throw new Error("\u753B\u5E03\u540D\u79F0\u6CA1\u6709\u53D8\u5316");
  if ((existingPaths != null ? existingPaths : []).includes(toPath)) throw new Error(`\u753B\u5E03\u5DF2\u5B58\u5728\uFF1A${toPath}`);
  let folderPlan = null;
  if (noteFolder && renameNoteFolder) {
    const to = renameBoardNoteFolder(noteFolder, nextName);
    if (to && to !== stripSlashes(noteFolder)) {
      if ((folderPaths != null ? folderPaths : []).some((folder) => stripSlashes(folder) === to)) {
        throw new Error(`\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\u5DF2\u5B58\u5728\uFF1A${to}`);
      }
      folderPlan = { from: stripSlashes(noteFolder), to };
    }
  }
  return { name: nextName, fromPath: path, toPath, noteFolder: folderPlan };
}
function rewriteFolderReferences(board, from, to) {
  if (!board || !from || !to || stripSlashes(from) === stripSlashes(to)) return board;
  let changed = false;
  const nodes = board.nodes.map((node) => {
    const copy = { ...node };
    if (typeof copy.file === "string" && isInsideFolderPath(copy.file, from)) {
      copy.file = replaceFolderPrefix(copy.file, from, to);
      changed = true;
    }
    if (copy.kcExcerpt && typeof copy.kcExcerpt.sourceFile === "string" && isInsideFolderPath(copy.kcExcerpt.sourceFile, from)) {
      copy.kcExcerpt = { ...copy.kcExcerpt, sourceFile: replaceFolderPrefix(copy.kcExcerpt.sourceFile, from, to) };
      changed = true;
    }
    return copy;
  });
  return changed ? { ...board, nodes } : board;
}
function applyBoardRename(board, plan) {
  var _a;
  if (!board) return board;
  let next = board;
  if (plan == null ? void 0 : plan.noteFolder) {
    if (((_a = board.kcMeta) == null ? void 0 : _a.noteFolder) === plan.noteFolder.from) {
      next = { ...next, kcMeta: { ...board.kcMeta, noteFolder: plan.noteFolder.to } };
    }
    next = rewriteFolderReferences(next, plan.noteFolder.from, plan.noteFolder.to);
  }
  return next;
}
function listPaths(paths, limit = FOLDER_LIST_LIMIT) {
  const names = paths.slice(0, limit).map((path) => path.split("/").at(-1));
  const extra = paths.length - names.length;
  return extra > 0 ? `${names.join("\u3001")} \u7B49 ${paths.length} \u9879` : names.join("\u3001");
}
function analyzeBoardNoteFolder({ folderPath, files = [], folders = [], board } = {}) {
  var _a;
  const folder = stripSlashes(folderPath);
  if (!folder) return { deletable: false, reason: "\u8BE5\u753B\u5E03\u6CA1\u6709\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939", fileCount: 0 };
  const subfolders = folders.map((item) => typeof item === "string" ? item : item == null ? void 0 : item.path).filter((path) => typeof path === "string" && path !== folder && path.startsWith(`${folder}/`));
  const inside = files.map((item) => typeof item === "string" ? item : item == null ? void 0 : item.path).filter((path) => typeof path === "string" && path.startsWith(`${folder}/`));
  const referenced = /* @__PURE__ */ new Set();
  for (const node of (_a = board == null ? void 0 : board.nodes) != null ? _a : []) {
    for (const reference of nodeFileReferences(node)) referenced.add(reference.file);
  }
  const foreign = inside.filter((path) => !isMarkdownPath(path));
  const unreferenced = inside.filter((path) => isMarkdownPath(path) && !referenced.has(path));
  const reasons = [];
  if (subfolders.length) reasons.push(`\u5305\u542B\u5B50\u6587\u4EF6\u5939\uFF1A${listPaths(subfolders)}`);
  if (foreign.length) reasons.push(`\u5305\u542B\u975E Markdown \u6587\u4EF6\uFF1A${listPaths(foreign)}`);
  if (unreferenced.length) reasons.push(`\u6709 Markdown \u672A\u88AB\u5F53\u524D\u753B\u5E03\u5F15\u7528\uFF1A${listPaths(unreferenced)}`);
  return {
    deletable: reasons.length === 0,
    reason: reasons.join("\uFF1B"),
    fileCount: inside.length,
    subfolders,
    foreign,
    unreferenced
  };
}
function updateReadFlowBindings(bindings, { from, to = null } = {}) {
  const next = {};
  let changed = false;
  for (const [bookId, path] of Object.entries(bindings != null ? bindings : {})) {
    if (path !== from) {
      next[bookId] = path;
      continue;
    }
    changed = true;
    if (to) next[bookId] = to;
  }
  return { bindings: next, changed };
}

// src/card-colors.js
var CARD_COLORS = Object.freeze([
  { name: "neutral", value: null },
  { name: "coral", value: "1" },
  { name: "yellow", value: "3" },
  { name: "green", value: "4" },
  { name: "blue", value: "5" },
  { name: "purple", value: "6" }
]);
var NAME_TO_VALUE = new Map(CARD_COLORS.map((color) => [color.name, color.value]));
var VALUE_TO_NAME = new Map(CARD_COLORS.filter((color) => color.value !== null).map((color) => [color.value, color.name]));
var COLOR_NAMES = Object.freeze(CARD_COLORS.map((color) => color.name));
var STICKY_VALUES = Object.freeze(CARD_COLORS.map((color) => color.value).filter((value) => value !== null));
var READFLOW_DEFAULT_COLOR = "blue";
function isCardColorValue(value) {
  return VALUE_TO_NAME.has(value);
}
function cardColorName(value) {
  var _a;
  if (NAME_TO_VALUE.has(value)) return value;
  return (_a = VALUE_TO_NAME.get(value)) != null ? _a : "neutral";
}
function normalizeCardColor(value) {
  if (typeof value !== "string") return null;
  if (NAME_TO_VALUE.has(value)) return NAME_TO_VALUE.get(value);
  return isCardColorValue(value) ? value : null;
}
function randomStickyColor(random = Math.random) {
  const raw = Number(random());
  const scaled = Number.isFinite(raw) ? Math.floor(raw * STICKY_VALUES.length) : 0;
  const index = Math.min(STICKY_VALUES.length - 1, Math.max(0, scaled));
  return STICKY_VALUES[index];
}
function stepCardColor(value, delta) {
  const index = COLOR_NAMES.indexOf(cardColorName(value));
  const steps = Number.isFinite(Number(delta)) ? Math.trunc(Number(delta)) : 0;
  return COLOR_NAMES[(index + steps % COLOR_NAMES.length + COLOR_NAMES.length) % COLOR_NAMES.length];
}
function effectiveCardColor(node, { readFlow = false } = {}) {
  if (isCardColorValue(node == null ? void 0 : node.color)) return cardColorName(node.color);
  return readFlow ? READFLOW_DEFAULT_COLOR : "neutral";
}

// src/board-meta.js
var BOARD_META_VERSION = 1;
var ILLEGAL_CHARS = /[\\:*?"<>|]/;
function normalizeBoardNoteFolder(value) {
  const segments = String(value != null ? value : "").replace(/\\/g, "/").split("/").map((segment) => segment.trim()).filter((segment) => segment && segment !== "." && segment !== "..").map((segment) => segment.replace(ILLEGAL_CHARS, "_"));
  return segments.join("/") || null;
}
function createBoardMeta({ noteFolder } = {}) {
  const folder = normalizeBoardNoteFolder(noteFolder);
  if (!folder) throw new Error("\u753B\u5E03\u7B14\u8BB0\u76EE\u5F55\u4E0D\u80FD\u4E3A\u7A7A");
  return { version: BOARD_META_VERSION, noteFolder: folder };
}
function validateBoardMeta(value) {
  if (value === void 0 || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "\u753B\u5E03\u6269\u5C55\u4FE1\u606F\u5FC5\u987B\u662F\u5BF9\u8C61";
  if (value.version !== BOARD_META_VERSION) return `\u4E0D\u652F\u6301\u7684\u753B\u5E03\u6269\u5C55\u7248\u672C\uFF1A${String(value.version)}`;
  if (value.noteFolder === void 0) return null;
  if (typeof value.noteFolder !== "string" || !value.noteFolder.trim()) return "\u753B\u5E03\u7B14\u8BB0\u76EE\u5F55\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32";
  if (value.noteFolder.startsWith("/") || value.noteFolder.endsWith("/")) return "\u753B\u5E03\u7B14\u8BB0\u76EE\u5F55\u4E0D\u80FD\u4EE5\u659C\u6760\u5F00\u5934\u6216\u7ED3\u5C3E";
  if (value.noteFolder.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    return "\u753B\u5E03\u7B14\u8BB0\u76EE\u5F55\u5305\u542B\u975E\u6CD5\u8DEF\u5F84\u7247\u6BB5";
  }
  if (ILLEGAL_CHARS.test(value.noteFolder)) return "\u753B\u5E03\u7B14\u8BB0\u76EE\u5F55\u5305\u542B\u975E\u6CD5\u5B57\u7B26";
  return null;
}
function boardNoteFolder(board) {
  const meta = board == null ? void 0 : board.kcMeta;
  if (!meta || typeof meta !== "object") return null;
  return typeof meta.noteFolder === "string" && meta.noteFolder ? meta.noteFolder : null;
}

// src/edge-geometry.js
var EDGE_ROUTES = Object.freeze(["curve", "straight", "elbow"]);
var DEFAULT_EDGE_ROUTE = "curve";
var LABEL_PADDING = 12;
var LABEL_NORMAL_OFFSET = 16;
var MIN_BEND = 40;
var BEND_RATIO = 0.4;
var CORNER_RADIUS = 8;
var CURVE_SAMPLES = 40;
var LABEL_RATIOS = Object.freeze([0.5, 0.38, 0.62, 0.25, 0.75]);
var LABEL_NORMAL_STEPS = Object.freeze([0, 1, -1]);
function isEdgeRoute(value) {
  return EDGE_ROUTES.includes(value);
}
function normalizeEdgeRoute(value) {
  return isEdgeRoute(value) ? value : DEFAULT_EDGE_ROUTE;
}
function centreOf(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
function borderPoint(rect, towards2) {
  const centre = centreOf(rect);
  const dx = towards2.x - centre.x;
  const dy = towards2.y - centre.y;
  if (dx === 0 && dy === 0) return centre;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : rect.width / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : rect.height / 2 / Math.abs(dy)
  );
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}
var round = (value) => Math.round(value * 1e3) / 1e3;
var point = (position) => `${round(position.x)} ${round(position.y)}`;
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function towards(from, to, length) {
  const span = distance(from, to);
  if (span === 0) return { ...from };
  const ratio = Math.min(length, span / 2) / span;
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
}
function simplify(points) {
  const deduped = points.filter((position, index) => index === 0 || distance(points[index - 1], position) > 1e-9);
  if (deduped.length < 3) return deduped;
  const kept = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const previous = kept.at(-1);
    const corner = deduped[i];
    const next = deduped[i + 1];
    const cross = (corner.x - previous.x) * (next.y - previous.y) - (corner.y - previous.y) * (next.x - previous.x);
    if (Math.abs(cross) > 1e-9) kept.push(corner);
  }
  kept.push(deduped.at(-1));
  return kept;
}
function polylineMidpoint(points) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const span = distance(points[i - 1], points[i]);
    lengths.push(span);
    total += span;
  }
  let target = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const ratio = lengths[i] === 0 ? 0 : target / lengths[i];
      const start = points[i];
      const end = points[i + 1];
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
    }
    target -= lengths[i];
  }
  return { ...points[0] };
}
function roundedPolyline(vertices, radius = CORNER_RADIUS) {
  if (vertices.length < 2) return "";
  let d = `M ${point(vertices[0])}`;
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const previous = vertices[i - 1];
    const corner = vertices[i];
    const next = vertices[i + 1];
    const limit = Math.min(radius, distance(previous, corner) / 2, distance(corner, next) / 2);
    d += ` L ${point(towards(corner, previous, limit))} Q ${point(corner)} ${point(towards(corner, next, limit))}`;
  }
  return `${d} L ${point(vertices.at(-1))}`;
}
function straightPath(start, end) {
  return { d: `M ${point(start)} L ${point(end)}`, labelPoint: polylineMidpoint([start, end]), points: [start, end] };
}
function cubicAt(start, first, second, end, t) {
  const inverse = 1 - t;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * t * first.x + 3 * inverse * t ** 2 * second.x + t ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * t * first.y + 3 * inverse * t ** 2 * second.y + t ** 3 * end.y
  };
}
function curvePath(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const direction = (horizontal ? Math.sign(dx) : Math.sign(dy)) || 1;
  const bend = Math.max(MIN_BEND, (horizontal ? Math.abs(dx) : Math.abs(dy)) * BEND_RATIO);
  const first = horizontal ? { x: start.x + direction * bend, y: start.y } : { x: start.x, y: start.y + direction * bend };
  const second = horizontal ? { x: end.x - direction * bend, y: end.y } : { x: end.x, y: end.y - direction * bend };
  const points = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) points.push(cubicAt(start, first, second, end, i / CURVE_SAMPLES));
  return {
    d: `M ${point(start)} C ${point(first)}, ${point(second)}, ${point(end)}`,
    labelPoint: cubicAt(start, first, second, end, 0.5),
    points
  };
}
function elbowPath(start, end) {
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const vertices = simplify(horizontal ? [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end] : [start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end]);
  if (vertices.length < 2) return straightPath(start, end);
  return { d: roundedPolyline(vertices), labelPoint: polylineMidpoint(vertices), points: vertices };
}
function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}
function pointAtRatio(points, ratio) {
  var _a;
  if (points.length < 2) return { ...(_a = points[0]) != null ? _a : { x: 0, y: 0 } };
  let target = polylineLength(points) * ratio;
  for (let i = 1; i < points.length; i += 1) {
    const span = distance(points[i - 1], points[i]);
    if (target <= span || i === points.length - 1) {
      const r = span === 0 ? 0 : target / span;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * r,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * r
      };
    }
    target -= span;
  }
  return { ...points[0] };
}
function segmentAt(points, ratio) {
  var _a;
  if (points.length < 2) {
    const only = (_a = points[0]) != null ? _a : { x: 0, y: 0 };
    return { start: only, end: only };
  }
  let target = polylineLength(points) * ratio;
  for (let i = 1; i < points.length; i += 1) {
    const span = distance(points[i - 1], points[i]);
    if (target <= span || i === points.length - 1) return { start: points[i - 1], end: points[i] };
    target -= span;
  }
  return { start: points[0], end: points[1] };
}
function normalOffset(points, ratio, amount) {
  const position = pointAtRatio(points, ratio);
  const { start, end } = segmentAt(points, ratio);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: position.x - dy / length * amount, y: position.y + dx / length * amount };
}
function inflateRect(rect) {
  return {
    x: rect.x - LABEL_PADDING,
    y: rect.y - LABEL_PADDING,
    width: rect.width + LABEL_PADDING * 2,
    height: rect.height + LABEL_PADDING * 2
  };
}
var FULL_WIDTH_RANGES = Object.freeze([
  [4352, 4447],
  [11904, 12350],
  [12353, 13311],
  [13312, 19903],
  [19968, 40959],
  [44032, 55203],
  [63744, 64255],
  [65072, 65103],
  [65280, 65376],
  [65504, 65510]
]);
function glyphWidth(char, fontSize) {
  const code = char.codePointAt(0);
  for (const [start, end] of FULL_WIDTH_RANGES) {
    if (code >= start && code <= end) return fontSize;
  }
  return fontSize * 0.55;
}
function estimateLabelSize(text, { fontSize = 13, paddingX = 8, paddingY = 4 } = {}) {
  let width = 0;
  for (const char of String(text != null ? text : "")) width += glyphWidth(char, fontSize);
  return {
    width: Math.round(width + paddingX * 2),
    height: Math.round(fontSize + paddingY * 2)
  };
}
function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
function overlapArea(a, b) {
  if (!rectsOverlap(a, b)) return 0;
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, width) * Math.max(0, height);
}
function maxOverlapArea(rect, rects) {
  let max = 0;
  for (const other of rects) {
    const area = overlapArea(rect, other);
    if (area > max) max = area;
  }
  return max;
}
function penetrationDepth(point2, rect) {
  if (point2.x < rect.x || point2.x > rect.x + rect.width || point2.y < rect.y || point2.y > rect.y + rect.height) return 0;
  return Math.min(point2.x - rect.x, rect.x + rect.width - point2.x, point2.y - rect.y, rect.y + rect.height - point2.y);
}
function maxPenetration(point2, rects) {
  let max = 0;
  for (const rect of rects) {
    const depth = penetrationDepth(point2, rect);
    if (depth > max) max = depth;
  }
  return max;
}
function labelRectAt(position, labelSize) {
  return {
    x: position.x - labelSize.width / 2,
    y: position.y - labelSize.height / 2,
    width: labelSize.width,
    height: labelSize.height
  };
}
function edgeLabelPoint(points, obstacles = [], labelSize) {
  const padded = (obstacles != null ? obstacles : []).map(inflateRect);
  if (labelSize) {
    const rectAt = (position) => labelRectAt(position, labelSize);
    let best2 = pointAtRatio(points, 0.5);
    let bestOverlap = maxOverlapArea(rectAt(best2), padded);
    if (bestOverlap === 0) return best2;
    for (const ratio of LABEL_RATIOS) {
      for (const step of LABEL_NORMAL_STEPS) {
        if (ratio === 0.5 && step === 0) continue;
        const candidate = step === 0 ? pointAtRatio(points, ratio) : normalOffset(points, ratio, step * LABEL_NORMAL_OFFSET);
        const overlap = maxOverlapArea(rectAt(candidate), padded);
        if (overlap === 0) return candidate;
        if (overlap < bestOverlap) {
          bestOverlap = overlap;
          best2 = candidate;
        }
      }
    }
    return best2;
  }
  let best = pointAtRatio(points, 0.5);
  let bestPenetration = maxPenetration(best, padded);
  if (bestPenetration === 0) return best;
  for (const ratio of LABEL_RATIOS) {
    for (const step of LABEL_NORMAL_STEPS) {
      if (ratio === 0.5 && step === 0) continue;
      const candidate = step === 0 ? pointAtRatio(points, ratio) : normalOffset(points, ratio, step * LABEL_NORMAL_OFFSET);
      const penetration = maxPenetration(candidate, padded);
      if (penetration === 0) return candidate;
      if (penetration < bestPenetration) {
        bestPenetration = penetration;
        best = candidate;
      }
    }
  }
  return best;
}
function edgePath(from, to, route, obstacles, labelSize) {
  const start = borderPoint(from, centreOf(to));
  const end = borderPoint(to, centreOf(from));
  const normalized = normalizeEdgeRoute(route);
  const built = normalized === "straight" ? straightPath(start, end) : normalized === "elbow" ? elbowPath(start, end) : curvePath(start, end);
  if (obstacles && obstacles.length) return { d: built.d, labelPoint: edgeLabelPoint(built.points, obstacles, labelSize) };
  return { d: built.d, labelPoint: built.labelPoint };
}

// src/board-model.js
var DEFAULT_SIZE = Object.freeze({ width: 320, height: 220 });
var EDGE_ENDS = /* @__PURE__ */ new Set(["none", "arrow"]);
var GEOMETRY_KEYS = ["x", "y", "width", "height"];
var COLLAPSED_HEIGHT = 56;
var GROUP_PADDING = 32;
var EXCERPT_SIZE = Object.freeze({ width: 320, height: 180 });
function createBoard() {
  return { nodes: [], edges: [] };
}
function isFileNode(node) {
  return (node == null ? void 0 : node.type) === "file";
}
function isTextNode(node) {
  return (node == null ? void 0 : node.type) === "text";
}
function isExcerptNode(node) {
  return isTextNode(node) && typeof node.kcExcerpt === "object" && node.kcExcerpt !== null;
}
function isGroupNode(node) {
  return (node == null ? void 0 : node.type) === "group";
}
function isCardNode(node) {
  return isFileNode(node) || isTextNode(node);
}
function createFileNode(file, { x, y, color } = {}) {
  if (!file.toLowerCase().endsWith(".md")) throw new Error("Canvas nodes must reference Markdown files");
  const node = { id: crypto.randomUUID(), type: "file", file, x, y, ...DEFAULT_SIZE };
  const value = normalizeCardColor(color);
  if (value !== null) node.color = value;
  return node;
}
function createStickyNode(file, point2, random = Math.random) {
  return createFileNode(file, { ...point2, color: randomStickyColor(random) });
}
function setCardColor(board, id, color) {
  const node = board.nodes.find((item) => item.id === id && isCardNode(item));
  if (!node) return false;
  const value = normalizeCardColor(color);
  if (value === null) delete node.color;
  else node.color = value;
  return true;
}
function createExcerptNode({ text, point: point2, anchor }) {
  return {
    id: crypto.randomUUID(),
    type: "text",
    text,
    x: point2.x,
    y: point2.y,
    ...EXCERPT_SIZE,
    kcExcerpt: anchor
  };
}
function cardSearchText(node) {
  var _a, _b;
  if (isFileNode(node)) return String((_a = node.file) != null ? _a : "").toLowerCase();
  if (isExcerptNode(node)) return `${node.kcExcerpt.quote} ${node.kcExcerpt.sourceFile}`.toLowerCase();
  if (isTextNode(node)) return String((_b = node.text) != null ? _b : "").toLowerCase();
  return "";
}
function createEdge(from, to, options = {}) {
  var _a, _b;
  return {
    id: crypto.randomUUID(),
    fromNode: from.id,
    toNode: to.id,
    fromEnd: (_a = options.fromEnd) != null ? _a : "none",
    toEnd: (_b = options.toEnd) != null ? _b : "arrow",
    ...options.label ? { label: options.label } : {}
  };
}
function setEdgeRoute(board, id, route) {
  const edge = board.edges.find((item) => item.id === id);
  if (!edge) return false;
  const value = normalizeEdgeRoute(route);
  if (value === DEFAULT_EDGE_ROUTE) delete edge.kcRoute;
  else edge.kcRoute = value;
  return true;
}
function updateFilePath(board, oldPath, newPath) {
  var _a;
  let changed = false;
  for (const node of board.nodes) {
    if (node.file === oldPath) {
      node.file = newPath;
      changed = true;
    }
    if (((_a = node.kcExcerpt) == null ? void 0 : _a.sourceFile) === oldPath) {
      node.kcExcerpt.sourceFile = newPath;
      changed = true;
    }
  }
  return changed;
}
function renderedNodeHeight(node) {
  return isCardNode(node) && node.collapsed === true ? COLLAPSED_HEIGHT : node.height;
}
function setCollapsed(board, id, collapsed) {
  const node = board.nodes.find((item) => item.id === id && isCardNode(item));
  if (!node) return false;
  if (collapsed) node.collapsed = true;
  else delete node.collapsed;
  for (const group of board.nodes.filter((item) => isGroupNode(item) && item.members.includes(id))) reflowGroup(board, group.id);
  return true;
}
function memberBounds(members) {
  const left = Math.min(...members.map((node) => node.x));
  const top = Math.min(...members.map((node) => node.y));
  const right = Math.max(...members.map((node) => node.x + node.width));
  const bottom = Math.max(...members.map((node) => node.y + renderedNodeHeight(node)));
  return { left, top, right, bottom };
}
function createGroup(nodes, label) {
  const members = nodes.filter(isCardNode);
  if (members.length < 2) throw new Error("A group needs at least two cards");
  const { left, top, right, bottom } = memberBounds(members);
  const trimmed = String(label != null ? label : "").trim();
  return {
    id: crypto.randomUUID(),
    type: "group",
    ...trimmed ? { label: trimmed } : {},
    x: left - GROUP_PADDING,
    y: top - GROUP_PADDING,
    width: right - left + GROUP_PADDING * 2,
    height: bottom - top + GROUP_PADDING * 2,
    members: members.map((node) => node.id)
  };
}
function reflowGroup(board, groupId) {
  const group = board.nodes.find((node) => node.id === groupId && isGroupNode(node));
  if (!group) return false;
  const members = board.nodes.filter((node) => isCardNode(node) && group.members.includes(node.id));
  if (!members.length) return false;
  const { left, top, right, bottom } = memberBounds(members);
  group.x = left - GROUP_PADDING;
  group.y = top - GROUP_PADDING;
  group.width = right - left + GROUP_PADDING * 2;
  group.height = bottom - top + GROUP_PADDING * 2;
  return true;
}
function snapshotGeometry(nodes) {
  return nodes.map((node) => ({ node, x: node.x, y: node.y, width: node.width, height: node.height }));
}
function restoreGeometry(board, snapshot) {
  const directlyRestored = /* @__PURE__ */ new Set();
  for (const entry of snapshot) {
    const node = board.nodes.find((candidate) => candidate.id === entry.node.id);
    if (!node) continue;
    node.x = entry.x;
    node.y = entry.y;
    node.width = entry.width;
    node.height = entry.height;
    directlyRestored.add(node.id);
  }
  for (const group of board.nodes.filter(isGroupNode)) {
    if (directlyRestored.has(group.id)) continue;
    if (group.members.some((id) => directlyRestored.has(id))) reflowGroup(board, group.id);
  }
  return directlyRestored;
}
function ungroup(board, groupId) {
  const index = board.nodes.findIndex((node) => node.id === groupId && isGroupNode(node));
  if (index < 0) return false;
  board.nodes.splice(index, 1);
  return true;
}
function removeFromBoard(board, ids) {
  const removedNodes = new Set(board.nodes.filter((node) => ids.has(node.id)).map((node) => node.id));
  const kept = board.nodes.filter((node) => !removedNodes.has(node.id));
  const dropped = /* @__PURE__ */ new Set();
  for (const node of kept) {
    if (!isGroupNode(node) || !Array.isArray(node.members)) continue;
    node.members = node.members.filter((id) => !removedNodes.has(id));
    if (node.members.length < 2) dropped.add(node.id);
  }
  board.nodes = kept.filter((node) => !dropped.has(node.id));
  board.edges = board.edges.filter((edge) => !ids.has(edge.id) && !removedNodes.has(edge.fromNode) && !removedNodes.has(edge.toNode) && !dropped.has(edge.fromNode) && !dropped.has(edge.toNode));
}
function hasValidGeometry(node) {
  return GEOMETRY_KEYS.every((key) => typeof node[key] === "number" && Number.isFinite(node[key])) && node.width > 0 && node.height > 0;
}
function parseBoard(raw) {
  var _a, _b;
  let board;
  try {
    board = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error("Invalid canvas document");
  }
  if (!board || !Array.isArray(board.nodes) || !Array.isArray(board.edges)) throw new Error("Invalid canvas document");
  const metaReason = validateBoardMeta(board.kcMeta);
  if (metaReason) throw new Error(`\u753B\u5E03\u6269\u5C55\u4FE1\u606F\u65E0\u6548\uFF1A${metaReason}`);
  const ids = /* @__PURE__ */ new Set();
  const cards = /* @__PURE__ */ new Set();
  for (const node of board.nodes) {
    if (!(node == null ? void 0 : node.id) || ids.has(node.id)) throw new Error("Invalid or duplicate node id");
    if (!hasValidGeometry(node)) throw new Error("Canvas nodes need finite positive geometry");
    ids.add(node.id);
    if (node.type === "file") {
      if (typeof node.file !== "string" || !node.file.toLowerCase().endsWith(".md")) {
        throw new Error("Canvas nodes must reference Markdown files");
      }
    } else if (node.type === "text") {
      if (typeof node.text !== "string") throw new Error("Canvas text nodes need a text field");
      if (node.kcExcerpt !== void 0) {
        const reason = validateExcerptAnchor(node.kcExcerpt);
        if (reason) throw new Error(`\u6458\u5F55\u8D34\u7EB8\u6570\u636E\u65E0\u6548\uFF1A${reason}`);
      }
    } else if (node.type === "group") {
      if (node.label !== void 0 && typeof node.label !== "string") throw new Error("Invalid group label");
    } else {
      throw new Error("Unsupported canvas node type");
    }
    if (isCardNode(node)) {
      if (node.collapsed !== void 0 && typeof node.collapsed !== "boolean") throw new Error("Invalid collapsed flag");
      if (node.color !== void 0 && node.color !== null && !isCardColorValue(node.color)) {
        throw new Error("Unsupported canvas node color");
      }
      cards.add(node.id);
    }
  }
  const grouped = /* @__PURE__ */ new Set();
  for (const node of board.nodes) {
    if (node.type !== "group") continue;
    if (!Array.isArray(node.members)) throw new Error("Group nodes need a members list");
    const seen = /* @__PURE__ */ new Set();
    for (const member of node.members) {
      if (!cards.has(member)) throw new Error("Group members must reference cards on this canvas");
      if (seen.has(member)) throw new Error("Duplicate group member");
      if (grouped.has(member)) throw new Error("A card belongs to more than one group");
      seen.add(member);
      grouped.add(member);
    }
  }
  for (const edge of board.edges) {
    if (!(edge == null ? void 0 : edge.id) || !ids.has(edge.fromNode) || !ids.has(edge.toNode)) throw new Error("Edge references missing node");
    if (!cards.has(edge.fromNode) || !cards.has(edge.toNode)) throw new Error("Edges can only connect cards");
    if (!EDGE_ENDS.has((_a = edge.fromEnd) != null ? _a : "none") || !EDGE_ENDS.has((_b = edge.toEnd) != null ? _b : "none")) throw new Error("Unsupported edge end");
    if (edge.kcRoute !== void 0 && edge.kcRoute !== null && !isEdgeRoute(edge.kcRoute)) {
      throw new Error("Unsupported edge route");
    }
  }
  return board;
}

// src/board-store.js
var BoardStore = class {
  constructor(adapter) {
    this.adapter = adapter;
    this.queues = /* @__PURE__ */ new Map();
    this.loadStates = /* @__PURE__ */ new Map();
    this.writers = /* @__PURE__ */ new Map();
  }
  async load(file) {
    try {
      const board = parseBoard(await this.adapter.read(file));
      this.loadStates.set(file, "ready");
      return board;
    } catch (error) {
      this.loadStates.set(file, "blocked");
      throw error;
    }
  }
  /** Claims the write token for a file. Idempotent for the same token; refused if taken. */
  acquireWriter(file, token) {
    if (!token) return false;
    const owner = this.writers.get(file);
    if (owner && owner !== token) return false;
    this.writers.set(file, token);
    return true;
  }
  /** Releases the write token when the surface shuts down or switches away. */
  releaseWriter(file, token) {
    if (this.writers.get(file) === token) this.writers.delete(file);
  }
  /** Moves ownership to a new token, which is how `openFullView` hands off to the full view. */
  transferWriter(file, from, to) {
    if (!to || this.writers.get(file) !== from) return false;
    this.writers.set(file, to);
    return true;
  }
  isWriter(file, token) {
    return Boolean(token) && this.writers.get(file) === token;
  }
  async save(file, board, options = {}) {
    var _a;
    if (this.loadStates.get(file) === "blocked") throw new Error("Board is read-only until a successful reload");
    const owner = this.writers.get(file);
    if (owner && owner !== options.token) {
      throw new Error("Board is read-only: another surface owns this board");
    }
    const valid = parseBoard(JSON.stringify(board));
    const previous = (_a = this.queues.get(file)) != null ? _a : Promise.resolve();
    const next = previous.catch(() => {
    }).then(() => this.adapter.process(file, () => JSON.stringify(valid, null, 2)));
    this.queues.set(file, next);
    next.finally(() => {
      if (this.queues.get(file) === next) this.queues.delete(file);
    }).catch(() => {
    });
    return next;
  }
  async flush() {
    await Promise.all([...this.queues.values()]);
  }
};

// src/readflow-layout.js
var READFLOW_CARD = Object.freeze({ width: 320, height: 220 });
var READFLOW_GAP = 40;
var READFLOW_BOOK_GAP = 96;
var UNCHAPTERED = "\u672A\u5206\u7AE0";
function readFlowChapterKey(candidate) {
  return candidate.chapter || UNCHAPTERED;
}
function contentBounds(nodes) {
  let right = -Infinity;
  let top = Infinity;
  for (const node of nodes) {
    right = Math.max(right, node.x + node.width);
    top = Math.min(top, node.y);
  }
  return { right, top };
}
function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    var _a, _b;
    const left = String((_a = a.created) != null ? _a : "");
    const right = String((_b = b.created) != null ? _b : "");
    if (left !== right) return left < right ? -1 : 1;
    return String(a.path).localeCompare(String(b.path), "zh-CN");
  });
}
function groupByBook(candidates) {
  const books = /* @__PURE__ */ new Map();
  for (const candidate of sortCandidates(candidates)) {
    const book = candidate.book || "";
    if (!books.has(book)) books.set(book, /* @__PURE__ */ new Map());
    const chapter = readFlowChapterKey(candidate);
    const chapters = books.get(book);
    if (!chapters.has(chapter)) chapters.set(chapter, []);
    chapters.get(chapter).push(candidate);
  }
  return books;
}
function layoutReadFlowCandidates(candidates, existingNodes = [], { size = READFLOW_CARD } = {}) {
  const books = groupByBook(candidates != null ? candidates : []);
  if (!books.size) return [];
  const hasExisting = existingNodes.length > 0;
  const bounds2 = hasExisting ? contentBounds(existingNodes) : null;
  const baseY = hasExisting ? bounds2.top : 0;
  let bookX = hasExisting ? bounds2.right + READFLOW_BOOK_GAP : 0;
  const placements = [];
  for (const book of [...books.keys()].sort((a, b) => a.localeCompare(b, "zh-CN"))) {
    const chapters = books.get(book);
    let columnX = bookX;
    for (const chapter of [...chapters.keys()].sort((a, b) => a.localeCompare(b, "zh-CN"))) {
      chapters.get(chapter).forEach((candidate, index) => {
        placements.push({ candidate, point: { x: columnX, y: baseY + index * (size.height + READFLOW_GAP) } });
      });
      columnX += size.width + READFLOW_GAP;
    }
    bookX = columnX - READFLOW_GAP + READFLOW_BOOK_GAP;
  }
  return placements;
}

// src/embedded-board.js
var EMBEDDED_API_VERSION = 1;
function createEmbeddedLeaf(app, host) {
  const leaf = {
    app,
    workspace: app.workspace,
    containerEl: host,
    history: { backHistory: [], forwardHistory: [] }
  };
  leaf.history.owner = leaf;
  return leaf;
}
var SEED_COLUMNS = 8;
var SEED_GAP = 40;
var ILLEGAL_PATH_CHARS = /[\\/:*?"<>|]/g;
function defaultReadFlowBoardPath({ bookId } = {}) {
  const id = String(bookId != null ? bookId : "").trim().replace(ILLEGAL_PATH_CHARS, "_");
  if (!/[^_]/.test(id)) throw new Error("ReadFlow book id is required");
  return `${READFLOW_BOARD_FOLDER}/${id}.canvas`;
}
function seedReadFlowBoard(board, highlightPaths) {
  const paths = [...new Set((highlightPaths != null ? highlightPaths : []).filter((path) => typeof path === "string" && path.toLowerCase().endsWith(".md")))];
  let index = 0;
  for (const path of paths) {
    const column = Math.floor(index / SEED_COLUMNS);
    const row = index % SEED_COLUMNS;
    board.nodes.push(createFileNode(path, {
      x: column * (READFLOW_CARD.width + SEED_GAP),
      y: row * (READFLOW_CARD.height + SEED_GAP)
    }));
    index += 1;
  }
  return board;
}
function syncReadFlowHighlights(board, highlightPaths) {
  const existing = new Set(
    board.nodes.filter((node) => node.type === "file").map((node) => node.file)
  );
  const paths = [...new Set(
    (highlightPaths != null ? highlightPaths : []).filter((path) => typeof path === "string" && path.toLowerCase().endsWith(".md"))
  )];
  const missing = paths.filter((path) => !existing.has(path));
  if (!missing.length) return 0;
  const hasExisting = board.nodes.length > 0;
  const bounds2 = hasExisting ? contentBounds(board.nodes) : { right: 0, top: 0 };
  const baseX = hasExisting ? bounds2.right + SEED_GAP : 0;
  const baseY = hasExisting ? bounds2.top : 0;
  let index = 0;
  for (const path of missing) {
    const column = Math.floor(index / SEED_COLUMNS);
    const row = index % SEED_COLUMNS;
    board.nodes.push(createFileNode(path, {
      x: baseX + column * (READFLOW_CARD.width + SEED_GAP),
      y: baseY + row * (READFLOW_CARD.height + SEED_GAP)
    }));
    index += 1;
  }
  return missing.length;
}
function reconcileReadFlowBoard(board, highlightPaths) {
  if (!board) {
    const fresh = createBoard();
    seedReadFlowBoard(fresh, highlightPaths);
    return { board: fresh, created: true, addedCount: fresh.nodes.length };
  }
  const addedCount = syncReadFlowHighlights(board, highlightPaths);
  return { board, created: false, addedCount };
}

// src/readflow-ensure.js
async function ensureReadFlowBoardAt({ path, highlightPaths, vault, boardStore, ensureFolder }) {
  await ensureFolder(path.split("/").slice(0, -1).join("/"));
  const existing = vault.getAbstractFileByPath(path);
  const current = existing ? await boardStore.load(path) : null;
  const result = reconcileReadFlowBoard(current, highlightPaths);
  if (result.created) {
    await vault.create(path, JSON.stringify(result.board, null, 2));
  } else if (result.addedCount > 0) {
    await boardStore.save(path, result.board);
  }
  return { boardPath: path, created: result.created, addedCount: result.addedCount };
}

// src/serial-queue.js
function serializeByKey(queues, key, task) {
  var _a;
  const previous = (_a = queues.get(key)) != null ? _a : Promise.resolve();
  const current = previous.catch(() => {
  }).then(task);
  const barrier = current.then(
    () => {
    },
    () => {
    }
  );
  queues.set(key, barrier);
  barrier.finally(() => {
    if (queues.get(key) === barrier) queues.delete(key);
  }).catch(() => {
  });
  return current;
}

// src/knowledge-canvas-view.js
var import_obsidian6 = require("obsidian");

// src/card-queries.js
var LABEL_LIMIT = 40;
function baseName(path) {
  return String(path != null ? path : "").split("/").at(-1).replace(/\.md$/i, "");
}
function cardLabel(node) {
  var _a, _b;
  if (isFileNode(node)) return baseName(node.file);
  if (isExcerptNode(node)) return baseName((_a = excerptSourcePath(node.kcExcerpt)) != null ? _a : node.kcExcerpt.sourceFile);
  if (isTextNode(node)) {
    const firstLine = String((_b = node.text) != null ? _b : "").split("\n").find((line) => line.trim());
    return (firstLine != null ? firstLine : "").trim().slice(0, LABEL_LIMIT) || "\u6587\u672C\u5361";
  }
  if (isGroupNode(node)) return typeof node.label === "string" && node.label.trim() || "\u5206\u7EC4";
  return "";
}
function findCollapseTarget(board, id) {
  var _a, _b;
  return (_b = ((_a = board == null ? void 0 : board.nodes) != null ? _a : []).find((node) => node.id === id && !isGroupNode(node))) != null ? _b : null;
}
function outlineSelection(board, visibleNodes) {
  var _a;
  const nodes = (visibleNodes != null ? visibleNodes : []).filter(isFileNode);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = ((_a = board == null ? void 0 : board.edges) != null ? _a : []).filter((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode));
  return { nodes, edges };
}
function canPromoteToMarkdown(board, edge) {
  var _a;
  const nodes = (_a = board == null ? void 0 : board.nodes) != null ? _a : [];
  const from = nodes.find((node) => node.id === (edge == null ? void 0 : edge.fromNode));
  const to = nodes.find((node) => node.id === (edge == null ? void 0 : edge.toNode));
  return Boolean(from && to && isFileNode(from) && isFileNode(to));
}

// src/canvas-tools.js
var TOOL_ENTRY_BASE_ACTIONS = Object.freeze(["sticky", "importFile", "importFolder", "layout"]);
var TOPBAR_BOARD_ACTIONS = Object.freeze(["boardSelect", "newBoard", "importReadFlow", "boardMenu"]);
function createToolEntryState() {
  return { expanded: false };
}
function reduceToolEntry(state, event) {
  switch (event == null ? void 0 : event.type) {
    case "toggle":
      return { expanded: !state.expanded };
    case "expand":
      return { expanded: true };
    case "collapse":
      return { expanded: false };
    default:
      return state;
  }
}
function toolEntryView(state) {
  const expanded = (state == null ? void 0 : state.expanded) === true;
  return {
    expanded,
    icon: expanded ? "x" : "plus",
    ariaLabel: expanded ? "\u6536\u8D77\u753B\u677F\u5DE5\u5177" : "\u5C55\u5F00\u753B\u677F\u5DE5\u5177",
    ariaExpanded: String(expanded),
    visibleActions: expanded ? [...TOOL_ENTRY_BASE_ACTIONS] : []
  };
}

// src/canvas-layout.js
var CANVAS_LAYOUT_GAP = 24;
var LAYOUT_COMMANDS = Object.freeze([
  "grid",
  "row",
  "column",
  "align-left",
  "align-center",
  "align-right",
  "align-top",
  "align-middle",
  "align-bottom",
  "distribute-h",
  "distribute-v"
]);
function isLayoutCommand(value) {
  return LAYOUT_COMMANDS.includes(value);
}
function unitRect(unit) {
  var _a;
  const node = (_a = unit == null ? void 0 : unit.nodes) == null ? void 0 : _a[0];
  if (!node) return null;
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + renderedNodeHeight(node),
    width: node.width,
    height: renderedNodeHeight(node)
  };
}
var byLeft = (a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top;
var byTop = (a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left;
function measured(units) {
  return (units != null ? units : []).map((unit) => ({ unit, rect: unitRect(unit) })).filter((entry) => entry.rect);
}
function bounds(entries) {
  return {
    left: Math.min(...entries.map((entry) => entry.rect.left)),
    top: Math.min(...entries.map((entry) => entry.rect.top)),
    right: Math.max(...entries.map((entry) => entry.rect.right)),
    bottom: Math.max(...entries.map((entry) => entry.rect.bottom))
  };
}
function layoutPatch(units, command, { gap = CANVAS_LAYOUT_GAP } = {}) {
  const entries = measured(units);
  const positions = new Map(entries.map(({ unit, rect }) => [unit.id, { x: rect.left, y: rect.top }]));
  if (!entries.length || !isLayoutCommand(command)) return [...positions].map(([id, point2]) => ({ id, ...point2 }));
  const box = bounds(entries);
  const move = (id, x, y) => positions.set(id, { x, y });
  if (command === "grid") {
    const ordered = [...entries].sort(byTop);
    const columns = Math.ceil(Math.sqrt(ordered.length));
    const cellWidth = Math.max(...ordered.map((entry) => entry.rect.width)) + gap;
    const cellHeight = Math.max(...ordered.map((entry) => entry.rect.height)) + gap;
    ordered.forEach((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      move(entry.unit.id, box.left + column * cellWidth, box.top + row * cellHeight);
    });
  } else if (command === "row") {
    let x = box.left;
    for (const entry of [...entries].sort(byLeft)) {
      move(entry.unit.id, x, box.top);
      x += entry.rect.width + gap;
    }
  } else if (command === "column") {
    let y = box.top;
    for (const entry of [...entries].sort(byTop)) {
      move(entry.unit.id, box.left, y);
      y += entry.rect.height + gap;
    }
  } else if (command.startsWith("align-")) {
    for (const entry of entries) {
      const { rect } = entry;
      if (command === "align-left") move(entry.unit.id, box.left, rect.top);
      else if (command === "align-right") move(entry.unit.id, box.right - rect.width, rect.top);
      else if (command === "align-center") move(entry.unit.id, (box.left + box.right) / 2 - rect.width / 2, rect.top);
      else if (command === "align-top") move(entry.unit.id, rect.left, box.top);
      else if (command === "align-bottom") move(entry.unit.id, rect.left, box.bottom - rect.height);
      else if (command === "align-middle") move(entry.unit.id, rect.left, (box.top + box.bottom) / 2 - rect.height / 2);
    }
  } else if (command === "distribute-h" && entries.length >= 3) {
    const ordered = [...entries].sort(byLeft);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const span = last.rect.right - first.rect.left;
    const totalWidth = ordered.reduce((sum, entry) => sum + entry.rect.width, 0);
    const step = (span - totalWidth) / (ordered.length - 1);
    let x = first.rect.left;
    for (const entry of ordered) {
      move(entry.unit.id, x, entry.rect.top);
      x += entry.rect.width + step;
    }
  } else if (command === "distribute-v" && entries.length >= 3) {
    const ordered = [...entries].sort(byTop);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const span = last.rect.bottom - first.rect.top;
    const totalHeight = ordered.reduce((sum, entry) => sum + entry.rect.height, 0);
    const step = (span - totalHeight) / (ordered.length - 1);
    let y = first.rect.top;
    for (const entry of ordered) {
      move(entry.unit.id, entry.rect.left, y);
      y += entry.rect.height + step;
    }
  }
  return (units != null ? units : []).map((unit) => {
    var _a;
    return { id: unit.id, ...(_a = positions.get(unit.id)) != null ? _a : { x: 0, y: 0 } };
  });
}
function applyLayoutPatch(units, patch) {
  const byId = new Map((units != null ? units : []).map((unit) => [unit.id, unit]));
  for (const { id, x, y } of patch != null ? patch : []) {
    const unit = byId.get(id);
    if (!unit) continue;
    const anchor = unit.nodes[0];
    if (!anchor) continue;
    const dx = x - anchor.x;
    const dy = y - anchor.y;
    if (dx === 0 && dy === 0) continue;
    for (const node of unit.nodes) {
      node.x += dx;
      node.y += dy;
    }
  }
  return units != null ? units : [];
}

// src/canvas-snap.js
var SNAP_SCREEN_PX = 8;
function snapThreshold(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value) || value <= 0) return SNAP_SCREEN_PX;
  return SNAP_SCREEN_PX / value;
}
function verticalLines(node) {
  return [node.x, node.x + node.width / 2, node.x + node.width];
}
function horizontalLines(node) {
  const height = renderedNodeHeight(node);
  return [node.y, node.y + height / 2, node.y + height];
}
function dedupe(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => a - b);
}
function snapLines(nodes, movingIds) {
  const moving = movingIds instanceof Set ? movingIds : new Set(movingIds != null ? movingIds : []);
  const xs = [];
  const ys = [];
  for (const node of nodes != null ? nodes : []) {
    if (!isCardNode(node) && !isGroupNode(node)) continue;
    if (moving.has(node.id)) continue;
    xs.push(...verticalLines(node));
    ys.push(...horizontalLines(node));
  }
  return { xs: dedupe(xs), ys: dedupe(ys) };
}
function nearest(lines, candidates, threshold) {
  let best = null;
  for (const line of lines) {
    for (const candidate of candidates) {
      const delta = candidate - line;
      const distance2 = Math.abs(delta);
      if (distance2 > threshold) continue;
      if (!best || distance2 < best.distance || distance2 === best.distance && candidate < best.candidate || distance2 === best.distance && candidate === best.candidate && line < best.line) {
        best = { delta, distance: distance2, candidate, line };
      }
    }
  }
  return best;
}
function snapRect(rect, lines, { threshold = SNAP_SCREEN_PX, enabled = true } = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const none = { dx: 0, dy: 0, guideX: null, guideY: null };
  if (!rect || !enabled || !(threshold > 0)) return none;
  const left = (_a = rect.left) != null ? _a : rect.x;
  const top = (_b = rect.top) != null ? _b : rect.y;
  const right = (_c = rect.right) != null ? _c : left + rect.width;
  const bottom = (_d = rect.bottom) != null ? _d : top + rect.height;
  const x = nearest([left, (left + right) / 2, right], (_e = lines == null ? void 0 : lines.xs) != null ? _e : [], threshold);
  const y = nearest([top, (top + bottom) / 2, bottom], (_f = lines == null ? void 0 : lines.ys) != null ? _f : [], threshold);
  return {
    dx: (_g = x == null ? void 0 : x.delta) != null ? _g : 0,
    dy: (_h = y == null ? void 0 : y.delta) != null ? _h : 0,
    guideX: x ? x.candidate : null,
    guideY: y ? y.candidate : null
  };
}
function dragBounds(nodes) {
  const list = (nodes != null ? nodes : []).filter((node) => isCardNode(node) || isGroupNode(node));
  if (!list.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of list) {
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + renderedNodeHeight(node));
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// src/board-management-modal.js
var import_obsidian = require("obsidian");
var nextBoardControlId = 0;
var RenameBoardModal = class extends import_obsidian.Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
  }
  onOpen() {
    const { currentName, noteFolder, validate } = this.options;
    this.titleEl.setText("\u91CD\u547D\u540D\u753B\u5E03");
    const form = this.contentEl.createEl("form", { cls: "kc-input-form" });
    const group = form.createDiv({ cls: "kc-input-field" });
    const id = `kc-board-rename-${++nextBoardControlId}`;
    const label = group.createEl("label", { text: "\u753B\u5E03\u540D\u79F0" });
    label.htmlFor = id;
    const input = group.createEl("input");
    input.id = id;
    input.type = "text";
    input.value = currentName != null ? currentName : "";
    let folderCheckbox = null;
    if (noteFolder) {
      const row = form.createDiv({ cls: "kc-input-field kc-input-field--checkbox" });
      const boxId = `${id}-folder`;
      folderCheckbox = row.createEl("input");
      folderCheckbox.id = boxId;
      folderCheckbox.type = "checkbox";
      folderCheckbox.checked = false;
      const boxLabel = row.createEl("label", { text: "\u540C\u65F6\u91CD\u547D\u540D\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939" });
      boxLabel.htmlFor = boxId;
      form.createEl("p", { cls: "kc-input-hint", text: `\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\uFF1A${noteFolder}` });
    }
    const actions = form.createDiv({ cls: "kc-modal-actions" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const submit = actions.createEl("button", { cls: "mod-cta", text: "\u4FDD\u5B58" });
    submit.type = "submit";
    form.addEventListener("submit", (event) => {
      var _a;
      event.preventDefault();
      const values = { name: input.value, renameNoteFolder: (folderCheckbox == null ? void 0 : folderCheckbox.checked) === true };
      const error = (_a = validate == null ? void 0 : validate(values)) != null ? _a : null;
      if (error) {
        new import_obsidian.Notice(error);
        input.focus();
        input.select();
        return;
      }
      this.submit(values);
    });
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  }
  submit(values) {
    if (this.settled) return;
    this.settled = true;
    this.resolve(values);
    this.close();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
};
var DeleteBoardModal = class extends import_obsidian.Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
    this.deleteNoteFolder = false;
  }
  onOpen() {
    const { name, noteFolder, folderDeletable, folderReason } = this.options;
    this.titleEl.setText(`\u5220\u9664\u753B\u5E03\u300C${name}\u300D\uFF1F`);
    this.contentEl.createEl("p", { text: "\u753B\u5E03\u6587\u4EF6\u4F1A\u79FB\u5165\u5E9F\u7EB8\u7BD3\uFF0CMarkdown \u7B14\u8BB0\u9ED8\u8BA4\u4FDD\u7559\u3002" });
    if (noteFolder) {
      const row = this.contentEl.createDiv({ cls: "kc-delete-option" });
      const id = `kc-board-delete-folder-${++nextBoardControlId}`;
      const checkbox = row.createEl("input", { attr: { type: "checkbox", id } });
      checkbox.checked = false;
      checkbox.disabled = !folderDeletable;
      checkbox.addEventListener("change", () => {
        this.deleteNoteFolder = checkbox.checked;
      });
      const label = row.createEl("label", { text: "\u540C\u65F6\u5220\u9664\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939" });
      label.htmlFor = id;
      this.contentEl.createEl("p", { cls: "kc-input-hint", text: `\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\uFF1A${noteFolder}` });
      if (!folderDeletable && folderReason) {
        const reason = this.contentEl.createEl("p", { cls: "kc-delete-reason", text: folderReason });
        reason.id = `${id}-reason`;
        checkbox.setAttribute("aria-describedby", reason.id);
      }
    }
    const actions = this.contentEl.createDiv({ cls: "kc-modal-actions" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-warning kc-delete-confirm", text: "\u5220\u9664\u753B\u5E03" });
    confirm.type = "button";
    confirm.addEventListener("click", () => {
      if (this.settled) return;
      confirm.disabled = true;
      this.submit();
    });
    queueMicrotask(() => cancel.focus());
  }
  submit() {
    if (this.settled) return;
    this.settled = true;
    this.resolve({ deleteNoteFolder: this.deleteNoteFolder });
    this.close();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
};
function requestBoardRename(app, options) {
  return new Promise((resolve) => new RenameBoardModal(app, options, resolve).open());
}
function requestBoardDelete(app, options) {
  return new Promise((resolve) => new DeleteBoardModal(app, options, resolve).open());
}

// src/board-capabilities.js
function canMutateBoard({ writerOwned, loadError } = {}) {
  return writerOwned === true && !loadError;
}

// src/board-mutations.js
var BOARD_WRITES_PAUSED = "board-writes-paused";
function createMutationQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  const pauses = /* @__PURE__ */ new Set();
  let pauseSeq = 0;
  const enqueue = (task) => {
    if (pauses.size) {
      const error = new Error("Board writes are paused for a lifecycle change");
      error.code = BOARD_WRITES_PAUSED;
      return Promise.reject(error);
    }
    pending += 1;
    const run = tail.catch(() => {
    }).then(task);
    tail = run.then(
      () => {
        pending -= 1;
      },
      () => {
        pending -= 1;
      }
    );
    return run;
  };
  enqueue.idle = () => tail;
  enqueue.pending = () => pending > 0;
  enqueue.pause = () => {
    const token = Object.freeze({ id: ++pauseSeq });
    pauses.add(token);
    return token;
  };
  enqueue.resume = (token) => {
    if (token === void 0) pauses.clear();
    else pauses.delete(token);
  };
  enqueue.isPaused = () => pauses.size > 0;
  enqueue.pauseCount = () => pauses.size;
  return enqueue;
}
async function runBoardMutation(queue, { read, commit, before = null }, mutator) {
  return queue(async () => {
    if (before) await before();
    const next = JSON.parse(JSON.stringify(read()));
    const outcome = await mutator(next);
    if (outcome === false) return false;
    return commit(next);
  });
}

// src/editor-bridge.js
function createSourceSavedHandler(sync) {
  if (typeof sync !== "function") return null;
  return (info) => sync(info);
}

// src/lifecycle-queue.js
function createLifecycleQueue() {
  let tail = Promise.resolve();
  let closing = false;
  let shutdown = null;
  const enqueue = (task) => {
    const current = tail.catch(() => {
    }).then(task);
    tail = current.then(
      () => {
      },
      () => {
      }
    );
    return current;
  };
  const run = (task) => {
    if (closing) return Promise.resolve(false);
    return enqueue(task);
  };
  run.shutdown = (task) => {
    if (shutdown) return shutdown;
    closing = true;
    shutdown = enqueue(() => task()).catch((error) => {
      closing = false;
      shutdown = null;
      throw error;
    });
    return shutdown;
  };
  run.isClosing = () => closing;
  return run;
}

// src/folder-scan.js
var SCAN_CHUNK_SIZE = 200;
var defaultYield = () => new Promise((resolve) => setTimeout(resolve, 0));
async function scanFolderFiles(files, folderPath, { chunkSize = SCAN_CHUNK_SIZE, yieldTo = defaultYield, onChunk = null } = {}) {
  const list = files != null ? files : [];
  const size = Math.max(1, Number(chunkSize) || SCAN_CHUNK_SIZE);
  const matches = [];
  let scanned = 0;
  for (const file of list) {
    if (isMarkdownPath(file == null ? void 0 : file.path) && isInsideFolder(file.path, folderPath)) matches.push(file);
    scanned += 1;
    if (scanned % size === 0) {
      onChunk == null ? void 0 : onChunk(scanned, list.length);
      await yieldTo();
    }
  }
  return matches;
}

// src/gesture-lifecycle.js
var GEOMETRY_GESTURES = Object.freeze(["move", "resize", "group-move"]);
function cancelGestureGeometry(board, gesture) {
  var _a;
  if (!gesture) return { kind: null, restored: false };
  const kind = (_a = gesture.kind) != null ? _a : null;
  if (!GEOMETRY_GESTURES.includes(kind)) return { kind, restored: false };
  if (!Array.isArray(gesture.nodes) || !gesture.nodes.length) return { kind, restored: false };
  restoreGeometry(board, gesture.nodes);
  return { kind, restored: true };
}
function isPanGesture(gesture) {
  return (gesture == null ? void 0 : gesture.kind) === "pan";
}

// src/selection-events.js
function selectionAfterPointerDown(selection, id, { additive = false } = {}) {
  const next = new Set(selection != null ? selection : []);
  if (additive) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }
  if (next.has(id)) return next;
  return /* @__PURE__ */ new Set([id]);
}
function selectionAfterFocus(selection, id, { keyboardVisible = false } = {}) {
  if (!keyboardVisible) return selection instanceof Set ? selection : new Set(selection != null ? selection : []);
  return /* @__PURE__ */ new Set([id]);
}
function isKeyboardFocus(element2, matches = (node, selector) => node.matches(selector)) {
  if (!element2) return false;
  try {
    return matches(element2, ":focus-visible");
  } catch (e) {
    return false;
  }
}

// src/color-picker.js
var import_obsidian2 = require("obsidian");

// src/color-picker-state.js
function createPickerState(current = "neutral") {
  const name = cardColorName(current);
  return { open: true, current: name, focused: name, settled: false, result: null };
}
function reducePicker(state, event) {
  if (state.settled) return state;
  switch (event == null ? void 0 : event.type) {
    case "move":
      return { ...state, focused: stepCardColor(state.focused, event.delta) };
    case "focus":
      return { ...state, focused: cardColorName(event.name) };
    case "confirm":
      return { ...state, open: false, settled: true, result: state.focused };
    case "cancel":
      return { ...state, open: false, settled: true, result: null };
    default:
      return state;
  }
}
function pickerSwatches(state) {
  return CARD_COLORS.map((color) => ({
    name: color.name,
    value: color.value,
    focused: color.name === (state == null ? void 0 : state.focused),
    selected: color.name === (state == null ? void 0 : state.current)
  }));
}

// src/color-picker.js
var ANCHOR_GAP = 6;
var VIEWPORT_MARGIN = 4;
var CardColorPicker = class {
  constructor(host) {
    this.host = host;
    this.root = null;
    this.state = null;
    this.onSelect = null;
    this.restoreFocusTo = null;
    this.anchorEl = null;
  }
  get isOpen() {
    return this.root !== null;
  }
  /** Used by the view's single outside-click listener; never registers one of its own. */
  contains(target) {
    var _a;
    return Boolean((_a = this.root) == null ? void 0 : _a.contains(target));
  }
  open({ anchorEl = null, current = "neutral", onSelect = null, restoreFocusTo = null } = {}) {
    this.close();
    this.state = createPickerState(current);
    this.anchorEl = anchorEl;
    this.onSelect = onSelect;
    this.restoreFocusTo = restoreFocusTo;
    this.root = document.createElement("div");
    this.root.className = "kc-color-picker";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", "\u5361\u7247\u989C\u8272");
    this.root.addEventListener("keydown", (event) => this.onKeyDown(event));
    this.paint();
    this.host.append(this.root);
    this.place();
    this.focusFocused();
  }
  paint() {
    if (!this.root) return;
    this.root.replaceChildren();
    for (const swatch of pickerSwatches(this.state)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "kc-color-swatch";
      button.dataset.swatch = swatch.name;
      button.setAttribute("aria-label", swatch.selected ? `${swatch.name}\uFF08\u5F53\u524D\u989C\u8272\uFF09` : swatch.name);
      button.setAttribute("aria-pressed", String(swatch.selected));
      if (swatch.selected) (0, import_obsidian2.setIcon)(button, "check");
      button.addEventListener("click", () => {
        this.dispatch({ type: "focus", name: swatch.name });
        this.dispatch({ type: "confirm" });
      });
      this.root.append(button);
    }
  }
  onKeyDown(event) {
    const action = {
      ArrowLeft: { type: "move", delta: -1 },
      ArrowUp: { type: "move", delta: -1 },
      ArrowRight: { type: "move", delta: 1 },
      ArrowDown: { type: "move", delta: 1 },
      Tab: { type: "move", delta: event.shiftKey ? -1 : 1 },
      Enter: { type: "confirm" },
      " ": { type: "confirm" },
      Escape: { type: "cancel" }
    }[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.dispatch(action);
  }
  dispatch(event) {
    if (!this.state) return;
    const next = reducePicker(this.state, event);
    if (next === this.state) return;
    this.state = next;
    if (next.settled) {
      const { result } = next;
      const onSelect = this.onSelect;
      this.close();
      if (result && onSelect) onSelect(result);
      return;
    }
    this.paint();
    this.place();
    this.focusFocused();
  }
  focusFocused() {
    var _a;
    if (!this.root || !this.state) return;
    (_a = this.root.querySelector(`[data-swatch="${this.state.focused}"]`)) == null ? void 0 : _a.focus();
  }
  anchorRect() {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.anchorEl) == null ? void 0 : _a.getBoundingClientRect) == null ? void 0 : _b.call(_a)) != null ? _c : this.host.getBoundingClientRect();
  }
  place() {
    if (!this.root) return;
    const hostRect = this.host.getBoundingClientRect();
    const anchorRect = this.anchorRect();
    const width = this.root.offsetWidth || 0;
    const height = this.root.offsetHeight || 0;
    let left = anchorRect.left - hostRect.left;
    let top = anchorRect.bottom - hostRect.top + ANCHOR_GAP;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, hostRect.width - width - VIEWPORT_MARGIN));
    if (top + height > hostRect.height - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, anchorRect.top - hostRect.top - height - ANCHOR_GAP);
    }
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }
  /** Always safe to call: closing an already closed picker is a no-op. */
  close() {
    const restore = this.restoreFocusTo;
    this.restoreFocusTo = null;
    this.onSelect = null;
    this.anchorEl = null;
    this.state = null;
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    restore == null ? void 0 : restore();
  }
};

// src/viewport.js
var MIN_SCALE = 0.2;
var MAX_SCALE = 3;
function clampScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}
function screenToWorld(point2, viewport) {
  return { x: (point2.x - viewport.x) / viewport.scale, y: (point2.y - viewport.y) / viewport.scale };
}
function worldToScreen(point2, viewport) {
  return { x: point2.x * viewport.scale + viewport.x, y: point2.y * viewport.scale + viewport.y };
}
function zoomAt(anchor, delta, viewport) {
  const world = screenToWorld(anchor, viewport);
  const scale = clampScale(viewport.scale * (1 + delta));
  return { x: anchor.x - world.x * scale, y: anchor.y - world.y * scale, scale };
}

// src/content-viewport.js
var FIT_PADDING = 64;
function contentBounds2(nodes) {
  const cards = (nodes != null ? nodes : []).filter(isCardNode);
  if (!cards.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of cards) {
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + renderedNodeHeight(node));
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}
function fitViewport(bounds2, { width, height } = {}, { padding = FIT_PADDING } = {}) {
  if (!bounds2 || !(width > 0) || !(height > 0)) return null;
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const fitWidth = availableWidth / Math.max(bounds2.width, 1);
  const fitHeight = availableHeight / Math.max(bounds2.height, 1);
  const scale = clampScale(Math.min(fitWidth, fitHeight));
  return {
    x: (width - bounds2.width * scale) / 2 - bounds2.left * scale,
    y: (height - bounds2.height * scale) / 2 - bounds2.top * scale,
    scale
  };
}

// src/delete-modal.js
var import_obsidian3 = require("obsidian");
var nextDeleteControlId = 0;
var DeleteCardsModal = class extends import_obsidian3.Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.resolve = resolve;
    this.settled = false;
    this.trash = false;
  }
  onOpen() {
    const { count, names, extra, trashDisabled, trashReason } = this.options;
    this.titleEl.setText(`\u79FB\u9664 ${count} \u5F20\u4FBF\u5229\u8D34\uFF1F`);
    this.contentEl.createEl("p", { text: "\u53EA\u4F1A\u79FB\u9664\u5F53\u524D\u753B\u677F\u4E2D\u7684\u6240\u9009\u5361\u7247\u548C\u5B83\u4EEC\u7684\u8FDE\u7EBF\uFF0CMarkdown \u6E90\u6587\u4EF6\u9ED8\u8BA4\u4FDD\u7559\u3002" });
    const list = this.contentEl.createEl("ul", { cls: "kc-delete-list" });
    for (const name of names) list.createEl("li", { text: name });
    if (extra > 0) list.createEl("li", { text: `\u4EE5\u53CA\u53E6\u5916 ${extra} \u4E2A\u6587\u4EF6` });
    const row = this.contentEl.createDiv({ cls: "kc-delete-option" });
    const checkboxId = `kc-delete-trash-${++nextDeleteControlId}`;
    const checkbox = row.createEl("input", { attr: { type: "checkbox", id: checkboxId } });
    checkbox.checked = false;
    checkbox.disabled = Boolean(trashDisabled);
    checkbox.addEventListener("change", () => {
      this.trash = checkbox.checked;
    });
    const label = row.createEl("label", { text: "\u540C\u65F6\u5C06 Markdown \u6E90\u6587\u4EF6\u79FB\u5165\u5E9F\u7EB8\u7BD3" });
    label.htmlFor = checkboxId;
    if (trashDisabled && trashReason) {
      const reason = this.contentEl.createEl("p", { cls: "kc-delete-reason", text: trashReason });
      reason.id = `${checkboxId}-reason`;
      checkbox.setAttribute("aria-describedby", reason.id);
    }
    const actions = this.contentEl.createDiv({ cls: "kc-modal-actions" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const confirm = actions.createEl("button", { cls: "mod-warning kc-delete-confirm", text: "\u79FB\u9664" });
    confirm.type = "button";
    confirm.addEventListener("click", () => {
      if (this.settled) return;
      confirm.disabled = true;
      this.submit();
    });
    queueMicrotask(() => cancel.focus());
  }
  submit() {
    if (this.settled) return;
    this.settled = true;
    this.resolve({ trash: this.trash });
    this.close();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
};
function requestDelete(app, options) {
  return new Promise((resolve) => new DeleteCardsModal(app, options, resolve).open());
}

// src/excerpt-placement.js
var EXCERPT_STEP = 32;
var STAGGER = 4;
function nextExcerptPoint(sourceNode, existingCount, { step = EXCERPT_STEP } = {}) {
  const baseX = sourceNode ? sourceNode.x + sourceNode.width + step : 160;
  const baseY = sourceNode ? sourceNode.y : 120;
  const index = Math.max(0, Number(existingCount) || 0);
  return { x: baseX + index % STAGGER * step, y: baseY + index * step };
}

// src/settings.js
var DEFAULT_SETTINGS = Object.freeze({
  noteFolder: "Inbox/Canvas",
  lastBoardPath: DEFAULT_BOARD_PATH,
  readFlowIntegrationEnabled: true,
  readFlowBindings: {}
});
var ILLEGAL_FOLDER_CHARS = /[\\:*?"<>|]/g;
function normalizeNoteFolder(value) {
  const cleaned = String(value != null ? value : "").replace(/\\/g, "/").split("/").map((segment) => segment.trim().replace(ILLEGAL_FOLDER_CHARS, "_")).filter((segment) => segment !== "" && segment !== "." && segment !== "..").join("/");
  return cleaned || DEFAULT_SETTINGS.noteFolder;
}
function normalizeReadFlowBindings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const bindings = {};
  for (const [bookId, boardPath] of Object.entries(value)) {
    if (typeof boardPath === "string" && boardPath.trim()) bindings[bookId] = boardPath;
  }
  return bindings;
}
function normalizeSettings(data) {
  const remembered = data == null ? void 0 : data.lastBoardPath;
  return {
    noteFolder: normalizeNoteFolder(data == null ? void 0 : data.noteFolder),
    lastBoardPath: typeof remembered === "string" && remembered.trim() ? remembered.trim() : DEFAULT_BOARD_PATH,
    // ReadFlow integration is on unless the user has explicitly saved `false`; a missing
    // field (older settings) keeps existing users enabled.
    readFlowIntegrationEnabled: (data == null ? void 0 : data.readFlowIntegrationEnabled) !== false,
    readFlowBindings: normalizeReadFlowBindings(data == null ? void 0 : data.readFlowBindings)
  };
}
function noteFolderPreview(value, { exists = false } = {}) {
  const raw = String(value != null ? value : "").trim();
  const folder = normalizeNoteFolder(raw);
  const fellBackToDefault = raw === "";
  const typed = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
  return {
    folder,
    status: fellBackToDefault ? "default" : exists ? "exists" : "create",
    fellBackToDefault,
    rewritten: !fellBackToDefault && typed !== folder
  };
}

// src/markdown-repository.js
var FileConflictError = class extends Error {
  constructor(path, expectedMtime, actualMtime) {
    super(`Markdown file changed outside the editor: ${path}`);
    this.name = "FileConflictError";
    this.path = path;
    this.expectedMtime = expectedMtime;
    this.actualMtime = actualMtime;
  }
};
var MarkdownRepository = class {
  constructor(vault, noteFolder = "Inbox/Canvas", now = () => /* @__PURE__ */ new Date()) {
    this.vault = vault;
    this.now = now;
    this.queues = /* @__PURE__ */ new Map();
    this.setNoteFolder(noteFolder);
  }
  /** 切换新建便利贴的存放目录，立即生效。返回规范化后的路径。 */
  setNoteFolder(noteFolder) {
    this.noteFolder = normalizeNoteFolder(noteFolder);
    return this.noteFolder;
  }
  /**
   * Creates a note in `options.folder` when given, otherwise in the plugin's note folder.
   * The folder is a per-call argument on purpose: two boards open at once must never leak
   * their canvas-local folder into each other through shared repository state.
   */
  async createNote(title, body = "", { folder } = {}) {
    const target = normalizeNoteFolder(folder != null ? folder : this.noteFolder);
    await this.ensureFolder(target);
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "\u672A\u547D\u540D";
    let path = `${target}/${safeTitle}.md`;
    let suffix = 2;
    while (this.vault.getAbstractFileByPath(path)) path = `${target}/${safeTitle} - ${suffix++}.md`;
    const content = `---
type: canvas-note
created: ${this.now().toISOString()}
---

# ${title.trim() || "\u672A\u547D\u540D"}

${body}`.trimEnd() + "\n";
    return this.vault.create(path, content);
  }
  async ensureFolder(path) {
    if (!path) return;
    const parts = path.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      const folder = parts.slice(0, index).join("/");
      if (!this.vault.getAbstractFileByPath(folder)) await this.vault.createFolder(folder);
    }
  }
  async read(fileOrPath) {
    const file = this.resolve(fileOrPath);
    return { file, content: await this.vault.read(file), mtime: file.stat.mtime };
  }
  async save(fileOrPath, expectedMtime, content) {
    var _a;
    const path = typeof fileOrPath === "string" ? fileOrPath : fileOrPath.path;
    const previous = (_a = this.queues.get(path)) != null ? _a : Promise.resolve();
    const next = previous.catch(() => {
    }).then(async () => {
      const file = this.resolve(path);
      if (file.stat.mtime !== expectedMtime) throw new FileConflictError(path, expectedMtime, file.stat.mtime);
      await this.vault.modify(file, content);
      return { mtime: file.stat.mtime };
    });
    this.queues.set(path, next);
    next.finally(() => {
      if (this.queues.get(path) === next) this.queues.delete(path);
    }).catch(() => {
    });
    return next;
  }
  resolve(fileOrPath) {
    var _a;
    const file = typeof fileOrPath === "string" ? this.vault.getAbstractFileByPath(fileOrPath) : fileOrPath;
    if (!file || !((_a = file.path) == null ? void 0 : _a.toLowerCase().endsWith(".md")) || !file.stat) throw new Error(`Markdown file not found: ${typeof fileOrPath === "string" ? fileOrPath : ""}`);
    return file;
  }
  async flush() {
    await Promise.all([...this.queues.values()]);
  }
};

// src/paragraph-timestamp.js
var MARKER_PREFIX = "kc-time";
var MARKER_PATTERN = /^<!--\s*kc-time:\s*(\{[\s\S]*\})\s*-->\s*$/;
var FENCE_PATTERN = /^\s*(```|~~~)/;
function isIsoTimestamp2(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}
function toIso(now) {
  const value = typeof now === "function" ? now() : now;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}
function parseTimestampMarker(line) {
  const match = String(line != null ? line : "").trim().match(MARKER_PATTERN);
  if (!match) return null;
  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  if (!isIsoTimestamp2(payload.createdAt)) return null;
  if (payload.updatedAt !== void 0 && !isIsoTimestamp2(payload.updatedAt)) return null;
  return payload.updatedAt ? { createdAt: payload.createdAt, updatedAt: payload.updatedAt } : { createdAt: payload.createdAt };
}
function formatTimestampMarker(payload) {
  const body = payload.updatedAt ? { createdAt: payload.createdAt, updatedAt: payload.updatedAt } : { createdAt: payload.createdAt };
  return `<!-- ${MARKER_PREFIX}: ${JSON.stringify(body)} -->`;
}
function lineIndexAt(text, offset) {
  const limit = Math.max(0, Math.min(Number(offset) || 0, text.length));
  let line = 0;
  for (let index = 0; index < limit; index += 1) if (text[index] === "\n") line += 1;
  return line;
}
function scanParagraphs(text) {
  const lines = String(text != null ? text : "").split("\n");
  const blocks = [];
  const markers = [];
  let inFrontmatter = false;
  let inFence = false;
  let current = null;
  const flush = () => {
    if (!current) return;
    current.text = lines.slice(current.startLine, current.endLine + 1).join("\n");
    blocks.push(current);
    current = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (index === 0 && line.trim() === "---") {
      inFrontmatter = true;
      flush();
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === "---") inFrontmatter = false;
      continue;
    }
    if (FENCE_PATTERN.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      flush();
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const marker = parseTimestampMarker(line);
    if (marker) {
      flush();
      markers.push({ line: index, ...marker });
      continue;
    }
    if (!current) current = { startLine: index, endLine: index, text: "", marker: null };
    else current.endLine = index;
  }
  flush();
  for (const marker of markers) {
    let target = null;
    for (const block of blocks) {
      if (block.endLine < marker.line) target = block;
      else break;
    }
    if (target && !target.marker) target.marker = marker;
  }
  return { lines, blocks };
}
function addParagraphTimestamp(text, cursor, now = () => /* @__PURE__ */ new Date()) {
  const { lines, blocks } = scanParagraphs(text);
  const line = lineIndexAt(String(text != null ? text : ""), cursor);
  const block = blocks.find((candidate) => line >= candidate.startLine && line <= candidate.endLine);
  if (!block) return null;
  if (block.marker) return { text: String(text != null ? text : ""), added: false, marker: block.marker };
  const marker = { createdAt: toIso(now) };
  let insertAt = block.endLine + 1;
  if (lines[insertAt] !== void 0 && lines[insertAt].trim() === "") insertAt += 1;
  lines.splice(insertAt, 0, formatTimestampMarker(marker));
  return { text: lines.join("\n"), added: true, marker };
}
function stampChangedParagraphs(nextText, previousText, now = () => /* @__PURE__ */ new Date()) {
  var _a, _b;
  const next = scanParagraphs(nextText);
  const previous = scanParagraphs(previousText);
  const before = /* @__PURE__ */ new Map();
  for (const block of previous.blocks) {
    if ((_a = block.marker) == null ? void 0 : _a.createdAt) before.set(block.marker.createdAt, block.text);
  }
  if (!before.size) return { text: nextText, updated: 0 };
  const iso = toIso(now);
  const lines = [...next.lines];
  let updated = 0;
  for (const block of [...next.blocks].sort((a, b) => b.startLine - a.startLine)) {
    const createdAt = (_b = block.marker) == null ? void 0 : _b.createdAt;
    if (!createdAt || !before.has(createdAt)) continue;
    if (before.get(createdAt) === block.text) continue;
    lines[block.marker.line] = formatTimestampMarker({ createdAt, updatedAt: iso });
    updated += 1;
  }
  if (!updated) return { text: nextText, updated: 0 };
  return { text: lines.join("\n"), updated };
}

// src/readflow-adapter.js
function frontmatterValue(content, key) {
  var _a, _b;
  const match = content.match(new RegExp(`^${key}:\\s*["']?([^\\n"']+)["']?\\s*$`, "m"));
  return (_b = (_a = match == null ? void 0 : match[1]) == null ? void 0 : _a.trim()) != null ? _b : "";
}
function displayLink(value) {
  var _a;
  const match = value.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  const target = match ? match[2] || match[1] : value;
  return (_a = target.split("/").at(-1)) != null ? _a : "";
}
function toReadFlowCard(file, content, frontmatter = {}) {
  var _a, _b, _c, _d, _e, _f;
  if (frontmatter.type !== "highlight") return null;
  const body = content.replace(/^---\n[\s\S]*?\n---\s*/, "");
  const quoteMatch = body.match(/(?:^|\n)((?:>[^\n]*(?:\n|$))+)/);
  const excerpt = ((_a = quoteMatch == null ? void 0 : quoteMatch[1]) != null ? _a : "").split("\n").filter(Boolean).map((line) => line.replace(/^>\s?/, "").trimEnd()).join("\n").trim();
  const commentMatch = body.match(/^## 我的想法\s*\n([\s\S]*?)(?=^##\s|\s*$)/m);
  const comment = (_c = (_b = commentMatch == null ? void 0 : commentMatch[1]) == null ? void 0 : _b.trim()) != null ? _c : "";
  const book = displayLink(String((_d = frontmatter.book) != null ? _d : frontmatterValue(content, "book")));
  const title = excerpt.replace(/\s+/g, " ").slice(0, 36) || file.basename || "ReadFlow \u6458\u5F55";
  return {
    kind: "readflow",
    title,
    excerpt,
    comment,
    book,
    chapter: String((_e = frontmatter.chapter) != null ? _e : frontmatterValue(content, "chapter")),
    sourceId: String((_f = frontmatter.id) != null ? _f : frontmatterValue(content, "id"))
  };
}

// src/floating-editor.js
function renderWorkspacePreservingEditor(host, editorRoot, renderWorkspace) {
  editorRoot == null ? void 0 : editorRoot.remove();
  host.replaceChildren();
  renderWorkspace();
  if (editorRoot) host.append(editorRoot);
}
function deriveReadFlowPreview(filePath, content, frontmatter) {
  var _a, _b;
  const basename = (_b = (_a = filePath.split("/").at(-1)) == null ? void 0 : _a.replace(/\.md$/i, "")) != null ? _b : "";
  return toReadFlowCard({ path: filePath, basename }, content, frontmatter);
}
var EditorSession = class {
  constructor(path, repository, { now = () => /* @__PURE__ */ new Date(), onSaved = null } = {}) {
    this.path = path;
    this.repository = repository;
    this.now = now;
    this.onSaved = onSaved;
    this.lastSavedAt = null;
    this.text = "";
    this.savedText = "";
    this.mtime = 0;
    this.dirty = false;
    this.status = "idle";
    this.error = null;
    this.saving = null;
  }
  async load() {
    const current = await this.repository.read(this.path);
    this.text = current.content;
    this.savedText = current.content;
    this.mtime = current.mtime;
    this.dirty = false;
    this.status = "idle";
    this.error = null;
    return current;
  }
  setText(text) {
    this.text = text;
    this.dirty = true;
  }
  async save() {
    if (this.saving) return this.saving;
    if (!this.dirty) return { mtime: this.mtime };
    const savedAt = new Date(this.now()).toISOString();
    const originalText = this.text;
    const savingText = stampChangedParagraphs(originalText, this.savedText || originalText, () => savedAt).text;
    this.status = "saving";
    this.saving = this.repository.save(this.path, this.mtime, savingText).then(async (result) => {
      var _a;
      this.mtime = result.mtime;
      if (this.text === originalText) this.text = savingText;
      this.savedText = savingText;
      this.lastSavedAt = savedAt;
      this.dirty = this.text !== savingText;
      this.status = this.dirty ? "saving" : "saved";
      this.error = null;
      if (this.status === "saved") {
        try {
          await ((_a = this.onSaved) == null ? void 0 : _a.call(this, { path: this.path, content: savingText, savedAt }));
        } catch (e) {
        }
      }
      this.saving = null;
      return this.dirty ? this.save() : result;
    }).catch((error) => {
      this.status = error instanceof FileConflictError ? "conflict" : "error";
      this.error = error;
      this.dirty = true;
      this.saving = null;
      throw error;
    });
    return this.saving;
  }
  async reload() {
    return this.load();
  }
  /**
   * Persists pending edits and reports whether the source is now clean. Never throws:
   * the recovery UI owns explaining a conflict or a failed write.
   */
  async flushPending() {
    if (!this.dirty) return true;
    try {
      await this.save();
    } catch (e) {
      return false;
    }
    return !this.dirty;
  }
  async keepLocal() {
    const local = this.text;
    const current = await this.repository.read(this.path);
    this.mtime = current.mtime;
    this.text = local;
    this.dirty = true;
    return this.save();
  }
};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== void 0) node.textContent = text;
  return node;
}
var FLOATING_EDITOR_KEEP_VISIBLE = 48;
function clampEditorPosition(left, top, viewportWidth, viewportHeight, keepVisible = FLOATING_EDITOR_KEEP_VISIBLE) {
  const maxLeft = Math.max(0, viewportWidth - keepVisible);
  const maxTop = Math.max(0, viewportHeight - keepVisible);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop)
  };
}
function containingBlockOffset(root) {
  const rect = root.getBoundingClientRect();
  const offsetParent = root.offsetParent;
  if (offsetParent && typeof offsetParent.getBoundingClientRect === "function") {
    const parentRect = offsetParent.getBoundingClientRect();
    return { left: rect.left - parentRect.left, top: rect.top - parentRect.top };
  }
  return { left: rect.left, top: rect.top };
}
function viewportOf(root) {
  var _a;
  const view = (_a = root.ownerDocument) == null ? void 0 : _a.defaultView;
  if (view && Number.isFinite(view.innerWidth) && Number.isFinite(view.innerHeight)) {
    return { width: view.innerWidth, height: view.innerHeight };
  }
  return { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY };
}
function containingBlockSize(root) {
  const offsetParent = root.offsetParent;
  if (offsetParent && typeof offsetParent.getBoundingClientRect === "function") {
    const rect = offsetParent.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return { width: rect.width, height: rect.height };
  }
  return viewportOf(root);
}
function dragController(root) {
  let drag = null;
  return {
    onPointerDown(event) {
      var _a;
      const header = root.querySelector(".kc-floating-header");
      if (!header || !header.contains(event.target)) return;
      if (event.target.closest("button")) return;
      const offset = containingBlockOffset(root);
      drag = { x: event.clientX, y: event.clientY, left: offset.left, top: offset.top };
      (_a = header.setPointerCapture) == null ? void 0 : _a.call(header, event.pointerId);
    },
    onPointerMove(event) {
      if (!drag) return;
      const bounds2 = containingBlockSize(root);
      const position = clampEditorPosition(
        drag.left + event.clientX - drag.x,
        drag.top + event.clientY - drag.y,
        bounds2.width,
        bounds2.height
      );
      root.style.left = `${position.left}px`;
      root.style.top = `${position.top}px`;
    },
    onPointerUp() {
      drag = null;
    },
    onPointerCancel() {
      drag = null;
    }
  };
}
var FloatingEditor = class {
  constructor(options) {
    this.options = options;
    this.session = new EditorSession(options.filePath, options.repository, {
      now: options.now,
      onSaved: options.onSourceSaved ? (info) => options.onSourceSaved({ filePath: info.path, content: info.content, savedAt: info.savedAt }) : null
    });
    this.editing = false;
    this.tab = "preview";
    this.timer = null;
    this.root = null;
    this.textarea = null;
    this.pendingSelection = null;
    this.excerptWarning = null;
  }
  async open() {
    await this.session.load();
    this.applyExcerptAnchor();
    this.root = element("section", "kc-floating-editor");
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-label", `\u7F16\u8F91 ${this.options.filePath}`);
    this.options.host.append(this.root);
    this.render();
    this.enableDrag();
    return this;
  }
  /**
   * When the window was opened from an excerpt sticker, relocate the quote and select it.
   * A miss never touches the file: the saved quote is shown and the reason is stated.
   */
  applyExcerptAnchor() {
    const anchor = this.options.excerptAnchor;
    if (!anchor) return;
    const located = locateExcerpt(this.session.text, anchor);
    this.excerptLocation = located;
    if (located.found) {
      this.editing = true;
      this.pendingSelection = { start: located.start, end: located.end };
    } else {
      this.excerptWarning = "\u539F\u6587\u5DF2\u53D8\u5316\uFF0C\u65E0\u6CD5\u81EA\u52A8\u5B9A\u4F4D";
    }
  }
  render() {
    if (!this.root) return;
    this.root.replaceChildren();
    const header = element("header", "kc-floating-header");
    const title = element("strong", "", this.options.filePath.split("/").at(-1));
    const status = element("span", "kc-save-status", this.statusText());
    const edit = element("button", "mod-cta", this.editing ? "\u9884\u89C8" : "\u7F16\u8F91");
    edit.type = "button";
    edit.addEventListener("click", () => this.toggleEdit());
    const close = element("button", "clickable-icon", "\xD7");
    close.type = "button";
    close.setAttribute("aria-label", "\u5173\u95ED\u6D6E\u52A8\u7A97\u53E3");
    close.addEventListener("click", () => this.close());
    header.append(title, status, edit, close);
    this.root.append(header);
    const tabs = element("nav", "kc-editor-tabs");
    for (const [id, label] of [["preview", "\u9884\u89C8"], ["relations", "\u5173\u7CFB"], ["properties", "\u5C5E\u6027"]]) {
      const button = element("button", this.tab === id ? "is-active" : "", label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(this.tab === id));
      button.addEventListener("click", () => {
        this.tab = id;
        this.editing = false;
        this.render();
      });
      tabs.append(button);
    }
    this.root.append(tabs);
    const body = element("div", "kc-editor-body");
    this.root.append(body);
    if (this.tab === "relations") this.renderRelations(body);
    else if (this.tab === "properties") this.renderProperties(body);
    else if (this.editing) this.renderTextarea(body);
    else this.renderPreview(body);
    if (this.excerptWarning) this.renderExcerptWarning();
    if (["error", "conflict"].includes(this.session.status)) this.renderRecovery();
  }
  renderExcerptWarning() {
    const bar = element("div", "kc-editor-error", this.excerptWarning);
    bar.append(element("blockquote", "", this.options.excerptAnchor.quote));
    this.root.append(bar);
  }
  renderPreview(body) {
    const readFlow = this.currentReadFlow();
    if (readFlow) {
      body.append(element("h3", "", "\u539F\u6587\u6458\u5F55"), element("blockquote", "", readFlow.excerpt || "\u65E0\u6458\u5F55"));
      body.append(element("h3", "", "\u6211\u7684\u60F3\u6CD5"), element("p", "", readFlow.comment || "\u6682\u65E0\u60F3\u6CD5"));
      const source = element("button", "", "\u6253\u5F00\u6765\u6E90\u6587\u4EF6");
      source.type = "button";
      source.addEventListener("click", this.options.openSource);
      body.append(source);
      return;
    }
    if (this.options.renderMarkdown) this.options.renderMarkdown(this.session.text, body, this.options.filePath);
    else body.append(element("pre", "", this.session.text));
  }
  renderTextarea(body) {
    const textarea = element("textarea", "kc-editor-textarea");
    textarea.value = this.session.text;
    textarea.setAttribute("aria-label", "Markdown \u5185\u5BB9");
    textarea.addEventListener("input", () => {
      this.session.setText(textarea.value);
      this.scheduleSave();
      this.updateStatus();
    });
    textarea.addEventListener("contextmenu", (event) => this.onTextareaContextMenu(event));
    this.textarea = textarea;
    body.append(textarea);
    queueMicrotask(() => {
      textarea.focus();
      const pending = this.pendingSelection;
      this.pendingSelection = null;
      if (pending) this.selectRange(pending.start, pending.end);
    });
  }
  /** The current textarea selection as an intent, or null when it is empty/whitespace. */
  selectionIntent() {
    if (!this.textarea) return null;
    const start = Math.min(this.textarea.selectionStart, this.textarea.selectionEnd);
    const end = Math.max(this.textarea.selectionStart, this.textarea.selectionEnd);
    const quote = this.session.text.slice(start, end);
    if (!quote.trim()) return null;
    return { start, end, quote };
  }
  /** Builds the `kcExcerpt` payload for an intent, or null when the selection is unusable. */
  excerptAnchorFor(intent) {
    if (!intent) return null;
    return createExcerptAnchor({
      source: this.session.text,
      start: intent.start,
      end: intent.end,
      sourceFile: this.options.filePath,
      now: this.session.now
    });
  }
  /**
   * The editor never edits the board; it only reports the surface and the intent. The
   * view decides what the menu contains and what a chosen action means.
   */
  onTextareaContextMenu(event) {
    var _a, _b;
    const intent = this.selectionIntent();
    event.preventDefault();
    (_b = (_a = this.options).onTextContextMenu) == null ? void 0 : _b.call(_a, { event, intent });
  }
  /** Applies a pure transform result through the session, keeping auto-save and recovery. */
  applyTextTransform(transform) {
    if (!this.textarea) return false;
    const result = transform(this.textState());
    if (!result || result.text === this.session.text) return false;
    this.session.setText(result.text);
    this.textarea.value = result.text;
    this.scheduleSave();
    this.updateStatus();
    this.selectRange(result.start, result.end);
    return true;
  }
  textState() {
    if (!this.textarea) return { text: this.session.text, start: 0, end: 0 };
    return {
      text: this.session.text,
      start: Math.min(this.textarea.selectionStart, this.textarea.selectionEnd),
      end: Math.max(this.textarea.selectionStart, this.textarea.selectionEnd)
    };
  }
  /**
   * Called before anything that would persist a reference to this file's text. The source
   * is the single source of truth, so no excerpt may be created on top of unsaved edits.
   */
  async flushPending() {
    clearTimeout(this.timer);
    const clean = await this.session.flushPending();
    if (clean) this.updateStatus();
    else this.render();
    return clean;
  }
  selectRange(start, end) {
    if (!this.textarea) return false;
    this.textarea.focus();
    this.textarea.setSelectionRange(start, end);
    return true;
  }
  renderRelations(body) {
    var _a;
    const relations = (_a = this.options.relations) != null ? _a : [];
    if (!relations.length) body.append(element("p", "kc-muted", "\u6682\u65E0\u753B\u677F\u5173\u7CFB"));
    for (const relation of relations) body.append(element("div", "kc-relation-row", relation.label || "\u672A\u547D\u540D\u5173\u7CFB"));
  }
  renderProperties(body) {
    const readFlow = this.currentReadFlow();
    body.append(element("dl", "kc-properties"));
    const list = body.firstElementChild;
    list.append(element("dt", "", "\u6587\u4EF6"), element("dd", "", this.options.filePath));
    if (readFlow == null ? void 0 : readFlow.book) list.append(element("dt", "", "\u4E66\u7C4D"), element("dd", "", readFlow.book));
    if (readFlow == null ? void 0 : readFlow.chapter) list.append(element("dt", "", "\u7AE0\u8282"), element("dd", "", readFlow.chapter));
  }
  currentReadFlow() {
    if (!this.options.readFlow) return null;
    return deriveReadFlowPreview(this.options.filePath, this.session.text, this.options.readFlowFrontmatter);
  }
  renderRecovery() {
    var _a, _b;
    const bar = element("div", "kc-editor-error", this.session.status === "conflict" ? "\u6587\u4EF6\u5DF2\u5728\u5916\u90E8\u4FEE\u6539\uFF0C\u672C\u5730\u5185\u5BB9\u4ECD\u4FDD\u7559\u3002" : `\u4FDD\u5B58\u5931\u8D25\uFF1A${(_b = (_a = this.session.error) == null ? void 0 : _a.message) != null ? _b : "\u672A\u77E5\u9519\u8BEF"}`);
    if (this.session.status === "conflict") {
      const reload = element("button", "", "\u91CD\u65B0\u8F7D\u5165");
      reload.type = "button";
      reload.addEventListener("click", async () => {
        await this.session.reload();
        this.render();
      });
      const keep = element("button", "mod-cta", "\u4FDD\u7559\u6211\u7684\u5185\u5BB9");
      keep.type = "button";
      keep.addEventListener("click", async () => {
        try {
          await this.session.keepLocal();
          this.render();
        } catch (e) {
          this.render();
        }
      });
      bar.append(reload, keep);
    } else {
      const retry = element("button", "mod-cta", "\u91CD\u8BD5");
      retry.type = "button";
      retry.addEventListener("click", async () => {
        try {
          await this.session.save();
          this.render();
        } catch (e) {
          this.render();
        }
      });
      const copy = element("button", "", "\u590D\u5236\u5185\u5BB9");
      copy.type = "button";
      copy.addEventListener("click", () => navigator.clipboard.writeText(this.session.text));
      bar.append(retry, copy);
    }
    this.root.append(bar);
  }
  toggleEdit() {
    if (this.tab !== "preview") this.tab = "preview";
    this.editing = !this.editing;
    this.render();
  }
  scheduleSave() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        await this.session.save();
      } catch (e) {
      }
      this.syncTextarea();
      if (["error", "conflict"].includes(this.session.status)) this.render();
      else this.updateStatus();
    }, 600);
  }
  /** Mirrors save-time transforms (paragraph timestamps) back into the textarea. */
  syncTextarea() {
    if (!this.textarea || this.textarea.value === this.session.text) return;
    const { selectionStart, selectionEnd } = this.textarea;
    this.textarea.value = this.session.text;
    const length = this.textarea.value.length;
    this.textarea.setSelectionRange(Math.min(selectionStart, length), Math.min(selectionEnd, length));
  }
  updateStatus() {
    var _a;
    const status = (_a = this.root) == null ? void 0 : _a.querySelector(".kc-save-status");
    if (status) status.textContent = this.statusText();
  }
  statusText() {
    var _a;
    return (_a = { saving: "\u4FDD\u5B58\u4E2D\u2026", saved: "\u5DF2\u4FDD\u5B58", conflict: "\u6709\u51B2\u7A81", error: "\u4FDD\u5B58\u5931\u8D25" }[this.session.status]) != null ? _a : this.session.dirty ? "\u672A\u4FDD\u5B58" : "";
  }
  enableDrag() {
    if (!this.root || this.dragBound) return;
    this.dragBound = true;
    const controller = dragController(this.root);
    this.root.addEventListener("pointerdown", (event) => controller.onPointerDown(event));
    this.root.addEventListener("pointermove", (event) => controller.onPointerMove(event));
    this.root.addEventListener("pointerup", () => controller.onPointerUp());
    this.root.addEventListener("pointercancel", () => controller.onPointerCancel());
  }
  async handleEscape() {
    if (this.editing) {
      this.editing = false;
      this.render();
      return true;
    }
    await this.close();
    return true;
  }
  async close() {
    var _a, _b, _c;
    clearTimeout(this.timer);
    if (this.session.dirty) {
      try {
        await this.session.save();
      } catch (e) {
        this.render();
        return false;
      }
    }
    (_a = this.root) == null ? void 0 : _a.remove();
    this.root = null;
    (_c = (_b = this.options).onClose) == null ? void 0 : _c.call(_b);
    return true;
  }
};

// src/input-dialog-state.js
function createInputResult(resolve) {
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };
  return {
    submit: (value) => finish(value),
    cancel: () => finish(null)
  };
}
function normalizeStickyNote(values) {
  var _a, _b;
  const title = String((_a = values == null ? void 0 : values.title) != null ? _a : "").trim();
  if (!title) return null;
  return { title, body: String((_b = values == null ? void 0 : values.body) != null ? _b : "") };
}
function normalizeEdgeLabel(values) {
  var _a;
  const label = String((_a = values == null ? void 0 : values.label) != null ? _a : "").trim();
  return label || null;
}
function normalizeFilePath(values) {
  var _a;
  const path = String((_a = values == null ? void 0 : values.path) != null ? _a : "").trim();
  return path || null;
}
function normalizeBoardNameInput(values) {
  var _a;
  const raw = String((_a = values == null ? void 0 : values.name) != null ? _a : "").trim();
  if (!raw) return null;
  return { name: normalizeBoardName(raw) };
}
function normalizeBoardCreateInput(values) {
  const name = normalizeBoardNameInput(values);
  if (!name) return null;
  return { name: name.name, createNoteFolder: (values == null ? void 0 : values.createNoteFolder) === true };
}

// src/input-modal.js
var import_obsidian4 = require("obsidian");
var nextControlId = 0;
var InputModal = class extends import_obsidian4.Modal {
  constructor(app, options, resolve) {
    super(app);
    this.options = options;
    this.result = createInputResult(resolve);
    this.controls = /* @__PURE__ */ new Map();
  }
  hasMultiline() {
    return this.options.fields.some((field) => field.multiline);
  }
  onOpen() {
    var _a, _b;
    this.titleEl.setText(this.options.title);
    const form = this.contentEl.createEl("form", { cls: "kc-input-form" });
    for (const field of this.options.fields) {
      const group = form.createDiv({ cls: "kc-input-field" });
      const id = `kc-input-${++nextControlId}`;
      if (field.type === "checkbox") {
        group.addClass("kc-input-field--checkbox");
        const control2 = group.createEl("input");
        control2.id = id;
        control2.type = "checkbox";
        control2.checked = field.value === true;
        const label2 = group.createEl("label", { text: field.label });
        label2.htmlFor = id;
        this.controls.set(field.key, control2);
        continue;
      }
      const label = group.createEl("label", { text: field.label });
      label.htmlFor = id;
      const control = group.createEl(field.multiline ? "textarea" : "input");
      control.id = id;
      control.value = (_a = field.value) != null ? _a : "";
      if (!field.multiline) control.type = "text";
      if (field.placeholder) control.placeholder = field.placeholder;
      this.controls.set(field.key, control);
    }
    const actions = form.createDiv({ cls: "kc-modal-actions" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const submit = actions.createEl("button", { cls: "mod-cta", text: (_b = this.options.submitLabel) != null ? _b : "\u786E\u8BA4" });
    submit.type = "submit";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submitForm();
    });
    if (this.hasMultiline()) {
      form.addEventListener("keydown", (event) => {
        var _a2, _b2;
        if (event.key !== "Enter") return;
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          this.submitForm();
        } else if (((_a2 = event.target) == null ? void 0 : _a2.tagName) === "INPUT") {
          event.preventDefault();
          const controls = [...this.controls.values()];
          (_b2 = controls[controls.indexOf(event.target) + 1]) == null ? void 0 : _b2.focus();
        }
      });
    }
    queueMicrotask(() => {
      var _a2;
      return (_a2 = this.controls.values().next().value) == null ? void 0 : _a2.focus();
    });
  }
  submitForm() {
    var _a, _b;
    const values = {};
    for (const [key, control] of this.controls) {
      values[key] = control.type === "checkbox" ? control.checked === true : control.value;
    }
    const error = (_b = (_a = this.options).validate) == null ? void 0 : _b.call(_a, values);
    if (error) {
      new import_obsidian4.Notice(error);
      return;
    }
    this.result.submit(values);
    this.close();
  }
  onClose() {
    this.result.cancel();
    this.contentEl.empty();
  }
};
function requestInput(app, options) {
  return new Promise((resolve) => new InputModal(app, options, resolve).open());
}

// src/markdown-format.js
var BOLD_MARKER = "**";
var ITALIC_MARKER = "*";
var HIGHLIGHT_MARKER = "==";
var CODE_MARKER = "`";
var QUOTE_PREFIX = "> ";
var LIST_PREFIX = "- ";
var HEADING_LEVELS = [0, 1, 2, 3];
var HEADING_PATTERN = /^#{1,6}\s+/;
function clamp(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(Math.trunc(number), max));
}
function markerRunBefore(text, index, character) {
  let count = 0;
  while (index - 1 - count >= 0 && text[index - 1 - count] === character) count += 1;
  return count;
}
function markerRunAfter(text, index, character) {
  let count = 0;
  while (index + count < text.length && text[index + count] === character) count += 1;
  return count;
}
function isWrapped(text, start, end, marker) {
  if (start < marker.length || end + marker.length > text.length) return false;
  if (markerRunBefore(text, start, marker[0]) !== marker.length) return false;
  if (markerRunAfter(text, end, marker[0]) !== marker.length) return false;
  return true;
}
function toggleInlineFormat(state, marker) {
  var _a;
  const text = String((_a = state == null ? void 0 : state.text) != null ? _a : "");
  const start = clamp(state == null ? void 0 : state.start, text.length);
  const end = clamp(state == null ? void 0 : state.end, text.length);
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const size = marker.length;
  if (from === to) {
    const next2 = `${text.slice(0, from)}${marker}${marker}${text.slice(to)}`;
    return { text: next2, start: from + size, end: from + size };
  }
  if (isWrapped(text, from, to, marker)) {
    const next2 = `${text.slice(0, from - size)}${text.slice(from, to)}${text.slice(to + size)}`;
    return { text: next2, start: from - size, end: to - size };
  }
  const next = `${text.slice(0, from)}${marker}${text.slice(from, to)}${marker}${text.slice(to)}`;
  return { text: next, start: from + size, end: to + size };
}
function lineRange(text, start, end) {
  const from = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const newline = text.indexOf("\n", Math.max(from, end - 1));
  return { from, to: newline === -1 ? text.length : newline };
}
function transformBlock(text, start, end, transform) {
  const { from, to } = lineRange(text, start, end);
  const block = text.slice(from, to);
  if (!block) return { text, start: from, end: to };
  const next = transform(block.split("\n")).join("\n");
  return { text: `${text.slice(0, from)}${next}${text.slice(to)}`, start: from, end: from + next.length };
}
function toggleLinePrefix(state, prefix) {
  var _a;
  const text = String((_a = state == null ? void 0 : state.text) != null ? _a : "");
  const start = clamp(state == null ? void 0 : state.start, text.length);
  const end = clamp(state == null ? void 0 : state.end, text.length);
  return transformBlock(text, Math.min(start, end), Math.max(start, end), (lines) => lines.map((line) => {
    if (!line.trim()) return line;
    return line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`;
  }));
}
function setHeading(state, level) {
  var _a;
  const text = String((_a = state == null ? void 0 : state.text) != null ? _a : "");
  const start = clamp(state == null ? void 0 : state.start, text.length);
  const end = clamp(state == null ? void 0 : state.end, text.length);
  const prefix = level > 0 ? `${"#".repeat(level)} ` : "";
  return transformBlock(text, Math.min(start, end), Math.max(start, end), (lines) => lines.map((line) => {
    if (!line.trim()) return line;
    return `${prefix}${line.replace(HEADING_PATTERN, "")}`;
  }));
}

// src/outline.js
function projectOutline(nodes, edges) {
  var _a, _b;
  const items = nodes.filter((node) => !isGroupNode(node)).map((node) => ({ nodeId: node.id, node, parentId: null, children: [] }));
  const byId = new Map(items.map((item) => [item.nodeId, item]));
  const crossReferences = [];
  for (const edge of edges) {
    if (!byId.has(edge.fromNode) || !byId.has(edge.toNode)) continue;
    const directed = ((_a = edge.fromEnd) != null ? _a : "none") === "none" && edge.toEnd === "arrow";
    if (!directed) {
      crossReferences.push({ from: edge.fromNode, to: edge.toNode });
      continue;
    }
    const child = byId.get(edge.toNode);
    let ancestor = byId.get(edge.fromNode);
    let createsCycle = false;
    while (ancestor) {
      if (ancestor.nodeId === child.nodeId) {
        createsCycle = true;
        break;
      }
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : null;
    }
    if (child.parentId || createsCycle) crossReferences.push({ from: edge.fromNode, to: edge.toNode });
    else child.parentId = edge.fromNode;
  }
  for (const item of items) if (item.parentId) (_b = byId.get(item.parentId)) == null ? void 0 : _b.children.push(item);
  return { roots: items.filter((item) => !item.parentId), items, crossReferences };
}

// src/relation-promotion.js
var RelationSourceRequiredError = class extends Error {
  constructor() {
    super("Undirected relation requires an explicit source node");
    this.name = "RelationSourceRequiredError";
  }
};
function wikilink(path) {
  return `[[${path.replace(/\.md$/i, "")}]]`;
}
function appendRelation(content, line) {
  if (content.split("\n").some((existing) => existing.trim() === line)) return null;
  const heading = /^## 相关链接\s*$/m.exec(content);
  if (!heading) {
    const separator2 = content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
    return `${content}${separator2}## \u76F8\u5173\u94FE\u63A5

${line}
`;
  }
  const sectionStart = heading.index + heading[0].length;
  const nextHeading = /^##\s+/m.exec(content.slice(sectionStart));
  const insertion = nextHeading ? sectionStart + nextHeading.index : content.length;
  const before = content.slice(0, insertion);
  const after = content.slice(insertion);
  const separator = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  return `${before}${separator}${line}
${after ? `
${after}` : ""}`;
}
function previewPromotion(edge, nodes, files, sourceNode) {
  var _a;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let pairs;
  if (edge.fromEnd === "arrow" && edge.toEnd === "arrow") pairs = [[edge.fromNode, edge.toNode], [edge.toNode, edge.fromNode]];
  else if (edge.toEnd === "arrow") pairs = [[edge.fromNode, edge.toNode]];
  else if (edge.fromEnd === "arrow") pairs = [[edge.toNode, edge.fromNode]];
  else {
    if (!sourceNode || ![edge.fromNode, edge.toNode].includes(sourceNode)) throw new RelationSourceRequiredError();
    pairs = [[sourceNode, sourceNode === edge.fromNode ? edge.toNode : edge.fromNode]];
  }
  const changes = [];
  for (const [fromId, toId] of pairs) {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    const file = files[fromId];
    if (!from || !to || !file) throw new Error("Relation references a missing node or Markdown file");
    const append = `- ${wikilink(to.file)}${((_a = edge.label) == null ? void 0 : _a.trim()) ? ` \u2014 ${edge.label.trim()}` : ""}`;
    const content = appendRelation(file.content, append);
    if (content !== null) changes.push({ path: from.file, expectedMtime: file.mtime, append, content });
  }
  return { edgeId: edge.id, changes };
}
async function applyPromotion(preview, repository) {
  const results = [];
  for (const change of preview.changes) results.push(await repository.save(change.path, change.expectedMtime, change.content));
  return results;
}

// src/reload-actions.js
var RELOAD_ACTIONS = [
  { id: "board", title: "\u91CD\u8F7D\u753B\u677F\u6570\u636E", icon: "refresh-cw" },
  { id: "plugin", title: "\u91CD\u8F7D\u63D2\u4EF6\u4EE3\u7801", icon: "rotate-cw" }
];
function findReloadAction(id) {
  var _a;
  return (_a = RELOAD_ACTIONS.find((action) => action.id === id)) != null ? _a : null;
}
function resolveReloadAction(id, { editorDirty = false } = {}) {
  const action = findReloadAction(id);
  if (!action) return { ok: false, reason: `\u672A\u77E5\u7684\u91CD\u8F7D\u52A8\u4F5C\uFF1A${id}` };
  if (action.id === "plugin" && editorDirty) {
    return { ok: false, reason: "\u6D6E\u52A8\u7F16\u8F91\u5668\u8FD8\u6709\u672A\u4FDD\u5B58\u5185\u5BB9\uFF0C\u5148\u4FDD\u5B58\u6216\u5173\u95ED\u5B83\u518D\u91CD\u8F7D\u63D2\u4EF6" };
  }
  return { ok: true, action };
}
async function runReloadAction(id, context, handlers) {
  var _a;
  const resolved = resolveReloadAction(id, context);
  if (!resolved.ok) return resolved;
  try {
    await handlers[resolved.action.id]();
    return resolved;
  } catch (error) {
    return { ok: false, reason: (_a = error == null ? void 0 : error.message) != null ? _a : String(error) };
  }
}

// src/selection-geometry.js
function rectFromPoints(a, b) {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y)
  };
}
function nodeWorldRect(node) {
  return {
    left: node.x,
    top: node.y,
    right: node.x + node.width,
    bottom: node.y + renderedNodeHeight(node)
  };
}
function rectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
function marqueeSelection(nodes, rect, { base } = {}) {
  const selection = new Set(base != null ? base : []);
  const cards = (nodes != null ? nodes : []).filter((node) => isCardNode(node) && rectsIntersect(nodeWorldRect(node), rect));
  const hitIds = new Set(cards.map((node) => node.id));
  for (const id of hitIds) selection.add(id);
  for (const group of (nodes != null ? nodes : []).filter(isGroupNode)) {
    if (!Array.isArray(group.members) || !group.members.length) continue;
    if (group.members.every((id) => hitIds.has(id))) selection.add(group.id);
  }
  return selection;
}
function selectAllIds(nodes) {
  const selection = /* @__PURE__ */ new Set();
  for (const node of nodes != null ? nodes : []) {
    if (isCardNode(node) || isGroupNode(node)) selection.add(node.id);
  }
  return selection;
}
function applyDrag(items, dx, dy) {
  for (const item of items != null ? items : []) {
    item.node.x = item.x + dx;
    item.node.y = item.y + dy;
  }
  return items != null ? items : [];
}
function dragTargets(nodes, selection) {
  var _a;
  const ids = /* @__PURE__ */ new Set();
  const list = nodes != null ? nodes : [];
  const selected = selection instanceof Set ? selection : new Set(selection != null ? selection : []);
  const byId = new Map(list.map((node) => [node.id, node]));
  for (const id of selected) {
    const node = byId.get(id);
    if (!node) continue;
    if (isGroupNode(node)) {
      ids.add(node.id);
      for (const member of (_a = node.members) != null ? _a : []) if (byId.has(member)) ids.add(member);
    } else if (isCardNode(node)) {
      ids.add(node.id);
    }
  }
  return [...ids].map((id) => byId.get(id));
}
function layoutUnits(nodes, selection) {
  var _a, _b;
  const list = nodes != null ? nodes : [];
  const selected = selection instanceof Set ? selection : new Set(selection != null ? selection : []);
  const byId = new Map(list.map((node) => [node.id, node]));
  const grouped = /* @__PURE__ */ new Set();
  for (const group of list.filter(isGroupNode)) {
    for (const member of (_a = group.members) != null ? _a : []) grouped.add(member);
  }
  const units = [];
  const covered = /* @__PURE__ */ new Set();
  for (const id of selected) {
    const node = byId.get(id);
    if (!node || !isGroupNode(node)) continue;
    const members = ((_b = node.members) != null ? _b : []).map((memberId) => byId.get(memberId)).filter(Boolean);
    units.push({ id: node.id, kind: "group", nodes: [node, ...members] });
    covered.add(node.id);
    for (const member of members) covered.add(member.id);
  }
  for (const id of selected) {
    const node = byId.get(id);
    if (!node || !isCardNode(node) || covered.has(node.id)) continue;
    if (grouped.has(node.id)) continue;
    units.push({ id: node.id, kind: "card", nodes: [node] });
  }
  return units;
}

// src/readflow-import-modal.js
var import_obsidian5 = require("obsidian");

// src/readflow-index.js
function stringField(value) {
  return value === void 0 || value === null ? "" : String(value).trim();
}
function toReadFlowCandidate(file, content, frontmatter = {}) {
  const card = toReadFlowCard(file, content, frontmatter);
  if (!card) return null;
  return {
    path: file.path,
    title: card.title,
    excerpt: card.excerpt,
    comment: card.comment,
    book: card.book,
    chapter: card.chapter,
    status: stringField(frontmatter.status),
    created: stringField(frontmatter.created)
  };
}
function filterReadFlowCandidates(candidates, { query = "", book = "", chapter = "", status = "" } = {}) {
  const needle = String(query).trim().toLowerCase();
  return (candidates != null ? candidates : []).filter((candidate) => {
    if (book && candidate.book !== book) return false;
    if (chapter && candidate.chapter !== chapter) return false;
    if (status && candidate.status !== status) return false;
    if (!needle) return true;
    return candidate.excerpt.toLowerCase().includes(needle) || candidate.comment.toLowerCase().includes(needle);
  });
}

// src/readflow-import-modal.js
var EMPTY_GUIDE = "\u6CA1\u6709\u627E\u5230 ReadFlow \u6458\u5F55\u3002\u8BF7\u5148\u5728 ReadFlow \u8BBE\u7F6E\u4E2D\u542F\u7528\u300C\u72EC\u7ACB\u6458\u5F55\u6587\u4EF6\u300D\u5E76\u91CD\u65B0\u540C\u6B65\uFF0C\u7136\u540E\u518D\u8BD5\u3002";
var FILTERS = [
  { key: "book", label: "\u4E66\u7C4D", all: "\u5168\u90E8\u4E66\u7C4D" },
  { key: "chapter", label: "\u7AE0\u8282", all: "\u5168\u90E8\u7AE0\u8282" },
  { key: "status", label: "\u72B6\u6001", all: "\u5168\u90E8\u72B6\u6001" }
];
var ReadFlowImportModal = class extends import_obsidian5.Modal {
  constructor(app, options, resolve) {
    var _a, _b, _c;
    super(app);
    this.candidates = (_a = options.candidates) != null ? _a : [];
    this.existingPaths = new Set((_b = options.existingPaths) != null ? _b : []);
    this.skipped = (_c = options.skipped) != null ? _c : [];
    this.resolve = resolve;
    this.settled = false;
    this.selected = /* @__PURE__ */ new Set();
    this.filters = { query: "", book: "", chapter: "", status: "" };
    this.listEl = null;
    this.countEl = null;
    this.submitButton = null;
  }
  onOpen() {
    this.titleEl.setText("\u5BFC\u5165 ReadFlow");
    if (!this.candidates.length) {
      this.contentEl.createEl("p", { text: EMPTY_GUIDE });
      this.renderSkipped();
      this.renderActions();
      return;
    }
    this.renderFilters();
    this.listEl = this.contentEl.createDiv({ cls: "kc-import-list" });
    this.renderList();
    this.renderSkipped();
    this.renderActions();
  }
  renderFilters() {
    const bar = this.contentEl.createDiv({ cls: "kc-import-filters" });
    const search = bar.createEl("input", { cls: "kc-import-search", attr: { type: "search" } });
    search.placeholder = "\u641C\u7D22\u6458\u5F55\u6216\u60F3\u6CD5";
    search.setAttribute("aria-label", "\u641C\u7D22\u6458\u5F55\u6216\u60F3\u6CD5");
    search.addEventListener("input", () => {
      this.filters.query = search.value;
      this.renderList();
    });
    for (const filter of FILTERS) this.addFilterSelect(bar, filter);
    this.countEl = bar.createEl("span", { cls: "kc-import-count" });
    const selectAll = bar.createEl("button", { text: "\u5168\u9009\u5F53\u524D\u7ED3\u679C" });
    selectAll.type = "button";
    selectAll.addEventListener("click", () => {
      for (const candidate of this.visible()) {
        if (!this.existingPaths.has(candidate.path)) this.selected.add(candidate.path);
      }
      this.renderList();
    });
  }
  addFilterSelect(bar, { key, label, all }) {
    const values = [...new Set(this.candidates.map((candidate) => candidate[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
    const select = bar.createEl("select", { cls: "kc-import-filter" });
    select.setAttribute("aria-label", label);
    const anyOption = select.createEl("option", { text: all });
    anyOption.value = "";
    for (const value of values) {
      const option = select.createEl("option", { text: value });
      option.value = value;
    }
    select.addEventListener("change", () => {
      this.filters[key] = select.value;
      this.renderList();
    });
  }
  visible() {
    return filterReadFlowCandidates(this.candidates, this.filters);
  }
  renderList() {
    if (!this.listEl) return;
    this.listEl.replaceChildren();
    const items = this.visible();
    if (!items.length) this.listEl.createEl("p", { cls: "kc-muted", text: "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u6458\u5F55\u3002" });
    for (const candidate of items) {
      const already = this.existingPaths.has(candidate.path);
      const row = this.listEl.createEl("label", { cls: already ? "kc-import-row is-added" : "kc-import-row" });
      const checkbox = row.createEl("input", { attr: { type: "checkbox" } });
      checkbox.disabled = already;
      checkbox.checked = !already && this.selected.has(candidate.path);
      if (!already) {
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.selected.add(candidate.path);
          else this.selected.delete(candidate.path);
          this.updateCount();
        });
      }
      const text = row.createEl("span", "kc-import-text");
      text.createEl("strong", { text: candidate.title });
      text.createEl("small", { text: [candidate.book, candidate.chapter].filter(Boolean).join(" \xB7 ") || candidate.path });
      if (already) row.createEl("span", "kc-import-state", "\u5DF2\u6DFB\u52A0");
    }
    this.updateCount();
  }
  renderSkipped() {
    if (!this.skipped.length) return;
    this.contentEl.createEl("p", {
      cls: "kc-muted",
      text: `\u53E6\u6709 ${this.skipped.length} \u4E2A\u6587\u4EF6\u65E0\u6CD5\u89E3\u6790\uFF0C\u5DF2\u8DF3\u8FC7\uFF1A${this.skipped.map((item) => item.path).join("\u3001")}`
    });
  }
  updateCount() {
    if (this.countEl) this.countEl.setText(`\u5DF2\u9009 ${this.selected.size} / \u5171 ${this.visible().length} \u4E2A\u7ED3\u679C`);
    if (this.submitButton) this.submitButton.disabled = this.selected.size === 0;
  }
  renderActions() {
    const actions = this.contentEl.createDiv({ cls: "kc-modal-actions" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const submit = actions.createEl("button", { cls: "mod-cta", text: "\u52A0\u5165\u5F53\u524D\u753B\u5E03" });
    submit.type = "button";
    submit.disabled = this.selected.size === 0;
    submit.addEventListener("click", () => {
      if (this.settled) return;
      this.settled = true;
      submit.disabled = true;
      this.resolve({ paths: [...this.selected] });
      this.close();
    });
    this.submitButton = submit;
  }
  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolve(null);
    }
  }
};
function requestReadFlowImport(app, options) {
  return new Promise((resolve) => new ReadFlowImportModal(app, options, resolve).open());
}

// src/knowledge-canvas-view.js
var VIEW_TYPE_KNOWLEDGE_CANVAS = "knowledge-canvas-view";
var nextBoardSelectId = 0;
var LAYOUT_MENU_ITEMS = Object.freeze([
  ["grid", "Grid \u7F51\u683C", "layout-grid"],
  ["row", "\u6C34\u5E73\u6392\u5217", "layout-list"],
  ["column", "\u5782\u76F4\u6392\u5217", "columns-3"]
]);
var ALIGN_MENU_ITEMS = Object.freeze([
  ["align-left", "\u5DE6\u5BF9\u9F50"],
  ["align-center", "\u6C34\u5E73\u5C45\u4E2D"],
  ["align-right", "\u53F3\u5BF9\u9F50"],
  ["align-top", "\u9876\u90E8\u5BF9\u9F50"],
  ["align-middle", "\u5782\u76F4\u5C45\u4E2D"],
  ["align-bottom", "\u5E95\u90E8\u5BF9\u9F50"]
]);
var DISTRIBUTE_MENU_ITEMS = Object.freeze([
  ["distribute-h", "\u6C34\u5E73\u7B49\u8DDD\u5206\u5E03"],
  ["distribute-v", "\u5782\u76F4\u7B49\u8DDD\u5206\u5E03"]
]);
function dom(tag, className, text) {
  const element2 = document.createElement(tag);
  if (className) element2.className = className;
  if (text !== void 0) element2.textContent = text;
  return element2;
}
var PromotionModal = class extends import_obsidian6.Modal {
  constructor(app, preview, confirm) {
    super(app);
    this.preview = preview;
    this.confirm = confirm;
  }
  onOpen() {
    this.titleEl.setText("\u540C\u6B65\u4E3A Markdown \u53CC\u94FE");
    this.contentEl.createEl("p", { text: "\u786E\u8BA4\u540E\u624D\u4F1A\u5199\u5165\u4EE5\u4E0B Markdown \u6587\u4EF6\uFF1A" });
    if (!this.preview.changes.length) this.contentEl.createEl("p", { text: "\u5173\u7CFB\u5DF2\u5B58\u5728\uFF0C\u65E0\u9700\u91CD\u590D\u5199\u5165\u3002" });
    for (const change of this.preview.changes) {
      this.contentEl.createEl("strong", { text: change.path });
      this.contentEl.createEl("pre", { text: change.append });
    }
    const actions = this.contentEl.createDiv({ cls: "kc-modal-actions" });
    const cancel = actions.createEl("button", { text: "\u53D6\u6D88" });
    cancel.addEventListener("click", () => this.close());
    const submit = actions.createEl("button", { cls: "mod-cta", text: "\u786E\u8BA4\u5199\u5165" });
    submit.disabled = this.preview.changes.length === 0;
    submit.addEventListener("click", async () => {
      submit.disabled = true;
      try {
        await this.confirm();
        this.close();
        new import_obsidian6.Notice("\u5173\u7CFB\u5DF2\u540C\u6B65");
      } catch (error) {
        submit.disabled = false;
        new import_obsidian6.Notice(`\u5199\u5165\u5931\u8D25\uFF1A${error.message}`);
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var DraftRecoveryModal = class extends import_obsidian6.Modal {
  constructor(app, title, body, retry) {
    super(app);
    this.draftTitle = title;
    this.body = body;
    this.retry = retry;
  }
  onOpen() {
    this.titleEl.setText("\u4FBF\u5229\u8D34\u5C1A\u672A\u521B\u5EFA");
    this.contentEl.createEl("p", { text: "\u521B\u5EFA\u5931\u8D25\uFF0C\u8349\u7A3F\u4ECD\u4FDD\u7559\u3002\u53EF\u91CD\u8BD5\u6216\u5148\u590D\u5236\u5185\u5BB9\u3002" });
    const draft = this.contentEl.createEl("textarea", { cls: "kc-draft-recovery" });
    draft.value = `${this.draftTitle}

${this.body}`;
    draft.readOnly = true;
    const actions = this.contentEl.createDiv({ cls: "kc-modal-actions" });
    const copy = actions.createEl("button", { text: "\u590D\u5236\u5185\u5BB9" });
    copy.addEventListener("click", () => navigator.clipboard.writeText(draft.value));
    const retry = actions.createEl("button", { cls: "mod-cta", text: "\u91CD\u8BD5\u521B\u5EFA" });
    retry.addEventListener("click", async () => {
      retry.disabled = true;
      try {
        await this.retry();
        this.close();
      } catch (error) {
        retry.disabled = false;
        new import_obsidian6.Notice(`\u4ECD\u65E0\u6CD5\u521B\u5EFA\uFF1A${error.message}`);
      }
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var MarkdownFilePicker = class extends import_obsidian6.FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("\u9009\u62E9\u8981\u52A0\u5165\u753B\u677F\u7684 Markdown \u6587\u4EF6");
  }
  getItems() {
    return this.app.vault.getMarkdownFiles().slice().sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }
  getItemText(file) {
    return file.path;
  }
  onChooseItem(file) {
    this.onChoose(file);
  }
};
var FolderPicker = class extends import_obsidian6.FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("\u9009\u62E9\u8981\u9012\u5F52\u5BFC\u5165\u7684\u6587\u4EF6\u5939");
  }
  getItems() {
    return this.app.vault.getAllLoadedFiles().filter((entry) => Array.isArray(entry.children)).sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
  }
  getItemText(folder) {
    return folder.path;
  }
  onChooseItem(folder) {
    this.onChoose(folder);
  }
};
var KnowledgeCanvasView = class extends import_obsidian6.ItemView {
  constructor(leaf, plugin, options = {}) {
    var _a;
    super(leaf);
    this.plugin = plugin;
    this.embedded = Boolean(options.embedded);
    this.compact = Boolean(options.compact);
    this.boardPath = (_a = options.boardPath) != null ? _a : plugin.boardPath;
    if (options.app) this.app = options.app;
    if (options.contentEl) this.contentEl = options.contentEl;
    this._domCleanups = [];
    this.board = { nodes: [], edges: [] };
    this.viewport = { x: 80, y: 64, scale: 1 };
    this.mode = "canvas";
    this.selected = /* @__PURE__ */ new Set();
    this.search = "";
    this.gesture = null;
    this.editor = null;
    this.loadError = null;
    this.writerOwned = false;
    this.switching = false;
    this.boardSelect = null;
    this.boardCreateButton = null;
    this.boardMenuButton = null;
    this.readflowButton = null;
    this.toolEntry = createToolEntryState();
    this.toolEntryEl = null;
    this.colorPicker = null;
    this.spaceHeld = false;
    this.marqueeEl = null;
    this.snapEnabled = true;
    this.guideEls = [];
    this.importing = false;
    this.importNotice = null;
    this.boardMutations = createMutationQueue();
    this.lifecycles = createLifecycleQueue();
    this.gestureIdle = null;
    this.gestureIdleResolve = null;
  }
  getViewType() {
    return VIEW_TYPE_KNOWLEDGE_CANVAS;
  }
  getDisplayText() {
    return "\u77E5\u8BC6\u753B\u677F";
  }
  getIcon() {
    return "layout-dashboard";
  }
  async onOpen() {
    await this.attach();
  }
  /** Shared bootstrap for the full view and the embedded surface. */
  async attach() {
    this.colorPicker = new CardColorPicker(this.contentEl);
    await this.mountBoard();
    this.render();
  }
  async mountBoard() {
    if (!this.embedded) await this.plugin.ensureBoard();
    try {
      this.board = await this.plugin.boardStore.load(this.boardPath);
      this.loadError = null;
      this.acquireBoardWriter();
    } catch (error) {
      this.loadError = error;
      this.writerOwned = false;
      new import_obsidian6.Notice(`\u753B\u677F\u52A0\u8F7D\u5931\u8D25\uFF1A${error.message}`);
    }
    this.attachDocumentListeners();
  }
  /**
   * Claims the single-writer token for the current board. A second surface showing the same
   * `.canvas` (for example the full view opened by `openFullView`) is refused and becomes
   * read-only, so two stale snapshots can never interleave full-file saves.
   */
  acquireBoardWriter() {
    this.writerOwned = this.plugin.boardStore.acquireWriter(this.boardPath, this);
    return this.writerOwned;
  }
  /** Gives up the write token; the surface stays mounted but becomes read-only. */
  releaseBoardWriter(path = this.boardPath) {
    this.plugin.boardStore.releaseWriter(path, this);
    if (path === this.boardPath) this.writerOwned = false;
  }
  /** Registered once per surface; the embedded surface owns its own cleanup list. */
  onDomEvent(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    const cleanup = () => target.removeEventListener(type, handler, options);
    if (this.embedded) this._domCleanups.push(cleanup);
    else this.register(cleanup);
  }
  attachDocumentListeners() {
    this.onDomEvent(document, "pointermove", (event) => this.onPointerMove(event));
    this.onDomEvent(document, "pointerup", (event) => this.onPointerUp(event));
    this.onDomEvent(document, "pointercancel", () => this.onPointerCancel());
    this.onDomEvent(document, "pointerdown", (event) => this.onDocumentPointerDown(event), true);
    this.onDomEvent(document, "keydown", (event) => {
      if (event.code === "Space" && this.contentEl.contains(event.target) && !this.isTextEntryTarget(event.target)) {
        this.spaceHeld = true;
        if (!this.editor) event.preventDefault();
      }
      if (event.key === "Escape" && this.contentEl.contains(event.target) && this.editor) this.editor.handleEscape();
    });
    this.onDomEvent(document, "keyup", (event) => {
      if (event.code === "Space") this.spaceHeld = false;
    });
  }
  /** True for a focused control that must own its own keystrokes (editor, modal, inputs). */
  isTextEntryTarget(target) {
    const element2 = target instanceof HTMLElement ? target : null;
    if (!element2) return false;
    if (element2.closest('input, textarea, select, [contenteditable="true"]')) return true;
    return Boolean(element2.closest(".kc-editor"));
  }
  async onClose() {
    await this.prepareShutdown();
  }
  async prepareShutdown() {
    return this.lifecycles.shutdown(() => this.performShutdown());
  }
  async performShutdown() {
    var _a;
    (_a = this.colorPicker) == null ? void 0 : _a.close();
    if (this.editor && !await this.editor.close()) throw new Error("\u6D6E\u52A8\u7F16\u8F91\u5668\u4ECD\u6709\u672A\u4FDD\u5B58\u5185\u5BB9");
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
      await this.plugin.repository.flush();
    } catch (error) {
      this.boardMutations.resume(pause);
      throw error;
    }
    this.releaseBoardWriter();
  }
  /**
   * Adds a Markdown file to the board. A sticky note is a file card too, but it always starts
   * with one of the five presets; an ordinary imported file stays neutral.
   */
  async addFile(file, point2 = { x: 160, y: 120 }, { sticky = false, color } = {}) {
    var _a;
    if (!this.isWritable()) return;
    if (!((_a = file == null ? void 0 : file.path) == null ? void 0 : _a.toLowerCase().endsWith(".md"))) return;
    let existingId = null;
    await this.mutateBoard((next) => {
      const existing = next.nodes.find((node) => node.file === file.path);
      if (existing) {
        existingId = existing.id;
        return false;
      }
      next.nodes.push(sticky ? createStickyNode(file.path, point2) : createFileNode(file.path, { ...point2, color }));
      return true;
    }, "\u52A0\u5165\u753B\u677F\u5931\u8D25");
    if (existingId) {
      this.selected = /* @__PURE__ */ new Set([existingId]);
      this.render();
    }
  }
  async handleRename(file, oldPath) {
    if (!this.isWritable()) return;
    await this.mutateBoard((next) => updateFilePath(next, oldPath, file.path) ? true : false, "\u66F4\u65B0\u6587\u4EF6\u8DEF\u5F84\u5931\u8D25");
  }
  /** Opens the vault Markdown picker; a cancelled picker changes nothing. */
  importFile() {
    if (!this.isWritable() || this.importing) return;
    new MarkdownFilePicker(this.app, (file) => {
      void this.importMarkdownFiles([file.path]);
    }).open();
  }
  /** Opens the folder picker; the recursive scan happens after the choice. */
  importFolder() {
    if (!this.isWritable() || this.importing) return;
    new FolderPicker(this.app, (folder) => {
      void this.importFolderAt(folder.path);
    }).open();
  }
  /** Disables the tool-entry actions while a batch import is running. */
  setImporting(active) {
    var _a, _b;
    this.importing = active;
    for (const button of (_b = (_a = this.toolEntryEl) == null ? void 0 : _a.querySelectorAll(".kc-tools button")) != null ? _b : []) button.disabled = active;
  }
  /**
   * Recursive folder import. The scan is read-only and yields between batches, so a large
   * Vault stays responsive and the progress notice can actually be painted. If nothing is
   * found, or the view is read-only, the board is untouched.
   */
  async importFolderAt(folderPath) {
    if (!this.isWritable() || this.importing) return false;
    this.setImporting(true);
    let notice = null;
    let paths;
    try {
      const matches = await scanFolderFiles(this.app.vault.getFiles(), folderPath, {
        onChunk: () => {
          if (!notice) notice = new import_obsidian6.Notice("\u6B63\u5728\u626B\u63CF\u6587\u4EF6\u5939\u2026", 0);
        }
      });
      paths = matches.map((file) => file.path);
    } catch (error) {
      new import_obsidian6.Notice(`\u626B\u63CF\u5931\u8D25\uFF1A${error.message}`);
      return false;
    } finally {
      notice == null ? void 0 : notice.hide();
      this.setImporting(false);
    }
    if (!paths.length) {
      new import_obsidian6.Notice("\u8BE5\u6587\u4EF6\u5939\u6CA1\u6709 Markdown \u6587\u4EF6");
      return false;
    }
    return this.importMarkdownFiles(paths);
  }
  /**
   * One batch, one save, one render. Files already on the board and repeats inside the
   * batch are skipped; non-Markdown paths never become nodes. A failed save leaves the
   * board exactly as it was.
   */
  async importMarkdownFiles(paths) {
    var _a;
    if (!this.isWritable() || this.importing) return false;
    this.setImporting(true);
    const busy = setTimeout(() => {
      this.importNotice = new import_obsidian6.Notice("\u6B63\u5728\u5BFC\u5165\u6587\u4EF6\u2026", 0);
    }, 300);
    try {
      const requested = (paths != null ? paths : []).map((path) => String(path != null ? path : "").trim()).filter((path) => /\.md$/i.test(path));
      if (!requested.length) {
        new import_obsidian6.Notice("\u6CA1\u6709\u65B0\u589E\u5361\u7247\uFF1A\u6240\u9009\u5185\u5BB9\u4E0D\u662F Markdown\u3002");
        return false;
      }
      let added = 0;
      let skippedExisting = 0;
      let failed = 0;
      const done = await this.mutateBoard((next) => {
        const live = requested.filter((path) => {
          var _a2;
          return ((_a2 = this.app.vault.getAbstractFileByPath(path)) == null ? void 0 : _a2.extension) === "md";
        });
        failed = requested.length - live.length;
        const plan = planImport(live, next.nodes.filter(isFileNode).map((node) => node.file));
        skippedExisting = plan.skippedExisting.length;
        if (!plan.added.length) return false;
        for (const { path, point: point2 } of layoutImportedCards(plan.added, next.nodes)) {
          next.nodes.push(createFileNode(path, point2));
        }
        added = plan.added.length;
        return true;
      }, "\u5BFC\u5165\u5931\u8D25");
      const skipped = requested.length - added;
      if (!done) {
        new import_obsidian6.Notice(`\u6CA1\u6709\u65B0\u589E\u5361\u7247\uFF1A\u8DF3\u8FC7 ${skipped} \u4E2A\u3002`);
        return false;
      }
      new import_obsidian6.Notice(`\u5DF2\u52A0\u5165 ${added} \u5F20\u5361\u7247\uFF1B\u8DF3\u8FC7 ${skipped} \u4E2A\uFF08\u5DF2\u5B58\u5728 ${skippedExisting}\uFF0C\u5931\u8D25 ${failed}\uFF09\u3002`);
      return true;
    } finally {
      clearTimeout(busy);
      (_a = this.importNotice) == null ? void 0 : _a.hide();
      this.importNotice = null;
      this.setImporting(false);
    }
  }
  render() {
    var _a;
    const host = this.contentEl;
    renderWorkspacePreservingEditor(host, (_a = this.editor) == null ? void 0 : _a.root, () => {
      host.addClass("knowledge-canvas-view");
      if (this.compact) host.addClass("kc-embedded");
      const shell = dom("div", "kc-shell");
      host.append(shell);
      if (!this.compact) this.renderTopbar(shell);
      if (this.loadError) this.renderLoadError(shell);
      else if (this.mode === "outline" && !this.compact) this.renderOutline(shell);
      else this.renderCanvas(shell);
      if (!this.loadError && !this.writerOwned) this.renderReadonlyBanner(shell);
    });
  }
  renderLoadError(shell) {
    const state = dom("main", "kc-load-error");
    state.append(dom("h2", "", "\u753B\u677F\u6682\u65F6\u53EA\u8BFB"));
    state.append(dom("p", "", `\u65E0\u6CD5\u8BFB\u53D6\u539F\u753B\u677F\uFF1A${this.loadError.message}`));
    state.append(dom("p", "kc-muted", "\u539F\u6587\u4EF6\u4E0D\u4F1A\u88AB\u8986\u76D6\u3002\u4FEE\u590D\u6587\u4EF6\u6216\u8BBF\u95EE\u6743\u9650\u540E\u518D\u91CD\u65B0\u8F7D\u5165\u3002"));
    const retry = dom("button", "mod-cta", "\u91CD\u65B0\u8F7D\u5165");
    retry.type = "button";
    retry.addEventListener("click", () => this.reloadBoard());
    state.append(retry);
    shell.append(state);
  }
  /** Shown when another surface owns the write token, so this one cannot overwrite it. */
  renderReadonlyBanner(shell) {
    const bar = dom("div", "kc-readonly-banner", "\u8BE5\u753B\u5E03\u5DF2\u5728\u5168\u5C4F\u89C6\u56FE\u6253\u5F00\uFF0C\u5F53\u524D\u4E3A\u53EA\u8BFB\u3002");
    const open = dom("button", "", "\u6253\u5F00\u5168\u5C4F");
    open.type = "button";
    open.addEventListener("click", () => this.openFullView());
    bar.append(open);
    shell.append(bar);
  }
  async reloadBoard({ notify = false } = {}) {
    return this.lifecycles(() => this.performReloadBoard({ notify }));
  }
  async performReloadBoard({ notify = false } = {}) {
    if (this.editor && !await this.editor.close()) {
      new import_obsidian6.Notice("\u6D6E\u52A8\u7F16\u8F91\u5668\u4ECD\u6709\u672A\u4FDD\u5B58\u5185\u5BB9\uFF0C\u5DF2\u53D6\u6D88\u91CD\u8F7D");
      return;
    }
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
    } catch (error) {
      this.boardMutations.resume(pause);
      new import_obsidian6.Notice(`\u753B\u677F\u8FD8\u6709\u6539\u52A8\u6CA1\u80FD\u5199\u5165\uFF0C\u5DF2\u53D6\u6D88\u91CD\u8F7D\uFF1A${error.message}`);
      return;
    }
    try {
      const board = await this.plugin.boardStore.load(this.boardPath);
      this.board = board;
      this.loadError = null;
      this.render();
      if (notify) new import_obsidian6.Notice("\u753B\u677F\u5DF2\u4ECE\u78C1\u76D8\u91CD\u8F7D");
    } catch (error) {
      this.loadError = error;
      new import_obsidian6.Notice(`\u4ECD\u65E0\u6CD5\u8F7D\u5165\u753B\u677F\uFF1A${error.message}`);
      this.render();
    } finally {
      this.boardMutations.resume(pause);
    }
  }
  isWritable() {
    if (canMutateBoard({ writerOwned: this.writerOwned, loadError: this.loadError })) return true;
    if (this.loadError) {
      new import_obsidian6.Notice("\u753B\u677F\u8BFB\u53D6\u5931\u8D25\uFF0C\u4FEE\u590D\u5E76\u91CD\u65B0\u8F7D\u5165\u524D\u4E0D\u4F1A\u5199\u5165\u539F\u6587\u4EF6\u3002");
    } else {
      new import_obsidian6.Notice("\u8BE5\u753B\u5E03\u5DF2\u5728\u5176\u4ED6\u89C6\u56FE\u6253\u5F00\uFF0C\u5F53\u524D\u4E3A\u53EA\u8BFB\u3002");
    }
    return false;
  }
  renderTopbar(shell) {
    const top = dom("header", "kc-topbar");
    top.append(dom("strong", "kc-board-title", "\u77E5\u8BC6\u753B\u677F"));
    const modes = dom("div", "kc-segmented");
    for (const [mode, label] of [["canvas", "\u81EA\u7531\u753B\u677F"], ["outline", "\u7ED3\u6784\u5927\u7EB2"]]) {
      const button = dom("button", this.mode === mode ? "is-active" : "", label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(this.mode === mode));
      button.addEventListener("click", () => {
        this.mode = mode;
        this.render();
      });
      modes.append(button);
    }
    const search = dom("input", "kc-search");
    search.type = "search";
    search.placeholder = "\u641C\u7D22\u5361\u7247";
    search.value = this.search;
    search.setAttribute("aria-label", "\u641C\u7D22\u5361\u7247");
    search.addEventListener("input", () => {
      this.search = search.value.toLowerCase();
      if (this.mode === "canvas") this.applyCanvasSearch();
      else {
        const position = search.selectionStart;
        this.render();
        const replacement = this.contentEl.querySelector(".kc-search");
        replacement == null ? void 0 : replacement.focus();
        replacement == null ? void 0 : replacement.setSelectionRange(position, position);
      }
    });
    const reload = dom("button", "kc-reload", "\u91CD\u8F7D");
    reload.type = "button";
    reload.setAttribute("aria-label", "\u91CD\u8F7D\u753B\u677F\u6216\u63D2\u4EF6");
    reload.setAttribute("aria-haspopup", "menu");
    reload.addEventListener("click", (event) => this.openReloadMenu(event));
    top.append(this.buildBoardActions(), modes, search, reload);
    shell.append(top);
  }
  /** Board cluster in the fixed order: switcher, new board, ReadFlow import. */
  buildBoardActions() {
    const group = dom("div", "kc-board-actions");
    const builders = {
      boardSelect: () => this.buildBoardSelect(),
      newBoard: () => this.buildNewBoardButton(),
      importReadFlow: () => this.buildImportReadFlowButton(),
      boardMenu: () => this.buildBoardMenuButton()
    };
    for (const action of TOPBAR_BOARD_ACTIONS) {
      if (action === "importReadFlow" && !this.plugin.isReadFlowIntegrationEnabled()) continue;
      group.append(builders[action]());
    }
    return group;
  }
  buildBoardSelect() {
    const switcher = dom("div", "kc-board-switcher");
    const id = `kc-board-select-${++nextBoardSelectId}`;
    const label = dom("label", "kc-board-switcher-label", "\u753B\u5E03");
    label.htmlFor = id;
    const select = dom("select", "kc-board-select");
    select.id = id;
    select.setAttribute("aria-label", "\u753B\u5E03");
    select.addEventListener("change", () => {
      this.switchBoard(select.value);
    });
    switcher.append(label, select);
    this.boardSelect = select;
    this.refreshBoardList();
    this.setBoardControlsDisabled(this.switching);
    return switcher;
  }
  buildNewBoardButton() {
    const create = dom("button", "kc-board-create", "\uFF0B");
    create.type = "button";
    create.setAttribute("aria-label", "\u65B0\u5EFA\u753B\u5E03");
    create.addEventListener("click", () => this.createBoard());
    this.boardCreateButton = create;
    return create;
  }
  /** Secondary top-bar action; it always imports into whichever board is open. */
  buildImportReadFlowButton() {
    const button = dom("button", "kc-import-readflow", "\u5BFC\u5165 ReadFlow");
    button.type = "button";
    button.setAttribute("aria-label", "\u628A ReadFlow \u6458\u5F55\u5BFC\u5165\u5F53\u524D\u753B\u5E03");
    button.addEventListener("click", () => this.importReadFlow());
    this.readflowButton = button;
    return button;
  }
  /**
   * Low-frequency, potentially destructive board actions live behind `···`: renaming and
   * deleting a workspace is never a click away from the actions used while working.
   */
  buildBoardMenuButton() {
    const button = dom("button", "kc-board-menu", "\xB7\xB7\xB7");
    button.type = "button";
    button.setAttribute("aria-label", "\u753B\u5E03\u7BA1\u7406");
    button.setAttribute("aria-haspopup", "menu");
    button.addEventListener("click", (event) => this.openBoardMenu(event));
    this.boardMenuButton = button;
    return button;
  }
  openBoardMenu(event) {
    const manage = canManageBoard(this.boardPath);
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle("\u91CD\u547D\u540D\u753B\u5E03").setIcon("pencil").setDisabled(!manage.allowed).onClick(() => this.renameBoard()));
    menu.addItem((item) => item.setTitle("\u5220\u9664\u753B\u5E03").setIcon("trash-2").setDisabled(!manage.allowed).onClick(() => this.deleteBoard()));
    if (!manage.allowed) {
      menu.addSeparator();
      menu.addItem((item) => item.setTitle(manage.reason).setDisabled(true));
    }
    menu.showAtMouseEvent(event);
  }
  /** Opens the rename dialog. A cancelled dialog changes nothing. */
  async renameBoard() {
    const manage = canManageBoard(this.boardPath);
    if (!manage.allowed) {
      new import_obsidian6.Notice(manage.reason);
      return false;
    }
    const noteFolder = boardNoteFolder(this.board);
    const existingPaths = this.plugin.listCanvasPaths();
    const folderPaths = this.plugin.listFolderPaths();
    const answer = await requestBoardRename(this.app, {
      currentName: boardNameFromPath2(this.boardPath),
      noteFolder,
      validate: (values) => {
        try {
          planBoardRename({
            path: this.boardPath,
            name: values.name,
            existingPaths,
            folderPaths,
            noteFolder,
            renameNoteFolder: values.renameNoteFolder
          });
          return null;
        } catch (error) {
          return error.message;
        }
      }
    });
    if (!answer) return false;
    return this.lifecycles(() => this.performRenameBoard(answer));
  }
  /**
   * Renames inside the lifecycle queue, so a switch, reload or hand-off can never interleave
   * with the path swap. The view keeps its board until the plugin reports the file is really
   * at its new path; a failure leaves both the path and the board untouched.
   */
  async performRenameBoard({ name, renameNoteFolder }) {
    if (!this.isWritable()) return false;
    if (this.editor && !await this.editor.close()) return false;
    const previousPath = this.boardPath;
    let plan;
    try {
      plan = planBoardRename({
        path: previousPath,
        name,
        existingPaths: this.plugin.listCanvasPaths(),
        folderPaths: this.plugin.listFolderPaths(),
        noteFolder: boardNoteFolder(this.board),
        renameNoteFolder
      });
    } catch (error) {
      new import_obsidian6.Notice(`\u65E0\u6CD5\u91CD\u547D\u540D\u753B\u5E03\uFF1A${error.message}`);
      return false;
    }
    const pause = this.boardMutations.pause();
    this.setBoardControlsDisabled(true);
    try {
      await this.drainBoardWrites();
      const result = await this.plugin.renameBoard(plan, { board: this.board, token: this });
      this.releaseBoardWriter(previousPath);
      this.boardPath = result.path;
      this.board = result.board;
      this.loadError = null;
      await this.plugin.setLastBoardPath(result.path);
      this.acquireBoardWriter();
      new import_obsidian6.Notice(`\u753B\u5E03\u5DF2\u91CD\u547D\u540D\u4E3A\u300C${result.name}\u300D`);
      return true;
    } catch (error) {
      new import_obsidian6.Notice(`\u91CD\u547D\u540D\u753B\u5E03\u5931\u8D25\uFF1A${error.message}`);
      return false;
    } finally {
      this.boardMutations.resume(pause);
      this.setBoardControlsDisabled(false);
      this.refreshBoardList();
      this.render();
    }
  }
  /** Opens the delete dialog. The note folder is offered only when proven safe. */
  async deleteBoard() {
    const manage = canManageBoard(this.boardPath);
    if (!manage.allowed) {
      new import_obsidian6.Notice(manage.reason);
      return false;
    }
    const noteFolder = boardNoteFolder(this.board);
    const analysis = noteFolder ? analyzeBoardNoteFolder({
      folderPath: noteFolder,
      files: this.plugin.listFilePaths(),
      folders: this.plugin.listFolderPaths(),
      board: this.board
    }) : { deletable: false, reason: "\u8BE5\u753B\u5E03\u6CA1\u6709\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939" };
    const answer = await requestBoardDelete(this.app, {
      name: boardNameFromPath2(this.boardPath),
      noteFolder,
      folderDeletable: analysis.deletable,
      folderReason: analysis.reason
    });
    if (!answer) return false;
    return this.lifecycles(() => this.performDeleteBoard(answer));
  }
  /**
   * Deletes the canvas (and only the note folder the user opted into), then falls back to the
   * default board. The folder is re-scanned right before deletion: a note added while the
   * confirmation was open cancels the whole operation instead of being destroyed.
   */
  async performDeleteBoard({ deleteNoteFolder }) {
    if (!this.isWritable()) return false;
    if (this.editor && !await this.editor.close()) return false;
    const path = this.boardPath;
    const noteFolder = boardNoteFolder(this.board);
    if (deleteNoteFolder && noteFolder) {
      const recheck = analyzeBoardNoteFolder({
        folderPath: noteFolder,
        files: this.plugin.listFilePaths(),
        folders: this.plugin.listFolderPaths(),
        board: this.board
      });
      if (!recheck.deletable) {
        new import_obsidian6.Notice(`\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\u5185\u5BB9\u5DF2\u53D8\u5316\uFF0C\u5DF2\u53D6\u6D88\u5220\u9664\uFF1A${recheck.reason}`);
        return false;
      }
    }
    const pause = this.boardMutations.pause();
    this.setBoardControlsDisabled(true);
    try {
      await this.drainBoardWrites();
      const outcome = await this.plugin.deleteBoard(path, {
        deleteNoteFolder: deleteNoteFolder && noteFolder ? noteFolder : null
      });
      this.releaseBoardWriter(path);
      await this.plugin.ensureBoard();
      const fallback = this.plugin.resolveBoardPath(DEFAULT_BOARD_PATH);
      const next = await this.plugin.boardStore.load(fallback);
      this.boardPath = fallback;
      this.board = next;
      this.selected.clear();
      this.search = "";
      this.loadError = null;
      await this.plugin.setLastBoardPath(fallback);
      this.acquireBoardWriter();
      new import_obsidian6.Notice(outcome.message);
      return true;
    } catch (error) {
      new import_obsidian6.Notice(`\u5220\u9664\u753B\u5E03\u5931\u8D25\uFF1A${error.message}`);
      return false;
    } finally {
      this.boardMutations.resume(pause);
      this.setBoardControlsDisabled(false);
      this.refreshBoardList();
      this.render();
    }
  }
  refreshBoardList() {
    const select = this.boardSelect;
    if (!select) return;
    select.replaceChildren();
    for (const board of this.plugin.listBoards()) {
      const option = dom("option", "", board.name);
      option.value = board.path;
      select.append(option);
    }
    select.value = this.boardPath;
    if (select.value !== this.boardPath) {
      const current = dom("option", "", this.boardPath);
      current.value = this.boardPath;
      select.append(current);
      select.value = this.boardPath;
    }
  }
  setBoardControlsDisabled(disabled) {
    this.switching = disabled;
    if (this.boardSelect) this.boardSelect.disabled = disabled;
    if (this.boardCreateButton) this.boardCreateButton.disabled = disabled;
    if (this.boardMenuButton) this.boardMenuButton.disabled = disabled;
  }
  /**
   * Switching is all-or-nothing and serialised: two switches must never interleave their
   * close → drain → load → owner/path swap sequence, or a later failure could restore the
   * earlier path while keeping the newer board and writer.
   */
  async switchBoard(path) {
    return this.lifecycles(() => this.performSwitchBoard(path));
  }
  async performSwitchBoard(path) {
    if (!path || path === this.boardPath) return false;
    if (this.editor && !await this.editor.close()) {
      this.refreshBoardList();
      return false;
    }
    const previous = { boardPath: this.boardPath, lastBoardPath: this.plugin.settings.lastBoardPath };
    this.setBoardControlsDisabled(true);
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
      const next = await this.plugin.boardStore.load(path);
      await this.plugin.setLastBoardPath(path);
      this.releaseBoardWriter(this.boardPath);
      this.boardPath = path;
      this.board = next;
      this.selected.clear();
      this.search = "";
      this.loadError = null;
      this.acquireBoardWriter();
      this.render();
      return true;
    } catch (error) {
      this.plugin.boardPath = previous.boardPath;
      this.boardPath = previous.boardPath;
      this.plugin.settings.lastBoardPath = previous.lastBoardPath;
      new import_obsidian6.Notice(`\u5207\u6362\u753B\u5E03\u5931\u8D25\uFF1A${error.message}`);
      this.render();
      return false;
    } finally {
      this.boardMutations.resume(pause);
      this.setBoardControlsDisabled(false);
      this.refreshBoardList();
    }
  }
  async createBoard() {
    const result = await requestInput(this.app, {
      title: "\u65B0\u5EFA\u753B\u5E03",
      submitLabel: "\u521B\u5EFA\u753B\u5E03",
      validate: (values) => {
        try {
          return normalizeBoardNameInput(values) ? null : "\u753B\u5E03\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A";
        } catch (e) {
          return "\u753B\u5E03\u540D\u79F0\u4E0D\u80FD\u5305\u542B . \u6216 .. \u8DEF\u5F84\u7247\u6BB5";
        }
      },
      fields: [
        { key: "name", label: "\u753B\u5E03\u540D\u79F0", placeholder: "\u4F8B\u5982\uFF1A\u8BFB\u4E66\u7B14\u8BB0" },
        { key: "createNoteFolder", label: "\u540C\u65F6\u521B\u5EFA\u6B64\u753B\u5E03\u7684\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939", type: "checkbox", value: false }
      ]
    });
    if (!result) return;
    const normalized = normalizeBoardCreateInput(result);
    if (!normalized) {
      new import_obsidian6.Notice("\u753B\u5E03\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    let path;
    try {
      path = await this.plugin.createBoardFile(normalized.name, { createNoteFolder: normalized.createNoteFolder });
    } catch (error) {
      new import_obsidian6.Notice(`\u65E0\u6CD5\u65B0\u5EFA\u753B\u5E03\uFF1A${error.message}`);
      return;
    }
    await this.switchBoard(path);
  }
  openReloadMenu(event) {
    const menu = new import_obsidian6.Menu();
    for (const action of RELOAD_ACTIONS) {
      menu.addItem((item) => item.setTitle(action.title).setIcon(action.icon).onClick(() => this.runReload(action.id)));
    }
    menu.showAtMouseEvent(event);
  }
  async runReload(id) {
    var _a, _b;
    const context = { editorDirty: Boolean((_b = (_a = this.editor) == null ? void 0 : _a.session) == null ? void 0 : _b.dirty) };
    const result = await runReloadAction(id, context, {
      board: () => this.reloadBoard({ notify: true }),
      plugin: () => this.reloadPlugin()
    });
    if (!result.ok) new import_obsidian6.Notice(`\u91CD\u8F7D\u672A\u6267\u884C\uFF1A${result.reason}`);
  }
  async reloadPlugin() {
    var _a, _b;
    const manager = this.app.plugins;
    if (!(manager == null ? void 0 : manager.disablePlugin) || !(manager == null ? void 0 : manager.enablePlugin)) throw new Error("\u5F53\u524D Obsidian \u7248\u672C\u4E0D\u652F\u6301\u5E94\u7528\u5185\u91CD\u8F7D\u63D2\u4EF6");
    const id = this.plugin.manifest.id;
    await manager.disablePlugin(id);
    await manager.enablePlugin(id);
    await ((_b = (_a = manager.getPlugin(id)) == null ? void 0 : _a.activate) == null ? void 0 : _b.call(_a));
    new import_obsidian6.Notice("\u63D2\u4EF6\u5DF2\u91CD\u8F7D");
  }
  applyCanvasSearch() {
    var _a, _b;
    for (const card of (_b = (_a = this.stage) == null ? void 0 : _a.querySelectorAll(".kc-card")) != null ? _b : []) {
      const node = this.board.nodes.find((candidate) => candidate.id === card.dataset.nodeId);
      card.hidden = Boolean(this.search && !cardSearchText(node).includes(this.search));
    }
  }
  renderCanvas(shell) {
    const stage = dom("main", "kc-stage");
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "\u77E5\u8BC6\u753B\u677F");
    this.stage = stage;
    shell.append(stage);
    this.renderTools(stage);
    if (!this.board.nodes.length) this.renderEmpty(stage);
    const layer = dom("div", "kc-world");
    layer.style.transform = `translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.scale})`;
    stage.append(layer);
    this.renderGroups(layer);
    this.renderEdges(layer);
    for (const node of this.filteredNodes()) this.renderNode(layer, node);
    this.renderZoom(stage);
    stage.addEventListener("dblclick", (event) => {
      if (event.target === stage || event.target === layer) this.createSticky(screenToWorld(this.localPoint(event), this.viewport));
    });
    stage.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    stage.addEventListener("dragover", (event) => event.preventDefault());
    stage.addEventListener("drop", (event) => this.onDrop(event));
    stage.addEventListener("contextmenu", (event) => {
      if (event.target === stage || event.target === layer) this.canvasMenu(event);
    });
    stage.addEventListener("keydown", (event) => this.onKeyDown(event));
    stage.addEventListener("pointerdown", (event) => {
      if (event.target !== stage && event.target !== layer) return;
      if (event.button === 1 || event.button === 0 && this.spaceHeld) {
        event.preventDefault();
        this.gesture = { kind: "pan", start: { x: event.clientX, y: event.clientY }, viewport: { ...this.viewport } };
        return;
      }
      if (event.button !== 0) return;
      const additive = event.metaKey || event.ctrlKey || event.shiftKey;
      if (!additive && this.selected.size) {
        this.selected.clear();
        this.updateSelection();
        this.refreshTools();
      }
      this.gesture = {
        kind: "marquee",
        start: screenToWorld(this.localPoint(event), this.viewport),
        base: new Set(this.selected)
      };
    });
  }
  /**
   * The top-left entry: a single round button when collapsed, a capsule with the board
   * actions once expanded. Rebuilding only the entry keeps expansion cheap and, because
   * the document listener is registered once in onOpen, cannot duplicate it.
   */
  renderTools(stage) {
    const entry = dom("div", "kc-tool-entry");
    this.toolEntryEl = entry;
    stage.append(entry);
    this.renderToolEntry();
  }
  renderToolEntry() {
    const entry = this.toolEntryEl;
    if (!(entry == null ? void 0 : entry.isConnected)) return;
    entry.replaceChildren();
    const view = toolEntryView(this.toolEntry);
    const toggle = dom("button", "kc-tool-entry-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-label", view.ariaLabel);
    toggle.setAttribute("aria-expanded", view.ariaExpanded);
    (0, import_obsidian6.setIcon)(toggle, view.icon);
    toggle.addEventListener("click", () => this.setToolEntryExpanded(!this.toolEntry.expanded));
    entry.append(toggle);
    if (!view.expanded) return;
    const tools = dom("nav", "kc-tools");
    tools.setAttribute("aria-label", "\u753B\u677F\u5DE5\u5177");
    for (const action of view.visibleActions) {
      const button = this.toolActionButton(action);
      if (button) tools.append(button);
    }
    tools.append(...this.groupActions());
    entry.append(tools);
  }
  /** Rebuilds only the entry, so a selection change never re-hydrates every card. */
  refreshTools() {
    this.renderToolEntry();
  }
  setToolEntryExpanded(expanded) {
    this.toolEntry = reduceToolEntry(this.toolEntry, { type: expanded ? "expand" : "collapse" });
    this.renderToolEntry();
  }
  /** The expanded entry's "布局" menu: the whole arrange toolkit without selecting first. */
  openLayoutMenu(event) {
    const empty = !this.selected.size;
    const menu = new import_obsidian6.Menu();
    this.appendLayoutItems(menu, { disabled: empty });
    menu.addSeparator();
    this.appendAlignItems(menu, { disabled: empty });
    menu.addSeparator();
    this.appendDistributeItems(menu, { disabled: empty || this.selected.size < 3 });
    menu.showAtMouseEvent(event);
  }
  /** Builds one expanded tool-entry action. The ReadFlow import lives in the top bar instead. */
  toolActionButton(action) {
    var _a, _b;
    const builders = {
      sticky: () => {
        const sticky = dom("button", "mod-cta", "\uFF0B \u4FBF\u5229\u8D34");
        sticky.type = "button";
        sticky.addEventListener("click", () => this.createSticky(screenToWorld({ x: this.stage.clientWidth / 2, y: this.stage.clientHeight / 2 }, this.viewport)));
        return sticky;
      },
      importFile: () => {
        const button = dom("button", "", "\u5BFC\u5165\u6587\u4EF6");
        button.type = "button";
        button.setAttribute("aria-label", "\u5BFC\u5165 Markdown \u6587\u4EF6");
        button.disabled = this.importing;
        button.addEventListener("click", () => this.importFile());
        return button;
      },
      importFolder: () => {
        const button = dom("button", "", "\u5BFC\u5165\u6587\u4EF6\u5939");
        button.type = "button";
        button.setAttribute("aria-label", "\u9012\u5F52\u5BFC\u5165\u6587\u4EF6\u5939\u4E2D\u7684 Markdown");
        button.disabled = this.importing;
        button.addEventListener("click", () => this.importFolder());
        return button;
      },
      layout: () => {
        const layout = dom("button", "", "\u5E03\u5C40");
        layout.type = "button";
        layout.setAttribute("aria-label", "\u5E03\u5C40\u6240\u9009\u5361\u7247");
        layout.addEventListener("click", (event) => this.openLayoutMenu(event));
        return layout;
      }
    };
    return (_b = (_a = builders[action]) == null ? void 0 : _a.call(builders)) != null ? _b : null;
  }
  /** Registered once on the document, so a repaint can never stack a second listener. */
  onDocumentPointerDown(event) {
    var _a, _b;
    if (((_a = this.colorPicker) == null ? void 0 : _a.isOpen) && !this.colorPicker.contains(event.target)) this.colorPicker.close();
    if (!this.toolEntry.expanded) return;
    if ((_b = this.toolEntryEl) == null ? void 0 : _b.contains(event.target)) return;
    this.setToolEntryExpanded(false);
  }
  /** Group actions only appear when the current selection can actually use them. */
  groupActions() {
    const selection = this.board.nodes.filter((node) => this.selected.has(node.id));
    const selectedGroups = selection.filter(isGroupNode);
    const grouped = new Set(this.board.nodes.filter(isGroupNode).flatMap((group) => group.members));
    const ungroupedFiles = selection.filter((node) => !isGroupNode(node) && !grouped.has(node.id));
    const actions = [];
    if (selectedGroups.length === 0 && ungroupedFiles.length >= 2) {
      const groupButton = dom("button", "", "\u7F16\u7EC4");
      groupButton.type = "button";
      groupButton.setAttribute("aria-label", "\u5C06\u6240\u9009\u5361\u7247\u7F16\u7EC4");
      groupButton.addEventListener("click", () => this.createGroupFromSelection());
      actions.push(groupButton);
    }
    if (selectedGroups.length === 1 && this.selected.size === 1) {
      const ungroupButton = dom("button", "", "\u89E3\u9664\u5206\u7EC4");
      ungroupButton.type = "button";
      ungroupButton.setAttribute("aria-label", "\u89E3\u9664\u5206\u7EC4");
      ungroupButton.addEventListener("click", () => this.ungroupSelection(selectedGroups.map((group) => group.id)));
      const deleteFrame = dom("button", "", "\u5220\u9664\u5206\u7EC4\u6846");
      deleteFrame.type = "button";
      deleteFrame.setAttribute("aria-label", "\u5220\u9664\u5206\u7EC4\u6846");
      deleteFrame.addEventListener("click", () => this.removeGroup(selectedGroups[0].id));
      actions.push(ungroupButton, deleteFrame);
    } else if (selectedGroups.length > 1) {
      const ungroupButton = dom("button", "", `\u89E3\u9664 ${selectedGroups.length} \u4E2A\u5206\u7EC4`);
      ungroupButton.type = "button";
      ungroupButton.setAttribute("aria-label", `\u89E3\u9664\u6240\u9009\u7684 ${selectedGroups.length} \u4E2A\u5206\u7EC4`);
      ungroupButton.addEventListener("click", () => this.ungroupSelection(selectedGroups.map((group) => group.id)));
      actions.push(ungroupButton);
    }
    return actions;
  }
  renderEmpty(stage) {
    const empty = dom("section", "kc-empty");
    empty.append(dom("h2", "", "\u628A Markdown \u53D8\u6210\u53EF\u7EC4\u7EC7\u7684\u5361\u7247"));
    empty.append(dom("p", "", "\u53CC\u51FB\u7A7A\u767D\u5904\u65B0\u5EFA\u4FBF\u5229\u8D34\uFF0C\u6216\u628A\u5DF2\u6709 Markdown \u52A0\u5165\u753B\u677F\u3002"));
    const button = dom("button", "mod-cta", "\u65B0\u5EFA\u4FBF\u5229\u8D34");
    button.type = "button";
    button.addEventListener("click", () => this.createSticky({ x: 160, y: 120 }));
    empty.append(button);
    if (this.plugin.isReadFlowIntegrationEnabled()) {
      const readflow = dom("button", "", "\u5BFC\u5165 ReadFlow");
      readflow.type = "button";
      readflow.setAttribute("aria-label", "\u5BFC\u5165 ReadFlow \u6458\u5F55");
      readflow.addEventListener("click", () => this.importReadFlow());
      empty.append(readflow);
    }
    stage.append(empty);
  }
  renderNode(layer, node) {
    const collapsed = node.collapsed === true;
    const excerpt = isExcerptNode(node);
    const textOnly = !excerpt && isTextNode(node);
    const card = dom("article", "kc-card");
    card.dataset.nodeId = node.id;
    card.dataset.kind = excerpt ? "excerpt" : textOnly ? "text" : "note";
    card.dataset.color = effectiveCardColor(node);
    if (collapsed) card.dataset.collapsed = "true";
    card.tabIndex = 0;
    const label = cardLabel(node);
    const ariaKind = excerpt ? "\u6458\u5F55" : textOnly ? "\u6587\u672C\u5361" : "\u7B14\u8BB0";
    card.setAttribute("aria-label", `${ariaKind} ${label}`);
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.style.width = `${node.width}px`;
    card.style.height = `${renderedNodeHeight(node)}px`;
    if (this.selected.has(node.id)) card.classList.add("is-selected");
    const header = dom("header", "kc-card-header");
    const type = dom("span", "kc-card-type", excerpt ? "\u6458\u5F55" : textOnly ? "\u6587\u672C" : "\u968F\u7B14");
    const title = dom("h3", "", label);
    const collapse = dom("button", "kc-collapse", collapsed ? "\u25B8" : "\u25BE");
    collapse.type = "button";
    collapse.setAttribute("aria-label", collapsed ? `\u5C55\u5F00 ${label}` : `\u6298\u53E0 ${label}`);
    collapse.setAttribute("aria-expanded", String(!collapsed));
    collapse.addEventListener("pointerdown", (event) => event.stopPropagation());
    collapse.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleCollapsed(node.id);
    });
    header.append(type, title, collapse);
    const connector = dom("button", "kc-connector", "");
    connector.type = "button";
    connector.setAttribute("aria-label", "\u62D6\u52A8\u5EFA\u7ACB\u5173\u7CFB");
    connector.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (!this.writerOwned) return;
      this.gesture = { kind: "connect", from: node.id };
    });
    card.append(header, connector);
    let body = null;
    if (!collapsed) {
      body = dom("div", "kc-card-body", excerpt || textOnly ? "" : "\u52A0\u8F7D\u4E2D\u2026");
      if (excerpt) this.fillExcerptBody(node, body);
      else if (textOnly) body.textContent = node.text;
      const resize = dom("button", "kc-resize", "");
      resize.type = "button";
      resize.setAttribute("aria-label", "\u8C03\u6574\u5361\u7247\u5927\u5C0F");
      resize.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        if (!this.writerOwned) return;
        this.gesture = { kind: "resize", start: { x: event.clientX, y: event.clientY }, nodes: snapshotGeometry([node]) };
      });
      card.append(body, resize);
    }
    let openOnClick = false;
    card.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) return;
      if (this.spaceHeld) {
        event.preventDefault();
        openOnClick = false;
        this.gesture = { kind: "pan", start: { x: event.clientX, y: event.clientY }, viewport: { ...this.viewport } };
        return;
      }
      openOnClick = this.selected.has(node.id) && this.selected.size === 1;
      this.selected = selectionAfterPointerDown(this.selected, node.id, {
        additive: event.metaKey || event.ctrlKey || event.shiftKey
      });
      this.updateSelection();
      if (!this.writerOwned) return;
      const selectedNodes = dragTargets(this.board.nodes, this.selected);
      this.gesture = {
        kind: "move",
        start: screenToWorld(this.localPoint(event), this.viewport),
        moved: false,
        nodes: snapshotGeometry(selectedNodes)
      };
    });
    card.addEventListener("click", () => {
      if (openOnClick && !this.suppressCardOpen) this.openNode(node);
      this.suppressCardOpen = false;
    });
    card.addEventListener("focus", () => {
      const next = selectionAfterFocus(this.selected, node.id, { keyboardVisible: isKeyboardFocus(card) });
      if (next === this.selected) return;
      this.selected = next;
      this.updateSelection();
      this.refreshTools();
    });
    card.addEventListener("contextmenu", (event) => this.nodeMenu(event, node));
    layer.append(card);
    if (!collapsed && !excerpt && !textOnly) this.hydrateCard(node, card, type, title, body);
  }
  fillExcerptBody(node, body) {
    const anchor = node.kcExcerpt;
    const created = formatLocalTimestamp(anchor.createdAt);
    const updated = formatLocalTimestamp(anchor.updatedAt);
    const meta = [created ? `\u521B\u5EFA\u4E8E ${created}` : "", updated ? `\u6E90\u6587\u66F4\u65B0\u4E8E ${updated}` : ""].filter(Boolean).join(" \xB7 ");
    body.replaceChildren(
      dom("blockquote", "", anchor.quote),
      dom("small", "", anchor.sourceFile),
      ...meta ? [dom("small", "kc-excerpt-time", meta)] : []
    );
  }
  async hydrateCard(node, card, type, title, body) {
    var _a, _b;
    try {
      const result = await this.plugin.repository.read(node.file);
      const file = result.file;
      const frontmatter = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
      const readFlow = toReadFlowCard(file, result.content, frontmatter);
      if (!card.isConnected) return;
      if (readFlow) {
        card.dataset.kind = "readflow";
        card.dataset.color = effectiveCardColor(node, { readFlow: true });
        type.textContent = "READFLOW \xB7 \u539F\u6587\u6458\u5F55";
        title.textContent = readFlow.title;
        body.replaceChildren(dom("blockquote", "", readFlow.excerpt), dom("small", "", [readFlow.book, readFlow.chapter].filter(Boolean).join(" \xB7 ")));
      } else {
        const plain = result.content.replace(/^---\n[\s\S]*?\n---\s*/, "").replace(/^#\s+.*\n?/, "").trim();
        body.textContent = plain.slice(0, 180) || "\u7A7A\u767D\u7B14\u8BB0";
      }
    } catch (e) {
      card.dataset.kind = "missing";
      type.textContent = "\u6587\u4EF6\u7F3A\u5931";
      body.replaceChildren(dom("p", "", "\u6E90\u6587\u4EF6\u4E0D\u5B58\u5728"));
      const remove = dom("button", "", "\u4ECE\u753B\u677F\u79FB\u9664");
      remove.type = "button";
      remove.addEventListener("click", () => this.removeNodes([node.id]));
      const relink = dom("button", "", "\u91CD\u65B0\u5173\u8054");
      relink.type = "button";
      relink.addEventListener("click", async () => {
        var _a2;
        const result = await requestInput(this.app, {
          title: "\u91CD\u65B0\u5173\u8054 Markdown \u6587\u4EF6",
          submitLabel: "\u91CD\u65B0\u5173\u8054",
          fields: [{ key: "path", label: "Markdown \u8DEF\u5F84", value: node.file }]
        });
        if (!result) return;
        const path = normalizeFilePath(result);
        const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
        if (!((_a2 = file == null ? void 0 : file.path) == null ? void 0 : _a2.toLowerCase().endsWith(".md"))) {
          new import_obsidian6.Notice("\u672A\u627E\u5230\u8BE5 Markdown \u6587\u4EF6");
          return;
        }
        await this.mutateBoard((next) => {
          const target = next.nodes.find((candidate) => candidate.id === node.id);
          if (!target) return false;
          target.file = file.path;
          return true;
        }, "\u91CD\u65B0\u5173\u8054\u5931\u8D25");
      });
      body.append(relink, remove);
    }
  }
  /**
   * Group frames render behind edges and cards. A frame is a plain box, so a pointer
   * over a member card hits the card (higher z-index) and only the frame's own padding
   * ring starts a whole-group drag. No resize handle and no connector by design.
   * Frames are focusable and selectable from the keyboard on the same terms as cards.
   */
  renderGroups(layer) {
    if (this.search) return;
    for (const group of this.board.nodes.filter(isGroupNode)) {
      const frame = dom("div", "kc-group");
      frame.dataset.groupId = group.id;
      frame.tabIndex = 0;
      frame.setAttribute("role", "group");
      frame.setAttribute("aria-label", `${group.label ? `\u5206\u7EC4\u6846 ${group.label}` : "\u5206\u7EC4\u6846"}\uFF0C\u5305\u542B ${group.members.length} \u5F20\u5361\u7247\uFF0C\u6309 Enter \u6216\u7A7A\u683C\u53EF\u9009\u4E2D`);
      frame.style.left = `${group.x}px`;
      frame.style.top = `${group.y}px`;
      frame.style.width = `${group.width}px`;
      frame.style.height = `${group.height}px`;
      if (this.selected.has(group.id)) frame.classList.add("is-selected");
      if (group.label) frame.append(dom("span", "kc-group-label", group.label));
      frame.addEventListener("pointerdown", (event) => this.onGroupPointerDown(event, group));
      frame.addEventListener("focus", () => {
        const next = selectionAfterFocus(this.selected, group.id, { keyboardVisible: isKeyboardFocus(frame) });
        if (next === this.selected) return;
        this.selected = next;
        this.updateSelection();
        this.refreshTools();
      });
      frame.addEventListener("keydown", (event) => this.onGroupKeyDown(event, group));
      frame.addEventListener("contextmenu", (event) => this.groupMenu(event, group));
      layer.append(frame);
    }
  }
  onGroupPointerDown(event, group) {
    if (event.button !== 0) return;
    if (this.spaceHeld) {
      event.preventDefault();
      this.gesture = { kind: "pan", start: { x: event.clientX, y: event.clientY }, viewport: { ...this.viewport } };
      return;
    }
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      if (this.selected.has(group.id)) this.selected.delete(group.id);
      else this.selected.add(group.id);
    } else if (!this.selected.has(group.id)) {
      this.selected = /* @__PURE__ */ new Set([group.id]);
    }
    this.updateSelection();
    this.refreshTools();
    if (!this.writerOwned) return;
    const members = dragTargets(this.board.nodes, this.selected);
    this.gesture = {
      kind: "group-move",
      start: screenToWorld(this.localPoint(event), this.viewport),
      moved: false,
      nodes: snapshotGeometry(members)
    };
  }
  onGroupKeyDown(event, group) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    this.selected = /* @__PURE__ */ new Set([group.id]);
    this.updateSelection();
    this.refreshTools();
  }
  renderEdges(layer) {
    var _a;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("kc-edges");
    svg.setAttribute("aria-label", "\u5173\u7CFB");
    svg.setAttribute("viewBox", "-10000 -10000 30000 30000");
    const defs = document.createElementNS(svg.namespaceURI, "defs");
    defs.innerHTML = '<marker id="kc-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>';
    svg.append(defs);
    const obstacles = this.board.nodes.filter(isCardNode).map((node) => this.nodeRect(node));
    for (const edge of this.board.edges) {
      const from = this.board.nodes.find((node) => node.id === edge.fromNode);
      const to = this.board.nodes.find((node) => node.id === edge.toNode);
      if (!from || !to) continue;
      const labelSize = edge.label ? estimateLabelSize(edge.label) : void 0;
      const path = edgePath(this.nodeRect(from), this.nodeRect(to), edge.kcRoute, obstacles, labelSize);
      const group = document.createElementNS(svg.namespaceURI, "g");
      group.dataset.edgeId = edge.id;
      group.dataset.color = (_a = edge.color) != null ? _a : "neutral";
      group.dataset.route = normalizeEdgeRoute(edge.kcRoute);
      if (this.selected.has(edge.id)) group.classList.add("is-selected");
      const line = document.createElementNS(svg.namespaceURI, "path");
      line.setAttribute("d", path.d);
      line.classList.add("kc-edge-line");
      if (edge.fromEnd === "arrow") line.setAttribute("marker-start", "url(#kc-arrow)");
      if (edge.toEnd === "arrow") line.setAttribute("marker-end", "url(#kc-arrow)");
      if (edge.style === "dashed") line.setAttribute("stroke-dasharray", "8 6");
      const hit = document.createElementNS(svg.namespaceURI, "path");
      hit.setAttribute("d", path.d);
      hit.classList.add("kc-edge-hit");
      hit.addEventListener("click", (event) => {
        event.stopPropagation();
        this.selected = /* @__PURE__ */ new Set([edge.id]);
        this.render();
      });
      hit.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        this.editEdgeLabel(edge);
      });
      hit.addEventListener("contextmenu", (event) => this.edgeMenu(event, edge));
      group.append(line, hit);
      if (edge.label) {
        const rect = labelRectAt(path.labelPoint, labelSize);
        const label = document.createElementNS(svg.namespaceURI, "text");
        label.setAttribute("x", String(path.labelPoint.x));
        label.setAttribute("y", String(rect.y + rect.height / 2));
        label.setAttribute("dominant-baseline", "central");
        label.textContent = edge.label;
        label.addEventListener("dblclick", (event) => {
          event.stopPropagation();
          this.editEdgeLabel(edge);
        });
        const pill = document.createElementNS(svg.namespaceURI, "rect");
        pill.setAttribute("x", String(rect.x));
        pill.setAttribute("y", String(rect.y));
        pill.setAttribute("width", String(rect.width));
        pill.setAttribute("height", String(rect.height));
        pill.setAttribute("rx", "8");
        pill.classList.add("kc-edge-label-bg");
        group.append(pill, label);
      }
      svg.append(group);
    }
    layer.append(svg);
  }
  /** The rectangle a connector attaches to, honouring a collapsed card's rendered height. */
  nodeRect(node) {
    return { x: node.x, y: node.y, width: node.width, height: renderedNodeHeight(node) };
  }
  renderOutline(shell) {
    const main = dom("main", "kc-outline");
    const selection = outlineSelection(this.board, this.filteredNodes());
    const outline = projectOutline(selection.nodes, selection.edges);
    const list = dom("ul", "kc-outline-tree");
    const append = (parent, item) => {
      const li = dom("li", "");
      const button = dom("button", "", cardLabel(item.node) || "\u672A\u547D\u540D");
      button.type = "button";
      button.addEventListener("click", () => this.openEditor(item.node));
      li.append(button);
      if (item.children.length) {
        const children = dom("ul", "");
        for (const child of item.children) append(children, child);
        li.append(children);
      }
      parent.append(li);
    };
    for (const root of outline.roots) append(list, root);
    main.append(list);
    if (outline.crossReferences.length) {
      main.append(dom("h2", "", "\u4EA4\u53C9\u5F15\u7528"));
      for (const relation of outline.crossReferences) main.append(dom("p", "kc-cross-reference", `${this.nodeName(relation.from)} \u2194 ${this.nodeName(relation.to)}`));
    }
    shell.append(main);
  }
  renderZoom(stage) {
    const controls = dom("div", "kc-zoom");
    const magnet = dom("button", "kc-snap-toggle");
    magnet.type = "button";
    magnet.setAttribute("aria-label", "\u5438\u9644\u5BF9\u9F50");
    magnet.title = this.snapEnabled ? "\u5438\u9644\u5BF9\u9F50\u5DF2\u5F00\u542F\uFF08\u6309\u4F4F Alt \u4E34\u65F6\u5173\u95ED\uFF09" : "\u5438\u9644\u5BF9\u9F50\u5DF2\u5173\u95ED";
    magnet.classList.toggle("is-active", this.snapEnabled);
    (0, import_obsidian6.setIcon)(magnet, "magnet");
    const syncMagnet = () => {
      magnet.setAttribute("aria-pressed", String(this.snapEnabled));
      magnet.classList.toggle("is-active", this.snapEnabled);
      magnet.title = this.snapEnabled ? "\u5438\u9644\u5BF9\u9F50\u5DF2\u5F00\u542F\uFF08\u6309\u4F4F Alt \u4E34\u65F6\u5173\u95ED\uFF09" : "\u5438\u9644\u5BF9\u9F50\u5DF2\u5173\u95ED";
    };
    syncMagnet();
    magnet.addEventListener("click", () => {
      this.snapEnabled = !this.snapEnabled;
      syncMagnet();
      new import_obsidian6.Notice(this.snapEnabled ? "\u5438\u9644\u5DF2\u5F00\u542F" : "\u5438\u9644\u5DF2\u5173\u95ED");
    });
    controls.append(magnet);
    const locate = dom("button", "kc-locate");
    locate.type = "button";
    locate.setAttribute("aria-label", "\u5B9A\u4F4D\u753B\u5E03\u5185\u5BB9");
    locate.title = "\u5B9A\u4F4D\u753B\u5E03\u5185\u5BB9";
    (0, import_obsidian6.setIcon)(locate, "locate-fixed");
    locate.addEventListener("click", () => this.locateContent());
    controls.append(locate);
    for (const [label, delta] of [["\u2212", -0.2], ["\uFF0B", 0.2]]) {
      const button = dom("button", "", label);
      button.type = "button";
      button.setAttribute("aria-label", delta > 0 ? "\u653E\u5927" : "\u7F29\u5C0F");
      button.addEventListener("click", () => {
        this.viewport = zoomAt({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 }, delta, this.viewport);
        this.render();
      });
      controls.append(button);
    }
    controls.append(dom("span", "", `${Math.round(this.viewport.scale * 100)}%`));
    stage.append(controls);
  }
  /** Fits every card in view; an empty canvas says so instead of jumping nowhere. */
  locateContent() {
    if (!this.stage) return false;
    const bounds2 = contentBounds2(this.board.nodes);
    const next = bounds2 ? fitViewport(bounds2, { width: this.stage.clientWidth, height: this.stage.clientHeight }) : null;
    if (!next) {
      new import_obsidian6.Notice("\u753B\u5E03\u6682\u65E0\u5185\u5BB9");
      return false;
    }
    this.viewport = next;
    this.render();
    return true;
  }
  /**
   * Applies a layout to the current selection only. Nothing is written unless the board
   * save succeeds, and the live board is untouched until then.
   */
  async applyLayoutCommand(command) {
    if (!this.isWritable()) return false;
    if (!this.selected.size) {
      new import_obsidian6.Notice("\u8BF7\u5148\u9009\u62E9\u8981\u6574\u7406\u7684\u5361\u7247");
      return false;
    }
    const selection = new Set(this.selected);
    if (!layoutUnits(this.board.nodes, selection).length) {
      new import_obsidian6.Notice("\u5F53\u524D\u9009\u62E9\u6CA1\u6709\u53EF\u6574\u7406\u7684\u5361\u7247");
      return false;
    }
    return this.mutateBoard((next) => {
      const units = layoutUnits(next.nodes, selection);
      if (!units.length) return false;
      applyLayoutPatch(units, layoutPatch(units, command));
      return true;
    }, "\u5E03\u5C40\u5931\u8D25");
  }
  fileNodes() {
    return this.board.nodes.filter((node) => !isGroupNode(node));
  }
  filteredNodes() {
    const cards = this.fileNodes();
    return this.search ? cards.filter((node) => cardSearchText(node).includes(this.search)) : cards;
  }
  localPoint(event) {
    const rect = this.stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  onPointerMove(event) {
    var _a, _b;
    if (!this.gesture) return;
    if (this.gesture.kind === "move" || this.gesture.kind === "group-move") {
      const point2 = screenToWorld(this.localPoint(event), this.viewport);
      const dx = point2.x - this.gesture.start.x;
      const dy = point2.y - this.gesture.start.y;
      (_a = this.gesture).moved || (_a.moved = Math.abs(dx) + Math.abs(dy) > 2);
      applyDrag(this.gesture.nodes, dx, dy);
      if (this.snapEnabled && !event.altKey) this.snapGesture();
      else this.hideGuides();
      this.updateWorld();
    } else if (this.gesture.kind === "resize") {
      const base = this.gesture.nodes[0];
      const dx = (event.clientX - this.gesture.start.x) / this.viewport.scale;
      const dy = (event.clientY - this.gesture.start.y) / this.viewport.scale;
      base.node.width = Math.max(220, base.width + dx);
      base.node.height = Math.max(140, base.height + dy);
      this.updateWorld();
    } else if (this.gesture.kind === "marquee") {
      const point2 = this.localPoint(event);
      this.drawMarquee(worldToScreen(this.gesture.start, this.viewport), point2);
      const rect = rectFromPoints(this.gesture.start, screenToWorld(point2, this.viewport));
      this.applySelection(marqueeSelection(this.board.nodes, rect, { base: this.gesture.base }));
    } else if (this.gesture.kind === "pan") {
      this.viewport.x = this.gesture.viewport.x + event.clientX - this.gesture.start.x;
      this.viewport.y = this.gesture.viewport.y + event.clientY - this.gesture.start.y;
      const world = (_b = this.stage) == null ? void 0 : _b.querySelector(".kc-world");
      if (world) world.style.transform = `translate(${this.viewport.x}px, ${this.viewport.y}px) scale(${this.viewport.scale})`;
    }
  }
  onPointerUp(event) {
    var _a, _b, _c;
    if (!this.gesture) return;
    const gesture = this.gesture;
    this.gesture = null;
    this.hideGuides();
    this.releaseGestureIdle();
    if (gesture.kind === "marquee") {
      this.clearMarquee();
      return;
    }
    if (gesture.kind === "connect") {
      const target = (_c = (_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, ".kc-card")) == null ? void 0 : _c.dataset.nodeId;
      if (target && target !== gesture.from) void this.createEdgeBetween(gesture.from, target);
    } else if (["move", "resize", "group-move"].includes(gesture.kind)) {
      this.suppressCardOpen = gesture.kind === "move" && gesture.moved;
      this.finishGeometryGesture(gesture);
    }
  }
  /**
   * The system cancelled the pointer (touch interruption, window blur, a native drag taking
   * over). The gesture is abandoned: geometry gestures restore their snapshot, a pan
   * restores the viewport, and every transient overlay is removed. Without this a later
   * pointermove would keep moving cards and the next pointerup would save the wrong place.
   */
  onPointerCancel() {
    const gesture = this.gesture;
    this.gesture = null;
    this.releaseGestureIdle();
    this.hideGuides();
    this.clearMarquee();
    if (!gesture) return;
    const { restored } = cancelGestureGeometry(this.board, gesture);
    if (isPanGesture(gesture)) {
      this.viewport = { ...gesture.viewport };
      this.render();
      return;
    }
    if (restored) this.render();
  }
  /**
   * A member's geometry changed, so its frame has to re-wrap. The final geometry is captured
   * as an id-based patch and applied to the *latest* clone inside the queue: a save that was
   * already in flight when the drag started must not swallow the new positions.
   */
  async finishGeometryGesture(gesture) {
    if (gesture.kind !== "group-move") this.reflowGroupsFor(new Set(gesture.nodes.map((item) => item.node.id)));
    const patch = this.geometryPatchFor(gesture.nodes);
    const done = await this.mutateBoard((next) => this.applyGeometryPatch(next, patch), "\u753B\u677F\u4FDD\u5B58\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u62D6\u52A8\u524D\u7684\u4F4D\u7F6E");
    if (!done) {
      this.restoreGeometryFrom(gesture.nodes);
      this.render();
    }
  }
  /** Final geometry of every dragged node plus any frame that reflowed around a member. */
  geometryPatchFor(items) {
    const ids = new Set((items != null ? items : []).map((item) => item.node.id));
    for (const group of this.board.nodes.filter(isGroupNode)) {
      if (group.members.some((id) => ids.has(id))) ids.add(group.id);
    }
    const patch = [];
    for (const id of ids) {
      const node = this.board.nodes.find((candidate) => candidate.id === id);
      if (node) patch.push({ id, x: node.x, y: node.y, width: node.width, height: node.height });
    }
    return patch;
  }
  applyGeometryPatch(board, patch) {
    let changed = false;
    for (const entry of patch != null ? patch : []) {
      const node = board.nodes.find((candidate) => candidate.id === entry.id);
      if (!node) continue;
      node.x = entry.x;
      node.y = entry.y;
      node.width = entry.width;
      node.height = entry.height;
      changed = true;
    }
    return changed;
  }
  updateWorld() {
    var _a;
    const world = (_a = this.stage) == null ? void 0 : _a.querySelector(".kc-world");
    if (!world) return;
    for (const element2 of world.querySelectorAll(".kc-card")) {
      const node = this.board.nodes.find((candidate) => candidate.id === element2.dataset.nodeId);
      if (!node) continue;
      element2.style.left = `${node.x}px`;
      element2.style.top = `${node.y}px`;
      element2.style.width = `${node.width}px`;
      element2.style.height = `${renderedNodeHeight(node)}px`;
    }
    for (const element2 of world.querySelectorAll(".kc-group")) {
      const group = this.board.nodes.find((candidate) => candidate.id === element2.dataset.groupId);
      if (!group) continue;
      element2.style.left = `${group.x}px`;
      element2.style.top = `${group.y}px`;
      element2.style.width = `${group.width}px`;
      element2.style.height = `${group.height}px`;
    }
  }
  updateSelection() {
    var _a, _b, _c, _d;
    for (const card of (_b = (_a = this.stage) == null ? void 0 : _a.querySelectorAll(".kc-card")) != null ? _b : []) card.classList.toggle("is-selected", this.selected.has(card.dataset.nodeId));
    for (const frame of (_d = (_c = this.stage) == null ? void 0 : _c.querySelectorAll(".kc-group")) != null ? _d : []) frame.classList.toggle("is-selected", this.selected.has(frame.dataset.groupId));
  }
  /** Applies a computed selection; only a real membership change repaints classes. */
  applySelection(next) {
    const changed = next.size !== this.selected.size || [...next].some((id) => !this.selected.has(id));
    this.selected = next;
    if (changed) {
      this.updateSelection();
      this.refreshTools();
    }
  }
  /** Draws the marquee band in stage coordinates; it is decoration only, never data. */
  drawMarquee(from, to) {
    if (!this.stage) return;
    if (!this.marqueeEl) {
      this.marqueeEl = dom("div", "kc-marquee");
      this.marqueeEl.setAttribute("aria-hidden", "true");
      this.stage.append(this.marqueeEl);
    }
    this.marqueeEl.style.left = `${Math.min(from.x, to.x)}px`;
    this.marqueeEl.style.top = `${Math.min(from.y, to.y)}px`;
    this.marqueeEl.style.width = `${Math.abs(to.x - from.x)}px`;
    this.marqueeEl.style.height = `${Math.abs(to.y - from.y)}px`;
  }
  clearMarquee() {
    var _a;
    (_a = this.marqueeEl) == null ? void 0 : _a.remove();
    this.marqueeEl = null;
  }
  /**
   * Snaps the dragged geometry against every stationary card and frame. The offset is
   * recomputed from the pointer on every move, so leaving a snap line is drift-free.
   */
  snapGesture() {
    var _a, _b;
    const items = (_b = (_a = this.gesture) == null ? void 0 : _a.nodes) != null ? _b : [];
    if (!items.length) return;
    const moving = items.map((item) => item.node);
    const movingIds = new Set(moving.map((node) => node.id));
    const result = snapRect(dragBounds(moving), snapLines(this.board.nodes, movingIds), {
      threshold: snapThreshold(this.viewport.scale)
    });
    if (result.dx || result.dy) {
      for (const item of items) {
        item.node.x += result.dx;
        item.node.y += result.dy;
      }
    }
    this.showGuides(result);
  }
  /** Alignment guides are decoration in stage coordinates and vanish with the drag. */
  showGuides({ guideX, guideY }) {
    this.hideGuides();
    if (!this.stage) return;
    const add = (position, axis) => {
      const line = dom("div", `kc-snap-guide kc-snap-guide--${axis}`);
      line.setAttribute("aria-hidden", "true");
      if (axis === "v") line.style.left = `${worldToScreen({ x: position, y: 0 }, this.viewport).x}px`;
      else line.style.top = `${worldToScreen({ x: 0, y: position }, this.viewport).y}px`;
      this.stage.append(line);
      this.guideEls.push(line);
    };
    if (Number.isFinite(guideX)) add(guideX, "v");
    if (Number.isFinite(guideY)) add(guideY, "h");
  }
  hideGuides() {
    for (const line of this.guideEls) line.remove();
    this.guideEls = [];
  }
  onWheel(event) {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) this.viewport = zoomAt(this.localPoint(event), -event.deltaY * 2e-3, this.viewport);
    else {
      this.viewport.x -= event.deltaX;
      this.viewport.y -= event.deltaY;
    }
    this.render();
  }
  onDrop(event) {
    var _a, _b, _c, _d;
    event.preventDefault();
    const transfer = event.dataTransfer;
    let raw = ((_a = transfer == null ? void 0 : transfer.getData("text/plain")) == null ? void 0 : _a.trim()) || ((_b = transfer == null ? void 0 : transfer.getData("text/uri-list")) == null ? void 0 : _b.trim());
    try {
      const payload = JSON.parse((transfer == null ? void 0 : transfer.getData("application/json")) || "{}");
      raw || (raw = payload.path || ((_c = payload.file) == null ? void 0 : _c.path));
    } catch (e) {
    }
    raw = raw == null ? void 0 : raw.replace(/^\[\[|\]\]$/g, "").replace(/^file:\/\//, "");
    const path = raw == null ? void 0 : raw.replace(/^obsidian:\/\/open\?[^#]*file=/, "");
    let decoded = path;
    try {
      decoded = path ? decodeURIComponent(path) : path;
    } catch (e) {
      decoded = path;
    }
    const file = decoded ? this.app.vault.getAbstractFileByPath(decoded) : null;
    if ((_d = file == null ? void 0 : file.path) == null ? void 0 : _d.endsWith(".md")) this.addFile(file, screenToWorld(this.localPoint(event), this.viewport));
    else new import_obsidian6.Notice("\u8BF7\u901A\u8FC7\u6587\u4EF6\u83DC\u5355\u201C\u52A0\u5165\u77E5\u8BC6\u753B\u677F\u201D\uFF0C\u6216\u62D6\u5165 Markdown \u8DEF\u5F84\u3002");
  }
  onKeyDown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (this.editor) this.editor.handleEscape();
      else if (this.toolEntry.expanded) this.setToolEntryExpanded(false);
      else if (this.selected.size) {
        this.selected.clear();
        this.updateSelection();
        this.refreshTools();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && !this.isTextEntryTarget(event.target)) {
      event.preventDefault();
      this.applySelection(selectAllIds(this.board.nodes));
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && this.selected.size) {
      event.preventDefault();
      this.removeSelection();
    }
    if (event.key === "Enter" && this.selected.size === 1) {
      const node = this.board.nodes.find((candidate) => this.selected.has(candidate.id) && !isGroupNode(candidate));
      if (node) this.openNode(node);
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
      const node = this.board.nodes.find((candidate) => this.selected.has(candidate.id) && !isGroupNode(candidate));
      if (node) this.openEditor(node, true);
    }
  }
  async createSticky(point2) {
    if (!this.isWritable()) return;
    const result = await requestInput(this.app, {
      title: "\u65B0\u5EFA\u4FBF\u5229\u8D34",
      submitLabel: "\u521B\u5EFA\u4FBF\u5229\u8D34",
      validate: (values) => normalizeStickyNote(values) ? null : "\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A",
      fields: [
        { key: "title", label: "\u6807\u9898" },
        { key: "body", label: "\u5185\u5BB9", multiline: true, placeholder: "\u53EF\u7A0D\u540E\u5728\u6D6E\u52A8\u7A97\u53E3\u7EE7\u7EED\u7F16\u8F91" }
      ]
    });
    if (!result) return;
    const note = normalizeStickyNote(result);
    if (!note) {
      new import_obsidian6.Notice("\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A");
      return;
    }
    const { title, body } = note;
    const create = async () => {
      var _a;
      const file = await this.plugin.repository.createNote(title, body, { folder: (_a = boardNoteFolder(this.board)) != null ? _a : void 0 });
      await this.addFile(file, point2, { sticky: true });
      const node = this.board.nodes.find((candidate) => candidate.file === file.path);
      if (node) this.openEditor(node, true);
    };
    try {
      await create();
    } catch (error) {
      new import_obsidian6.Notice(`\u521B\u5EFA\u5931\u8D25\uFF1A${error.message}`);
      new DraftRecoveryModal(this.app, title, body, create).open();
    }
  }
  /** A card opens its own note; an excerpt sticker opens the note it was cut from. */
  openNode(node, edit = false) {
    if (isTextNode(node) && !isExcerptNode(node)) return false;
    return this.openEditor(node, edit);
  }
  async openEditor(node, edit = false) {
    var _a, _b, _c;
    if (this.editor && !await this.editor.close()) return;
    const excerpt = isExcerptNode(node);
    const filePath = excerpt ? (_a = excerptSourcePath(node.kcExcerpt)) != null ? _a : node.kcExcerpt.sourceFile : node.file;
    try {
      const current = await this.plugin.repository.read(filePath);
      const frontmatter = (_c = (_b = this.app.metadataCache.getFileCache(current.file)) == null ? void 0 : _b.frontmatter) != null ? _c : {};
      const readFlow = toReadFlowCard(current.file, current.content, frontmatter);
      const sourceLink = typeof frontmatter.book === "string" ? frontmatter.book.replace(/^\[\[|\]\]$/g, "").split("|")[0] : "";
      const sourceFile = sourceLink ? this.app.metadataCache.getFirstLinkpathDest(sourceLink, current.file.path) : null;
      this.editor = new FloatingEditor({
        host: this.contentEl,
        repository: this.plugin.repository,
        filePath,
        readFlow,
        readFlowFrontmatter: readFlow ? frontmatter : null,
        excerptAnchor: excerpt ? node.kcExcerpt : null,
        relations: this.board.edges.filter((edge) => edge.fromNode === node.id || edge.toNode === node.id),
        renderMarkdown: (content, host, path) => import_obsidian6.MarkdownRenderer.render(this.app, content, host, path, this),
        openSource: () => this.app.workspace.getLeaf(false).openFile(sourceFile != null ? sourceFile : current.file),
        onTextContextMenu: (payload) => this.openTextContextMenu(payload),
        // The handler returns the sync promise: EditorSession awaits it, so "saved" means
        // the excerpt timestamp write finished too.
        onSourceSaved: createSourceSavedHandler((info) => this.syncExcerptTimestampsOnSave(info)),
        onClose: () => {
          this.editor = null;
        }
      });
      await this.editor.open();
      if (edit) this.editor.toggleEdit();
    } catch (error) {
      new import_obsidian6.Notice(`\u65E0\u6CD5\u6253\u5F00\uFF1A${error.message}`);
    }
  }
  /**
   * The menu the editor shows at the caret. A selection gets the formatting entries;
   * without one, only the paragraph timestamp remains — no selection is required.
   */
  openTextContextMenu({ event, intent }) {
    const editor = this.editor;
    if (!editor) return;
    const menu = new import_obsidian6.Menu();
    const offset = intent ? Math.min(intent.start, intent.end) : editor.textState().start;
    menu.addItem((item) => item.setTitle("\u6DFB\u52A0\u65F6\u95F4\u6233").onClick(() => this.addTimestampAtCursor(offset)));
    if (!intent) {
      menu.showAtMouseEvent(event);
      return;
    }
    menu.addSeparator();
    const apply = (transform) => editor.applyTextTransform((state) => transform({ ...state, start: intent.start, end: intent.end }));
    menu.addItem((item) => item.setTitle("\u751F\u6210\u6458\u5F55\u8D34\u7EB8").onClick(() => this.createExcerptFromIntent(intent)));
    menu.addSeparator();
    for (const [title, marker] of [["\u52A0\u7C97", BOLD_MARKER], ["\u659C\u4F53", ITALIC_MARKER], ["\u9AD8\u4EAE", HIGHLIGHT_MARKER], ["\u884C\u5185\u4EE3\u7801", CODE_MARKER]]) {
      menu.addItem((item) => item.setTitle(title).onClick(() => apply((state) => toggleInlineFormat(state, marker))));
    }
    menu.addSeparator();
    for (const [title, prefix] of [["\u5F15\u7528", QUOTE_PREFIX], ["\u65E0\u5E8F\u5217\u8868", LIST_PREFIX]]) {
      menu.addItem((item) => item.setTitle(title).onClick(() => apply((state) => toggleLinePrefix(state, prefix))));
    }
    menu.addSeparator();
    for (const level of HEADING_LEVELS) {
      const label = level === 0 ? "\u6B63\u6587" : `H${level}`;
      menu.addItem((item) => item.setTitle(`\u6807\u9898\uFF1A${label}`).onClick(() => apply((state) => setHeading(state, level))));
    }
    menu.showAtMouseEvent(event);
  }
  /**
   * Marks the paragraph at `offset`. The marker is written through the editor session, so
   * auto-save, conflict detection and recovery all still apply; a paragraph that already
   * has a marker is reported instead of being marked twice.
   */
  addTimestampAtCursor(offset = ((_b) => (_b = ((_a) => (_a = this.editor) == null ? void 0 : _a.textState().start)()) != null ? _b : 0)()) {
    const editor = this.editor;
    if (!editor) return false;
    if (!this.isWritable()) return false;
    const result = addParagraphTimestamp(editor.session.text, offset);
    if (!result) {
      new import_obsidian6.Notice("\u5149\u6807\u4E0D\u5728\u53EF\u6807\u8BB0\u7684\u6BB5\u843D\u5185");
      return false;
    }
    if (!result.added) {
      new import_obsidian6.Notice("\u8BE5\u6BB5\u843D\u5DF2\u6709\u65F6\u95F4\u6233");
      return false;
    }
    return editor.applyTextTransform(() => ({ text: result.text, start: offset, end: offset }));
  }
  /**
   * Runs after the source Markdown saved successfully. An excerpt whose quote can still be
   * located keeps its timestamps; one that can no longer be found gets the same save-time
   * `updatedAt`. The Markdown is already on disk and is never touched here — a failed board
   * save only reports the partial success and leaves the board retryable.
   */
  async syncExcerptTimestampsOnSave({ filePath, content, savedAt } = {}) {
    if (!this.isWritable() || !savedAt) return false;
    return this.mutateBoard((next) => {
      const staleIds = new Set(staleExcerptIds(next.nodes, filePath, content));
      if (!staleIds.size) return false;
      markExcerptsUpdated(next.nodes, staleIds, savedAt);
      return true;
    }, "\u6B63\u6587\u5DF2\u4FDD\u5B58\uFF0C\u4F46\u6458\u5F55\u66F4\u65B0\u65F6\u95F4\u672A\u5199\u5165");
  }
  /**
   * Creates a sticker from the editor's selection. Nothing is written unless the board
   * save succeeds, so a failure leaves both the canvas and the source Markdown untouched.
   */
  async createExcerptFromIntent(intent) {
    var _a;
    if (!this.isWritable()) return false;
    if (this.editor && !await this.editor.flushPending()) {
      new import_obsidian6.Notice("\u6E90\u6587\u4EF6\u8FD8\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539\uFF0C\u5DF2\u53D6\u6D88\u521B\u5EFA\u6458\u5F55");
      return false;
    }
    const anchor = (_a = this.editor) == null ? void 0 : _a.excerptAnchorFor(intent);
    if (!anchor) {
      new import_obsidian6.Notice("\u8BF7\u5148\u9009\u4E2D\u4E00\u6BB5\u975E\u7A7A\u6587\u672C");
      return false;
    }
    const done = await this.mutateBoard((next) => {
      var _a2;
      const source = (_a2 = next.nodes.find((node) => isFileNode(node) && node.file === anchor.sourceFile)) != null ? _a2 : null;
      const existing = next.nodes.filter((node) => isExcerptNode(node) && node.kcExcerpt.sourceFile === anchor.sourceFile).length;
      next.nodes.push(createExcerptNode({
        text: excerptTextFromQuote(anchor.quote),
        point: nextExcerptPoint(source, existing),
        anchor
      }));
      return true;
    }, "\u521B\u5EFA\u6458\u5F55\u5931\u8D25");
    if (done) new import_obsidian6.Notice("\u5DF2\u751F\u6210\u6458\u5F55\u8D34\u7EB8");
    return done;
  }
  /** Every layout entry the menus offer, in one place so canvas and card menus agree. */
  appendLayoutItems(menu, { disabled = false } = {}) {
    for (const [command, title, icon] of LAYOUT_MENU_ITEMS) {
      menu.addItem((item) => item.setTitle(title).setIcon(icon).setDisabled(disabled).onClick(() => this.applyLayoutCommand(command)));
    }
  }
  appendAlignItems(menu, { disabled = false } = {}) {
    for (const [command, title] of ALIGN_MENU_ITEMS) {
      menu.addItem((item) => item.setTitle(title).setDisabled(disabled).onClick(() => this.applyLayoutCommand(command)));
    }
  }
  appendDistributeItems(menu, { disabled = false } = {}) {
    for (const [command, title] of DISTRIBUTE_MENU_ITEMS) {
      menu.addItem((item) => item.setTitle(title).setDisabled(disabled).onClick(() => this.applyLayoutCommand(command)));
    }
  }
  /** Right-click on blank canvas: select-all, layout and the snap switch. */
  canvasMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const hasSelection = this.selected.size > 0;
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle("\u5168\u9009").setIcon("box-select").onClick(() => this.applySelection(selectAllIds(this.board.nodes))));
    menu.addSeparator();
    const layoutMenu = new import_obsidian6.Menu();
    this.appendLayoutItems(layoutMenu, { disabled: !hasSelection });
    let submenu = false;
    menu.addItem((item) => {
      item.setTitle("\u5E03\u5C40").setIcon("layout-grid");
      if (typeof item.setSubmenu === "function") {
        item.setSubmenu(layoutMenu);
        submenu = true;
      } else {
        item.setDisabled(!hasSelection);
      }
    });
    if (!submenu) this.appendLayoutItems(menu, { disabled: !hasSelection });
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("\u5438\u9644\u5BF9\u9F50").setIcon("magnet").setChecked(this.snapEnabled).onClick(() => {
      this.snapEnabled = !this.snapEnabled;
      new import_obsidian6.Notice(this.snapEnabled ? "\u5438\u9644\u5DF2\u5F00\u542F" : "\u5438\u9644\u5DF2\u5173\u95ED");
    }));
    menu.showAtMouseEvent(event);
  }
  /** Right-click with a multi-selection: grouping plus the full arrange toolkit. */
  multiSelectMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const selectedGroups = this.board.nodes.filter((node) => isGroupNode(node) && this.selected.has(node.id));
    const grouped = new Set(this.board.nodes.filter(isGroupNode).flatMap((group) => group.members));
    const ungrouped = this.board.nodes.filter((node) => this.selected.has(node.id) && !isGroupNode(node) && !grouped.has(node.id));
    const menu = new import_obsidian6.Menu();
    if (!selectedGroups.length && ungrouped.length >= 2) {
      menu.addItem((item) => item.setTitle("\u7F16\u7EC4").setIcon("group").onClick(() => this.createGroupFromSelection()));
    }
    if (selectedGroups.length) {
      menu.addItem((item) => item.setTitle(selectedGroups.length > 1 ? `\u89E3\u9664 ${selectedGroups.length} \u4E2A\u5206\u7EC4` : "\u89E3\u9664\u5206\u7EC4").onClick(() => this.ungroupSelection(selectedGroups.map((group) => group.id))));
    }
    menu.addSeparator();
    this.appendLayoutItems(menu);
    menu.addSeparator();
    this.appendAlignItems(menu);
    menu.addSeparator();
    this.appendDistributeItems(menu, { disabled: this.selected.size < 3 });
    menu.showAtMouseEvent(event);
  }
  /** Right-click on a group frame. */
  groupMenu(event, group) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selected.has(group.id)) {
      this.selected = /* @__PURE__ */ new Set([group.id]);
      this.updateSelection();
      this.refreshTools();
    }
    if (this.selected.size > 1) {
      this.multiSelectMenu(event);
      return;
    }
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle("\u89E3\u9664\u5206\u7EC4").onClick(() => this.ungroupSelection([group.id])));
    menu.addItem((item) => item.setTitle("\u5220\u9664\u5206\u7EC4\u6846").onClick(() => this.removeGroup(group.id)));
    menu.showAtMouseEvent(event);
  }
  /** Right-click on a card. Deletion reuses the one safe removal chain, never a bypass. */
  nodeMenu(event, node) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selected.has(node.id)) {
      this.selected = /* @__PURE__ */ new Set([node.id]);
      this.updateSelection();
      this.refreshTools();
    }
    if (this.selected.size > 1) {
      this.multiSelectMenu(event);
      return;
    }
    const menu = new import_obsidian6.Menu();
    const collapseTitle = node.collapsed === true ? "\u5C55\u5F00" : "\u6298\u53E0";
    menu.addItem((item) => item.setTitle("\u989C\u8272").setIcon("palette").onClick(() => this.openColorPicker(node)));
    menu.addSeparator();
    if (isExcerptNode(node)) {
      menu.addItem((item) => item.setTitle("\u56DE\u5230\u539F\u6587").onClick(() => this.openNode(node)));
      menu.addItem((item) => item.setTitle(collapseTitle).onClick(() => this.toggleCollapsed(node.id)));
    } else if (isTextNode(node)) {
      menu.addItem((item) => item.setTitle(collapseTitle).onClick(() => this.toggleCollapsed(node.id)));
    } else {
      menu.addItem((item) => item.setTitle("\u9884\u89C8").onClick(() => this.openEditor(node)));
      menu.addItem((item) => item.setTitle("\u7F16\u8F91").onClick(() => this.openEditor(node, true)));
      menu.addItem((item) => item.setTitle(collapseTitle).onClick(() => this.toggleCollapsed(node.id)));
    }
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("\u4ECE\u753B\u5E03\u79FB\u9664").onClick(() => this.removeNodes([node.id])));
    menu.showAtMouseEvent(event);
  }
  cardElement(id) {
    var _a, _b, _c;
    return (_c = [...(_b = (_a = this.stage) == null ? void 0 : _a.querySelectorAll(".kc-card")) != null ? _b : []].find((card) => card.dataset.nodeId === id)) != null ? _c : null;
  }
  focusCard(id) {
    var _a;
    (_a = this.cardElement(id)) == null ? void 0 : _a.focus();
  }
  /** Opens the colour popover anchored to the card; the card regains focus when it closes. */
  openColorPicker(node) {
    if (!this.colorPicker) return;
    this.colorPicker.open({
      anchorEl: this.cardElement(node.id),
      current: effectiveCardColor(node),
      restoreFocusTo: () => this.focusCard(node.id),
      onSelect: (color) => this.applyCardColor(node.id, color)
    });
  }
  /**
   * Save first, install second: a failed save leaves the live board — and therefore the old
   * colour — exactly as it was, and the Notice explains why.
   */
  async applyCardColor(id, color) {
    if (!this.isWritable()) return false;
    const done = await this.mutateBoard((next) => setCardColor(next, id, color) ? true : false, "\u4FEE\u6539\u989C\u8272\u5931\u8D25");
    this.focusCard(id);
    return done;
  }
  /** Creates a relation on the latest board; ids are re-resolved inside the mutator. */
  async createEdgeBetween(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    return this.mutateBoard((next) => {
      const from = next.nodes.find((node) => node.id === fromId);
      const to = next.nodes.find((node) => node.id === toId);
      if (!from || !to) return false;
      next.edges.push(createEdge(from, to));
      return true;
    }, "\u5EFA\u7ACB\u5173\u7CFB\u5931\u8D25\uFF0C\u5DF2\u6062\u590D\u539F\u72B6");
  }
  /** Every relation property change is addressed by edge id, never by a live object. */
  async updateEdge(edgeId, change, failureLabel) {
    return this.mutateBoard((next) => {
      const edge = next.edges.find((candidate) => candidate.id === edgeId);
      if (!edge) return false;
      return change(edge, next) === false ? false : true;
    }, failureLabel);
  }
  async editEdgeLabel(edge) {
    var _a;
    const result = await requestInput(this.app, {
      title: "\u7F16\u8F91\u5173\u7CFB\u540D\u79F0",
      submitLabel: "\u4FDD\u5B58",
      fields: [{ key: "label", label: "\u5173\u7CFB\u540D\u79F0\uFF08\u53EF\u7559\u7A7A\uFF09", value: (_a = edge.label) != null ? _a : "" }]
    });
    if (!result) return;
    const label = normalizeEdgeLabel(result);
    await this.updateEdge(edge.id, (target) => {
      if (label) target.label = label;
      else delete target.label;
    }, "\u4FEE\u6539\u5173\u7CFB\u540D\u79F0\u5931\u8D25");
  }
  edgeMenu(event, edge) {
    event.preventDefault();
    const menu = new import_obsidian6.Menu();
    menu.addItem((item) => item.setTitle("\u7F16\u8F91\u5173\u7CFB\u540D\u79F0").onClick(() => this.editEdgeLabel(edge)));
    for (const [title, fromEnd, toEnd] of [["\u5355\u5411 \u2192", "none", "arrow"], ["\u53CC\u5411 \u2194", "arrow", "arrow"], ["\u65E0\u65B9\u5411 \u2014", "none", "none"]]) {
      menu.addItem((item) => item.setTitle(title).onClick(() => {
        void this.updateEdge(edge.id, (target) => {
          target.fromEnd = fromEnd;
          target.toEnd = toEnd;
        }, "\u4FEE\u6539\u5173\u7CFB\u5931\u8D25");
      }));
    }
    for (const [title, route] of [["\u66F2\u7EBF", "curve"], ["\u76F4\u7EBF", "straight"], ["\u6298\u7EBF", "elbow"]]) {
      menu.addItem((item) => item.setTitle(`\u8DEF\u7EBF\uFF1A${title}`).setChecked(normalizeEdgeRoute(edge.kcRoute) === route).onClick(() => {
        void this.updateEdge(edge.id, (target, next) => {
          setEdgeRoute(next, target.id, route);
        }, "\u4FEE\u6539\u5173\u7CFB\u5931\u8D25");
      }));
    }
    menu.addItem((item) => item.setTitle(edge.style === "dashed" ? "\u6539\u4E3A\u5B9E\u7EBF" : "\u6539\u4E3A\u865A\u7EBF").onClick(() => {
      void this.updateEdge(edge.id, (target) => {
        target.style = target.style === "dashed" ? "solid" : "dashed";
      }, "\u4FEE\u6539\u5173\u7CFB\u5931\u8D25");
    }));
    for (const [title, color] of [["\u4E2D\u6027\u8272", "neutral"], ["\u84DD\u8272", "blue"], ["\u7EFF\u8272", "green"], ["\u7EA2\u8272", "red"]]) {
      menu.addItem((item) => item.setTitle(`\u7EBF\u6761\u989C\u8272\uFF1A${title}`).onClick(() => {
        void this.updateEdge(edge.id, (target) => {
          target.color = color;
        }, "\u4FEE\u6539\u5173\u7CFB\u5931\u8D25");
      }));
    }
    if (canPromoteToMarkdown(this.board, edge)) {
      if (edge.fromEnd === "none" && edge.toEnd === "none") {
        menu.addItem((item) => item.setTitle("\u4EE5\u8D77\u70B9\u540C\u6B65\u4E3A Markdown \u53CC\u94FE").onClick(() => this.promote(edge, edge.fromNode)));
        menu.addItem((item) => item.setTitle("\u4EE5\u7EC8\u70B9\u540C\u6B65\u4E3A Markdown \u53CC\u94FE").onClick(() => this.promote(edge, edge.toNode)));
      } else menu.addItem((item) => item.setTitle("\u540C\u6B65\u4E3A Markdown \u53CC\u94FE\u2026").onClick(() => this.promote(edge)));
    }
    menu.addSeparator();
    menu.addItem((item) => {
      var _a, _b;
      item.setTitle("\u5220\u9664\u5173\u7CFB").setIcon("trash-2");
      (_b = (_a = item.dom) == null ? void 0 : _a.classList) == null ? void 0 : _b.add("mod-warning");
      item.onClick(() => this.requestRemove([edge.id]));
    });
    menu.showAtMouseEvent(event);
  }
  async promote(edge, sourceNode) {
    try {
      const files = {};
      for (const id of [edge.fromNode, edge.toNode]) {
        const node = this.board.nodes.find((candidate) => candidate.id === id);
        files[id] = await this.plugin.repository.read(node.file);
      }
      const preview = previewPromotion(edge, this.board.nodes, files, sourceNode);
      new PromotionModal(this.app, preview, () => applyPromotion(preview, this.plugin.repository)).open();
    } catch (error) {
      new import_obsidian6.Notice(`\u65E0\u6CD5\u751F\u6210\u5199\u5165\u9884\u89C8\uFF1A${error.message}`);
    }
  }
  removeSelection() {
    return this.requestRemove(this.selected);
  }
  removeNodes(ids) {
    this.selected = new Set(ids);
    return this.requestRemove(this.selected);
  }
  /**
   * The single entry point for Delete, Backspace, the card menu, and missing-card
   * cleanup. It never mutates anything until the confirmation resolves.
   */
  async requestRemove(ids) {
    const targetIds = ids instanceof Set ? new Set(ids) : new Set(ids != null ? ids : []);
    if (!targetIds.size) return false;
    if (!this.isWritable()) return false;
    const { nodeIds, edgeIds } = classifySelection(this.board, targetIds);
    if (!nodeIds.length && !edgeIds.length) return false;
    if (!nodeIds.length) return this.applyRemoval({ nodeIds: [], edgeIds, filePaths: [] }, []);
    const documents = await this.plugin.collectCanvasDocuments(this.boardPath, this.board);
    const plan = analyzeDelete(this.board, targetIds, documents, {
      isMissing: (path) => !this.app.vault.getAbstractFileByPath(path),
      currentPath: this.boardPath
    });
    const targets = planTrashTargets(plan);
    const listed = listRemovalTargets(plan);
    const answer = await requestDelete(this.app, {
      count: plan.nodeIds.length,
      names: listed.names,
      extra: listed.extra,
      trashDisabled: targets.disabled,
      trashReason: targets.reason
    });
    if (!answer) return false;
    if (this.editor && !await this.editor.close()) return false;
    return this.applyRemoval(plan, answer.trash ? targets.paths : []);
  }
  /**
   * Removes from a clone, persists it, and only then installs it as the live board,
   * so a failed save leaves the board and the selection exactly as they were.
   */
  async applyRemoval(plan, trashPaths) {
    var _a, _b, _c;
    const removedIds = /* @__PURE__ */ new Set([...(_a = plan.nodeIds) != null ? _a : [], ...(_b = plan.edgeIds) != null ? _b : []]);
    const done = await this.mutateBoard((next) => {
      removeFromBoard(next, removedIds);
      return true;
    }, "\u79FB\u9664\u5931\u8D25");
    if (!done) return false;
    this.selected.clear();
    this.render();
    if (!((_c = plan.nodeIds) == null ? void 0 : _c.length)) {
      new import_obsidian6.Notice(`\u5DF2\u79FB\u9664 ${plan.edgeIds.length} \u6761\u5173\u7CFB`);
      return true;
    }
    if (!trashPaths.length) {
      new import_obsidian6.Notice(`\u5DF2\u79FB\u9664 ${plan.nodeIds.length} \u9879`);
      return true;
    }
    let trashable = trashPaths;
    let blocked = [];
    try {
      const documents = await this.plugin.collectCanvasDocuments(this.boardPath, this.board);
      const recheck = revalidateTrashTargets(trashPaths, documents);
      trashable = recheck.allowed;
      blocked = recheck.blocked;
    } catch (error) {
      trashable = [];
      blocked = trashPaths.map((path) => ({ path, references: [], reason: error.message }));
    }
    if (blocked.length) {
      new import_obsidian6.Notice(`\u4EE5\u4E0B\u6E90\u6587\u4EF6\u4ECD\u88AB\u5F15\u7528\u6216\u65E0\u6CD5\u786E\u8BA4\uFF0C\u5DF2\u53EA\u4ECE\u753B\u677F\u79FB\u9664\uFF1A${blocked.map((item) => item.path).join("\u3001")}`);
    }
    if (!trashable.length) {
      new import_obsidian6.Notice(`\u5DF2\u79FB\u9664 ${plan.nodeIds.length} \u9879\uFF1B\u672A\u79FB\u5165\u5E9F\u7EB8\u7BD3\u3002`);
      return true;
    }
    const summary = summarizeTrash(await this.plugin.trashSources(trashable));
    new import_obsidian6.Notice(`\u5DF2\u79FB\u9664 ${plan.nodeIds.length} \u9879\uFF1B${summary.message}`);
    return true;
  }
  /** Collapse hides the body only: height, Markdown, relations, and search are untouched. */
  async toggleCollapsed(id) {
    if (!this.isWritable()) return false;
    return this.mutateBoard((next) => {
      const target = findCollapseTarget(next, id);
      if (!target) return false;
      setCollapsed(next, id, !(target.collapsed === true));
      return true;
    }, "\u6298\u53E0\u5931\u8D25");
  }
  reflowGroupsFor(nodeIds) {
    for (const group of this.board.nodes.filter(isGroupNode)) {
      if (group.members.some((id) => nodeIds.has(id))) reflowGroup(this.board, group.id);
    }
  }
  /** Groups are placed in front of their members so the frame always renders behind. */
  async createGroupFromSelection() {
    if (!this.isWritable()) return false;
    const grouped = new Set(this.board.nodes.filter(isGroupNode).flatMap((group2) => group2.members));
    const members = this.board.nodes.filter((node) => this.selected.has(node.id) && !isGroupNode(node) && !grouped.has(node.id));
    if (members.length < 2) return false;
    const result = await requestInput(this.app, {
      title: "\u7F16\u7EC4",
      submitLabel: "\u521B\u5EFA\u5206\u7EC4",
      fields: [{ key: "label", label: "\u5206\u7EC4\u540D\u79F0\uFF08\u53EF\u7559\u7A7A\uFF09" }]
    });
    if (!result) return false;
    let group = null;
    let failure = null;
    const done = await this.mutateBoard((next) => {
      const grouped2 = new Set(next.nodes.filter(isGroupNode).flatMap((entry) => entry.members));
      const candidates = next.nodes.filter((node) => this.selected.has(node.id) && !isGroupNode(node) && !grouped2.has(node.id));
      if (candidates.length < 2) return false;
      try {
        group = createGroup(candidates, result.label);
      } catch (error) {
        failure = error;
        return false;
      }
      next.nodes.unshift(group);
      return true;
    }, "\u7F16\u7EC4\u5931\u8D25");
    if (failure) new import_obsidian6.Notice(`\u7F16\u7EC4\u5931\u8D25\uFF1A${failure.message}`);
    if (!done) return false;
    this.selected = /* @__PURE__ */ new Set([group.id]);
    this.updateSelection();
    this.refreshTools();
    return true;
  }
  /**
   * Ungrouping only removes frames; cards, relations, and Markdown stay. Accepts one frame
   * or a whole multi-selection, and still commits exactly once.
   */
  async ungroupSelection(groupIds) {
    if (!this.isWritable()) return false;
    const ids = Array.isArray(groupIds) ? groupIds : [groupIds];
    if (!ids.length) return false;
    let removed = 0;
    const done = await this.mutateBoard((next) => {
      removed = 0;
      for (const id of ids) if (ungroup(next, id)) removed += 1;
      return removed > 0;
    }, "\u89E3\u9664\u5206\u7EC4\u5931\u8D25");
    if (!done) return false;
    this.selected = /* @__PURE__ */ new Set();
    this.updateSelection();
    this.refreshTools();
    new import_obsidian6.Notice(removed > 1 ? `\u5DF2\u89E3\u9664 ${removed} \u4E2A\u5206\u7EC4` : "\u5DF2\u89E3\u9664\u5206\u7EC4");
    return true;
  }
  /** A group frame goes through the same confirmation and never offers source deletion. */
  removeGroup(groupId) {
    return this.requestRemove([groupId]);
  }
  /**
   * The only way to change a board. The queue guarantees that the clone is taken from the
   * latest board — never from a copy made before the queue — so a colour change, collapse,
   * grouping, excerpt or import cannot resurrect a board that predates another write.
   * A mutator returning `false` aborts without writing.
   */
  async mutateBoard(mutator, failureLabel) {
    const boardPath = this.boardPath;
    try {
      return await runBoardMutation(this.boardMutations, {
        read: () => this.board,
        commit: (next) => this.installBoard(next, failureLabel, boardPath),
        before: () => this.whenGestureIdle()
      }, (next) => this.boardPath === boardPath ? mutator(next) : false);
    } catch (error) {
      if ((error == null ? void 0 : error.code) === BOARD_WRITES_PAUSED) {
        new import_obsidian6.Notice("\u753B\u677F\u6B63\u5728\u5207\u6362\u6216\u5173\u95ED\uFF0C\u672C\u6B21\u4FEE\u6539\u672A\u4FDD\u5B58");
        return false;
      }
      throw error;
    }
  }
  /** Ends a live gesture through the same path as pointercancel (geometry restored). */
  cancelActiveGesture() {
    if (!this.gesture) return false;
    this.onPointerCancel();
    return true;
  }
  /**
   * Waits for work that is queued but has not reached BoardStore yet, then for BoardStore
   * itself. Callers that must be exclusive pause the queue first, so an edit made while the
   * drain runs is refused instead of queueing behind the captured tail.
   */
  async drainBoardWrites() {
    this.cancelActiveGesture();
    await this.boardMutations.idle();
    await this.plugin.boardStore.flush();
  }
  /** A board write must never observe a half-dragged board. */
  whenGestureIdle() {
    if (!this.gesture) return Promise.resolve();
    if (!this.gestureIdle) {
      this.gestureIdle = new Promise((resolve) => {
        this.gestureIdleResolve = resolve;
      });
    }
    return this.gestureIdle;
  }
  releaseGestureIdle() {
    var _a;
    (_a = this.gestureIdleResolve) == null ? void 0 : _a.call(this);
    this.gestureIdle = null;
    this.gestureIdleResolve = null;
  }
  /** Restores a snapshot; `restoreGeometry` already resolves nodes by id. */
  restoreGeometryFrom(snapshot) {
    restoreGeometry(this.board, snapshot != null ? snapshot : []);
  }
  /** The unqueued half of a commit; only callers already inside the mutation queue use it. */
  async installBoard(next, failureLabel, boardPath = this.boardPath) {
    try {
      await this.plugin.boardStore.save(boardPath, next, { token: this });
    } catch (error) {
      new import_obsidian6.Notice(`${failureLabel}\uFF0C\u753B\u677F\u672A\u6539\u52A8\uFF1A${error.message}`);
      return false;
    }
    if (this.boardPath === boardPath) {
      this.board = next;
      this.render();
    }
    return true;
  }
  /**
   * A read-only scan plus one board mutation. Cancelling the picker changes nothing,
   * and a failed save keeps the previous board and selection.
   */
  async importReadFlow() {
    if (!this.isWritable()) return false;
    if (this.readflowButton) this.readflowButton.disabled = true;
    const scanning = new import_obsidian6.Notice("\u6B63\u5728\u626B\u63CF ReadFlow \u6458\u5F55\u2026", 0);
    let scan;
    try {
      scan = await this.plugin.scanReadFlowCandidates();
    } catch (error) {
      new import_obsidian6.Notice(`\u626B\u63CF\u5931\u8D25\uFF1A${error.message}`);
      return false;
    } finally {
      scanning.hide();
      if (this.readflowButton) this.readflowButton.disabled = false;
    }
    const existingPaths = this.board.nodes.filter(isFileNode).map((node) => node.file);
    const answer = await requestReadFlowImport(this.app, {
      candidates: scan.candidates,
      existingPaths,
      skipped: scan.skipped
    });
    if (!answer) return false;
    return this.applyReadFlowImport(answer.paths, scan);
  }
  async applyReadFlowImport(selectedPaths, scan) {
    const byPath = new Map(scan.candidates.map((candidate) => [candidate.path, candidate]));
    const chosen = (selectedPaths != null ? selectedPaths : []).map((path) => byPath.get(path)).filter(Boolean);
    if (!chosen.length) return false;
    let placed = 0;
    let alreadyOnBoard = 0;
    let missing = 0;
    const done = await this.mutateBoard((next) => {
      const live = chosen.filter((candidate) => {
        var _a;
        return ((_a = this.app.vault.getAbstractFileByPath(candidate.path)) == null ? void 0 : _a.extension) === "md";
      });
      missing = chosen.length - live.length;
      const onBoard = new Set(next.nodes.filter(isFileNode).map((node) => node.file));
      const candidates = live.filter((candidate) => !onBoard.has(candidate.path));
      alreadyOnBoard = live.length - candidates.length;
      if (!candidates.length) return false;
      const placements = layoutReadFlowCandidates(candidates, next.nodes);
      for (const { candidate, point: point2 } of placements) next.nodes.push(createFileNode(candidate.path, point2));
      placed = placements.length;
      return true;
    }, "\u5BFC\u5165\u5931\u8D25");
    if (!done) {
      new import_obsidian6.Notice(`\u6CA1\u6709\u65B0\u589E\u5361\u7247\uFF1A\u5DF2\u5B58\u5728 ${alreadyOnBoard} \u4E2A\uFF0C\u5931\u8D25 ${missing} \u4E2A\u3002`);
      return false;
    }
    new import_obsidian6.Notice(`\u5DF2\u52A0\u5165 ${placed} \u5F20\u5361\u7247\uFF1B\u5DF2\u5B58\u5728 ${alreadyOnBoard} \u4E2A\uFF1B\u8DF3\u8FC7 ${missing + scan.skipped.length} \u4E2A\u3002`);
    return true;
  }
  nodeName(id) {
    const node = this.board.nodes.find((candidate) => candidate.id === id);
    return node ? cardLabel(node) || id : id;
  }
  /** Re-targets this surface at another board file (embedded + openFullView reuse). */
  async setBoardPath(path) {
    if (!path || path === this.boardPath) return false;
    return this.lifecycles(() => this.performSetBoardPath(path));
  }
  async performSetBoardPath(path) {
    if (!path || path === this.boardPath) return false;
    if (this.editor && !await this.editor.close()) return false;
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
      const next = await this.plugin.boardStore.load(path);
      this.releaseBoardWriter(this.boardPath);
      this.boardPath = path;
      this.board = next;
      this.selected.clear();
      this.search = "";
      this.loadError = null;
      this.acquireBoardWriter();
      this.render();
      return true;
    } finally {
      this.boardMutations.resume(pause);
    }
  }
  /** Flushes pending board writes without closing the surface. */
  flush() {
    return this.drainBoardWrites();
  }
  /** Tears down the embedded surface: editor, board writes, listeners, and its DOM. */
  async destroy() {
    var _a, _b;
    await this.prepareShutdown();
    for (const cleanup of this._domCleanups) cleanup();
    this._domCleanups = [];
    if (this.embedded) (_b = (_a = this.contentEl) == null ? void 0 : _a.remove) == null ? void 0 : _b.call(_a);
  }
  /** Opens the current board in a full Knowledge Canvas leaf. */
  async openFullView() {
    return this.lifecycles(() => this.performOpenFullView());
  }
  async performOpenFullView() {
    if (this.editor && !await this.editor.close()) {
      new import_obsidian6.Notice("\u6D6E\u52A8\u7F16\u8F91\u5668\u4ECD\u6709\u672A\u4FDD\u5B58\u5185\u5BB9\uFF0C\u5DF2\u53D6\u6D88\u6253\u5F00\u5168\u5C4F");
      return false;
    }
    const pause = this.boardMutations.pause();
    try {
      await this.drainBoardWrites();
      await this.plugin.setLastBoardPath(this.boardPath);
      this.releaseBoardWriter();
      this.render();
      try {
        const view = await this.plugin.activate();
        if (view && view !== this && view.setBoardPath) await view.setBoardPath(this.boardPath);
        return view;
      } catch (error) {
        this.acquireBoardWriter();
        this.render();
        throw error;
      }
    } finally {
      this.boardMutations.resume(pause);
    }
  }
};

// src/embedded-board-controller.js
var EmbeddedBoardController = class {
  constructor(plugin, host, { boardPath, compact = true } = {}) {
    this.plugin = plugin;
    this.host = host;
    this.destroyed = false;
    this.view = new KnowledgeCanvasView(
      createEmbeddedLeaf(plugin.app, host),
      plugin,
      { embedded: true, compact, boardPath }
    );
  }
  async mount() {
    await this.view.attach();
    return this;
  }
  get boardPath() {
    return this.view.boardPath;
  }
  setBoardPath(path) {
    return this.view.setBoardPath(path);
  }
  flush() {
    return this.view.flush();
  }
  openFullView() {
    return this.view.openFullView();
  }
  handleRename(file, oldPath) {
    return this.view.handleRename(file, oldPath);
  }
  /**
   * Tears the embedded surface down. `destroyed` flips only after the view has fully
   * released its writer and flushed, so a failed teardown (an unsaved floating editor, a
   * failed flush) leaves this controller registered and retryable instead of leaking the
   * write token forever. On success it removes itself from the plugin's live set.
   */
  async destroy() {
    var _a;
    if (this.destroyed) return;
    await this.view.destroy();
    this.destroyed = true;
    (_a = this.plugin.embeddedControllers) == null ? void 0 : _a.delete(this);
  }
};

// src/embedded-registry.js
async function mountEmbeddedController(set, controller, mount = () => controller.mount()) {
  var _a, _b;
  try {
    await mount();
  } catch (error) {
    try {
      await controller.destroy();
    } catch (teardownError) {
      (_a = set == null ? void 0 : set.add) == null ? void 0 : _a.call(set, controller);
      controller.teardownError = teardownError;
    }
    throw error;
  }
  (_b = set == null ? void 0 : set.add) == null ? void 0 : _b.call(set, controller);
  return controller;
}
async function destroyEmbeddedControllers(set) {
  const failures = [];
  for (const controller of [...set != null ? set : []]) {
    try {
      await controller.destroy();
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

// src/settings-tab.js
var import_obsidian7 = require("obsidian");
var STATUS_CLASS = {
  exists: "is-ok",
  create: "is-info",
  default: "is-muted"
};
function describe(preview) {
  const parts = [];
  if (preview.status === "default") parts.push(`\u7559\u7A7A\u65F6\u4F7F\u7528\u9ED8\u8BA4\u76EE\u5F55\uFF1A${DEFAULT_SETTINGS.noteFolder}`);
  else if (preview.status === "exists") parts.push(`\u6587\u4EF6\u5939\u5DF2\u5B58\u5728\uFF1A${preview.folder}`);
  else parts.push(`\u6587\u4EF6\u5939\u5C1A\u4E0D\u5B58\u5728\uFF0C\u9996\u6B21\u65B0\u5EFA\u4FBF\u5229\u8D34\u65F6\u4F1A\u81EA\u52A8\u9010\u7EA7\u521B\u5EFA\uFF1A${preview.folder}`);
  if (preview.rewritten) parts.push(`\uFF08\u5DF2\u89C4\u8303\u5316\u4E3A ${preview.folder}\uFF09`);
  return parts.join(" ");
}
var KnowledgeCanvasSettingTab = class extends import_obsidian7.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Knowledge Canvas \u8BBE\u7F6E" });
    let hintEl = null;
    const renderHint = (value) => {
      var _a;
      if (!hintEl) return;
      const folder = normalizeNoteFolder(value);
      const exists = Boolean(this.app.vault.getAbstractFileByPath(folder));
      const preview = noteFolderPreview(value, { exists });
      hintEl.setText(describe(preview));
      hintEl.className = `kc-setting-hint ${(_a = STATUS_CLASS[preview.status]) != null ? _a : ""}`.trim();
    };
    new import_obsidian7.Setting(containerEl).setName("\u4FBF\u5229\u8D34\u5B58\u653E\u6587\u4EF6\u5939").setDesc("\u65B0\u5EFA\u4FBF\u5229\u8D34\u65F6\u751F\u6210\u7684 Markdown \u6587\u4EF6\u653E\u5728\u8FD9\u4E2A\u76EE\u5F55\u4E0B\u3002\u6539\u5B8C\u7ACB\u5373\u751F\u6548\uFF0C\u4E0D\u7528\u91CD\u542F Obsidian\u3002").addText((text) => {
      text.setPlaceholder(DEFAULT_SETTINGS.noteFolder);
      text.setValue(this.plugin.settings.noteFolder);
      text.inputEl.addClass("kc-setting-folder-input");
      text.onChange(async (value) => {
        const folder = normalizeNoteFolder(value);
        if (folder !== this.plugin.settings.noteFolder) {
          this.plugin.settings.noteFolder = folder;
          await this.plugin.saveSettings();
        }
        renderHint(value);
      });
    }).addExtraButton((button) => button.setIcon("rotate-ccw").setTooltip("\u6062\u590D\u9ED8\u8BA4\u6587\u4EF6\u5939").onClick(async () => {
      this.plugin.settings.noteFolder = DEFAULT_SETTINGS.noteFolder;
      await this.plugin.saveSettings();
      this.display();
    }));
    hintEl = containerEl.createDiv({ cls: "kc-setting-hint" });
    renderHint(this.plugin.settings.noteFolder);
    new import_obsidian7.Setting(containerEl).setName("\u542F\u7528 ReadFlow \u96C6\u6210").setDesc("\u663E\u793A\u300C\u5BFC\u5165 ReadFlow\u300D\u5165\u53E3\uFF0C\u5E76\u5141\u8BB8 ReadFlow \u4E3A\u6BCF\u672C\u4E66\u5D4C\u5165\u72EC\u7ACB\u77E5\u8BC6\u753B\u677F\u3002\u5173\u95ED\u540E\u4E0D\u5220\u9664\u4EFB\u4F55\u5DF2\u5BFC\u5165\u7684\u6570\u636E\u3002").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.readFlowIntegrationEnabled);
      toggle.onChange(async (value) => {
        var _a, _b;
        const previous = this.plugin.settings.readFlowIntegrationEnabled;
        this.plugin.settings.readFlowIntegrationEnabled = value;
        try {
          await this.plugin.saveSettings();
          this.plugin.refreshOpenViews();
          await ((_b = (_a = this.plugin).onReadFlowIntegrationChange) == null ? void 0 : _b.call(_a, value));
        } catch (error) {
          this.plugin.settings.readFlowIntegrationEnabled = previous;
          toggle.setValue(previous);
          new import_obsidian7.Notice(`\u4FDD\u5B58\u5931\u8D25\uFF1A${error.message}`);
        }
      });
    });
  }
};

// src/main.js
var KnowledgeCanvasPlugin = class extends import_obsidian8.Plugin {
  async onload() {
    this.settings = normalizeSettings(null);
    await this.loadSettings();
    this.apiVersion = EMBEDDED_API_VERSION;
    this.repository = new MarkdownRepository(this.app.vault, this.settings.noteFolder);
    this.boardStore = new BoardStore({
      read: async (path) => this.app.vault.read(this.requireFile(path)),
      process: async (path, updater) => this.app.vault.process(this.requireFile(path), updater)
    });
    this.embeddedControllers = /* @__PURE__ */ new Set();
    this.readFlowIntegrationListeners = /* @__PURE__ */ new Set();
    this.readFlowEnsureQueues = /* @__PURE__ */ new Map();
    this.renameSuppressions = /* @__PURE__ */ new Set();
    this.addSettingTab(new KnowledgeCanvasSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_KNOWLEDGE_CANVAS, (leaf) => new KnowledgeCanvasView(leaf, this));
    this.addRibbonIcon("layout-dashboard", "\u6253\u5F00\u77E5\u8BC6\u753B\u677F", () => this.activate());
    this.addCommand({ id: "open-board", name: "Open board", callback: () => this.activate() });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file.extension !== "md") return;
      menu.addItem((item) => item.setTitle("\u52A0\u5165\u77E5\u8BC6\u753B\u677F").setIcon("layout-dashboard").onClick(async () => {
        const view = await this.activate();
        await view.addFile(file, { x: 160 + view.board.nodes.length * 28, y: 120 + view.board.nodes.length * 20 });
      }));
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.onFileRename(file, oldPath)));
  }
  async onunload() {
    const views = this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS).map((leaf) => leaf.view);
    try {
      await Promise.all([
        ...views.map((view) => view.prepareShutdown()),
        ...[...this.embeddedControllers].map((controller) => controller.destroy())
      ]);
      await Promise.all([this.boardStore.flush(), this.repository.flush()]);
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS);
    } catch (error) {
      new import_obsidian8.Notice(`\u77E5\u8BC6\u753B\u677F\u4ECD\u6709\u672A\u4FDD\u5B58\u5185\u5BB9\uFF1A${error.message}`);
      throw error;
    }
  }
  async ensureBoard() {
    if (this.app.vault.getAbstractFileByPath(this.boardPath)) return;
    await this.ensureFolder(this.boardPath.split("/").slice(0, -1).join("/"));
    await this.app.vault.create(this.boardPath, JSON.stringify(createBoard(), null, 2));
  }
  async ensureFolder(path) {
    if (!path) return;
    const parts = path.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      const folder = parts.slice(0, index).join("/");
      if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    }
  }
  /** Every managed board plus the legacy default, straight from the file system. */
  listBoards() {
    const paths = this.app.vault.getFiles().filter((file) => file.extension === "canvas").map((file) => file.path);
    return listManagedBoards(paths);
  }
  /**
   * Every board background maintenance must sweep: managed workspaces plus ReadFlow book
   * canvases. Distinct from `listBoards()` so hiding ReadFlow boards from the switcher
   * never stops a Markdown rename from reaching them.
   */
  listMaintainedBoards() {
    const paths = this.app.vault.getFiles().filter((file) => file.extension === "canvas").map((file) => file.path);
    return [...listManagedBoards(paths), ...listReadFlowBoards(paths)];
  }
  /**
   * Creates a board. With `createNoteFolder` the board also gets a canvas-local note
   * folder under the global one and records it in `kcMeta`. The folder is created before
   * the board so a failed folder creation cannot leave a half-valid board behind.
   */
  async createBoardFile(name, { createNoteFolder = false } = {}) {
    const path = boardPathForName(name);
    if (this.app.vault.getAbstractFileByPath(path)) throw new Error(`\u753B\u5E03\u5DF2\u5B58\u5728\uFF1A${path}`);
    await this.ensureFolder(BOARD_FOLDER);
    const board = createBoard();
    if (createNoteFolder) {
      const folder = normalizeNoteFolder(`${this.settings.noteFolder}/${name}`);
      await this.repository.ensureFolder(folder);
      board.kcMeta = createBoardMeta({ noteFolder: folder });
    }
    await this.app.vault.create(path, JSON.stringify(board, null, 2));
    return path;
  }
  /** Every Vault `.canvas`, for rename/delete validation against the live file system. */
  listCanvasPaths() {
    return this.app.vault.getFiles().filter((file) => file.extension === "canvas").map((file) => file.path);
  }
  /** Every Vault file, for the dedicated-folder safety analysis. */
  listFilePaths() {
    return this.app.vault.getFiles().map((file) => file.path);
  }
  /** Every Vault folder, for target-conflict checks. */
  listFolderPaths() {
    return this.app.vault.getAllLoadedFiles().filter((item) => item instanceof import_obsidian8.TFolder).map((folder) => folder.path).filter(Boolean);
  }
  /**
   * Renames a managed board, optionally moving the note folder that belongs to it.
   *
   * The order is the one the design fixes: verify against the live Vault → rename the folder
   * → rewrite this board's metadata and references → repoint every other board that pointed
   * into the folder → rename the canvas → update settings and live surfaces. A failure after
   * the first move rolls back what moved; a rollback that also fails reports both paths
   * instead of pretending the rename succeeded.
   */
  async renameBoard(plan, { board = null, token = null } = {}) {
    var _a;
    const manage = canManageBoard(plan == null ? void 0 : plan.fromPath);
    if (!manage.allowed) throw new Error(manage.reason);
    if (!((_a = this.app.vault.getAbstractFileByPath(plan.fromPath)) == null ? void 0 : _a.stat)) throw new Error("\u753B\u5E03\u4E0D\u5B58\u5728");
    if (this.app.vault.getAbstractFileByPath(plan.toPath)) throw new Error(`\u753B\u5E03\u5DF2\u5B58\u5728\uFF1A${plan.toPath}`);
    if (plan.noteFolder && this.app.vault.getAbstractFileByPath(plan.noteFolder.to)) {
      throw new Error(`\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\u5DF2\u5B58\u5728\uFF1A${plan.noteFolder.to}`);
    }
    const nextBoard = board ? applyBoardRename(board, plan) : board;
    let folderMoved = false;
    let boardSaved = false;
    const suppression = plan.noteFolder && token ? { folder: plan.noteFolder.from, view: token } : null;
    if (suppression) this.renameSuppressions.add(suppression);
    try {
      if (plan.noteFolder) {
        const folder = this.app.vault.getAbstractFileByPath(plan.noteFolder.from);
        if (folder) {
          await this.app.fileManager.renameFile(folder, plan.noteFolder.to);
          folderMoved = true;
        }
      }
      if (nextBoard && nextBoard !== board) {
        await this.boardStore.save(plan.fromPath, nextBoard, { token });
        boardSaved = true;
      }
      if (folderMoved) await this.repointBoardsForFolder(plan.noteFolder, plan.fromPath);
      await this.app.fileManager.renameFile(
        this.app.vault.getAbstractFileByPath(plan.fromPath),
        plan.toPath
      );
    } catch (error) {
      const recovery = [];
      if (boardSaved) {
        try {
          await this.boardStore.save(plan.fromPath, board, { token });
        } catch (restoreError) {
          recovery.push(`\u753B\u5E03\u5185\u5BB9\u6062\u590D\u5931\u8D25\uFF1A${restoreError.message}`);
        }
      }
      if (folderMoved) {
        try {
          await this.app.fileManager.renameFile(
            this.app.vault.getAbstractFileByPath(plan.noteFolder.to),
            plan.noteFolder.from
          );
        } catch (restoreError) {
          recovery.push(`\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\u5DF2\u91CD\u547D\u540D\u4E3A ${plan.noteFolder.to}\uFF0C\u6062\u590D\u5931\u8D25\uFF1A${restoreError.message}`);
        }
      }
      throw new Error(recovery.length ? `${error.message}\uFF08${recovery.join("\uFF1B")}\uFF09` : error.message);
    } finally {
      if (suppression) this.renameSuppressions.delete(suppression);
    }
    for (const controller of [...this.embeddedControllers]) {
      if (controller.boardPath !== plan.fromPath) continue;
      try {
        await controller.setBoardPath(plan.toPath);
      } catch (error) {
        console.error("\u77E5\u8BC6\u753B\u677F\uFF1A\u91CD\u547D\u540D\u540E\u672A\u80FD\u66F4\u65B0\u5D4C\u5165\u753B\u677F", error);
      }
    }
    const bindings = updateReadFlowBindings(this.settings.readFlowBindings, { from: plan.fromPath, to: plan.toPath });
    if (bindings.changed) this.settings.readFlowBindings = bindings.bindings;
    if (this.settings.lastBoardPath === plan.fromPath) await this.setLastBoardPath(plan.toPath);
    else await this.saveSettings();
    return { path: plan.toPath, name: plan.name, board: nextBoard, folderMoved };
  }
  /**
   * Markdown that lived in the renamed folder keeps its identity only through the paths other
   * boards store, so they follow the move instead of turning into missing cards. Open views
   * and embedded surfaces are skipped: they own their writer and receive the Vault's own
   * rename events.
   */
  async repointBoardsForFolder({ from, to }, exceptPath) {
    var _a;
    const openInViews = /* @__PURE__ */ new Set();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)) {
      if ((_a = leaf.view) == null ? void 0 : _a.boardPath) openInViews.add(leaf.view.boardPath);
    }
    for (const controller of this.embeddedControllers) openInViews.add(controller.boardPath);
    const failures = [];
    for (const board of this.listMaintainedBoards()) {
      if (board.path === exceptPath || openInViews.has(board.path) || !this.isCanvasFile(board.path)) continue;
      try {
        const data = await this.boardStore.load(board.path);
        const updated = rewriteFolderReferences(data, from, to);
        if (updated !== data) await this.boardStore.save(board.path, updated);
      } catch (error) {
        failures.push(`${board.path}\uFF1A${error.message}`);
      }
    }
    if (failures.length) new import_obsidian8.Notice(`\u90E8\u5206\u753B\u5E03\u672A\u80FD\u66F4\u65B0\u6587\u4EF6\u8DEF\u5F84\uFF1A${failures.join("\uFF1B")}`);
  }
  /**
   * Trashes a managed board and, when the caller proved it safe, its note folder. The canvas
   * goes first: a folder failure must not leave the user with deleted notes and a live board.
   * A live embedded surface on that board is torn down first, or its next save would
   * recreate the file this method just deleted.
   */
  async deleteBoard(path, { deleteNoteFolder = null } = {}) {
    const manage = canManageBoard(path);
    if (!manage.allowed) throw new Error(manage.reason);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file == null ? void 0 : file.stat)) throw new Error("\u753B\u5E03\u4E0D\u5B58\u5728");
    for (const controller of [...this.embeddedControllers]) {
      if (controller.boardPath !== path) continue;
      try {
        await controller.destroy();
      } catch (error) {
        throw new Error(`\u5D4C\u5165\u753B\u677F\u4ECD\u6709\u672A\u4FDD\u5B58\u5185\u5BB9\uFF0C\u5DF2\u53D6\u6D88\u5220\u9664\uFF1A${error.message}`);
      }
    }
    await this.app.fileManager.trashFile(file);
    let folder = null;
    if (deleteNoteFolder) {
      const target = this.app.vault.getAbstractFileByPath(deleteNoteFolder);
      if (target) {
        try {
          await this.app.fileManager.trashFile(target);
          folder = { path: deleteNoteFolder, ok: true };
        } catch (error) {
          folder = { path: deleteNoteFolder, ok: false, reason: error.message };
        }
      }
    }
    const bindings = updateReadFlowBindings(this.settings.readFlowBindings, { from: path, to: null });
    if (bindings.changed) this.settings.readFlowBindings = bindings.bindings;
    await this.setLastBoardPath(DEFAULT_BOARD_PATH);
    await this.ensureBoard();
    const parts = ["\u753B\u5E03\u5DF2\u5220\u9664"];
    if (folder == null ? void 0 : folder.ok) parts.push(`\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\u5DF2\u5220\u9664\uFF1A${folder.path}`);
    if (folder && !folder.ok) parts.push(`\u4E13\u5C5E\u7B14\u8BB0\u6587\u4EF6\u5939\u672A\u80FD\u5220\u9664\uFF1A${folder.path}\uFF08${folder.reason}\uFF09`);
    return { path, folder, message: parts.join("\uFF1B") };
  }
  async setLastBoardPath(path) {
    this.boardPath = path;
    this.settings.lastBoardPath = path;
    await this.saveSettings();
    return path;
  }
  /**
   * ReadFlow integration gate. A missing field is treated as enabled, so existing users
   * are never silently cut off before the setting exists.
   */
  isReadFlowIntegrationEnabled() {
    var _a;
    return ((_a = this.settings) == null ? void 0 : _a.readFlowIntegrationEnabled) !== false;
  }
  /**
   * Ensures a dedicated board exists for one ReadFlow book. The board is created under
   * `Canvas/Knowledge Canvas/ReadFlow/` and seeded with the book's highlights on first
   * creation; a board that already exists gains only the highlight cards it is missing, so
   * highlights synced later still arrive without moving or overwriting anything the user
   * edited. ReadFlow never writes the `.canvas` itself — this is the only path that
   * creates or updates it.
   */
  async ensureReadFlowBoard({ bookId, title, highlightPaths, boardPath } = {}) {
    if (!this.isReadFlowIntegrationEnabled()) return null;
    const path = boardPath != null ? boardPath : this.resolveReadFlowBoardPath({ bookId, title });
    return serializeByKey(
      this.readFlowEnsureQueues,
      path,
      () => ensureReadFlowBoardAt({
        path,
        highlightPaths,
        vault: this.app.vault,
        boardStore: this.boardStore,
        ensureFolder: (folder) => this.ensureFolder(folder)
      })
    );
  }
  /**
   * The board a ReadFlow book should use: the user's persisted binding when it still points
   * at a real `.canvas`, otherwise the stable default path derived from the book id. A title
   * change therefore never strands the board — the id, not the title, is the key.
   */
  resolveReadFlowBoardPath({ bookId, title } = {}) {
    var _a, _b;
    const binding = (_b = (_a = this.settings) == null ? void 0 : _a.readFlowBindings) == null ? void 0 : _b[bookId];
    if (binding && this.isCanvasFile(binding)) return binding;
    return defaultReadFlowBoardPath({ bookId, title });
  }
  /**
   * Persists (or clears) the canvas a book is bound to. Pass `null` to restore the default
   * board for the book. The target must be an existing `.canvas`, so a stale or foreign path
   * is rejected instead of being written into settings.
   */
  async bindReadFlowBoard(bookId, boardPath) {
    var _a;
    if (!this.isReadFlowIntegrationEnabled()) return null;
    if (!bookId) throw new Error("ReadFlow book id is required");
    const bindings = { ...(_a = this.settings.readFlowBindings) != null ? _a : {} };
    if (boardPath == null || boardPath === "") {
      delete bindings[bookId];
    } else {
      if (!boardPath.toLowerCase().endsWith(".canvas")) throw new Error("\u7ED1\u5B9A\u7684\u76EE\u6807\u5FC5\u987B\u662F .canvas \u6587\u4EF6");
      if (!this.isCanvasFile(boardPath)) throw new Error("\u76EE\u6807\u753B\u5E03\u4E0D\u5B58\u5728");
      bindings[bookId] = boardPath;
    }
    this.settings.readFlowBindings = bindings;
    await this.saveSettings();
    return boardPath == null || boardPath === "" ? null : boardPath;
  }
  /** Every Vault `.canvas`, for ReadFlow's binding picker. Read-only. */
  listCanvasFiles() {
    return this.app.vault.getFiles().filter((file) => file.extension === "canvas").map((file) => file.path);
  }
  /**
   * Mounts an embedded board surface into a foreign host element.
   *
   * The controller is registered only after the mount resolves. A mount that throws is
   * destroyed here so its document listeners and writer token are released; the caller
   * receives the original error and never a half-mounted surface it cannot tear down.
   */
  async mountEmbeddedBoard(host, { boardPath, compact = true } = {}) {
    if (!this.isReadFlowIntegrationEnabled()) return null;
    if (!host || !boardPath) throw new Error("mountEmbeddedBoard requires a host element and a boardPath");
    const controller = new EmbeddedBoardController(this, host, { boardPath, compact });
    return mountEmbeddedController(this.embeddedControllers, controller);
  }
  /** Registers a callback fired whenever the ReadFlow integration toggle changes. */
  registerReadFlowIntegrationListener(listener) {
    if (typeof listener !== "function") return () => {
    };
    this.readFlowIntegrationListeners.add(listener);
    return () => this.readFlowIntegrationListeners.delete(listener);
  }
  /**
   * Reacts to a ReadFlow integration toggle. Disabling tears down every live embedded
   * surface immediately and tells ReadFlow to fall back to its own knowledge view. Each
   * teardown is awaited so a surface that cannot shut down (an unsaved editor, a failed
   * flush) stays registered and retryable instead of silently leaking its write token.
   */
  async onReadFlowIntegrationChange(enabled) {
    if (!enabled) {
      const failures = await destroyEmbeddedControllers(this.embeddedControllers);
      if (failures.length) console.error("\u77E5\u8BC6\u753B\u677F\uFF1A\u90E8\u5206\u5D4C\u5165\u9762\u677F\u672A\u80FD\u5173\u95ED", failures);
    }
    for (const listener of this.readFlowIntegrationListeners) {
      try {
        await listener(enabled);
      } catch (error) {
        console.error("ReadFlow integration listener failed", error);
      }
    }
  }
  /**
   * Every Vault `.canvas`, read-only, for cross-canvas reference safety. A canvas that
   * cannot be read or understood is reported as an error so the caller stays conservative.
   * Nothing outside the current board is ever written.
   */
  async collectCanvasDocuments(currentPath, currentBoard) {
    const documents = [{ path: currentPath, board: currentBoard }];
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== "canvas" || file.path === currentPath) continue;
      try {
        documents.push({ path: file.path, nodes: extractCanvasFileReferences(await this.app.vault.cachedRead(file)) });
      } catch (error) {
        documents.push({ path: file.path, error });
      }
    }
    return documents;
  }
  /**
   * Read-only scan of the Vault's Atomic Markdown. Only the Metadata Cache and the file
   * text are read; ReadFlow's plugin data, cookies, and sync state are never touched.
   * A file that cannot be read is recorded as skipped instead of blocking the batch.
   */
  async scanReadFlowCandidates() {
    var _a;
    const candidates = [];
    const skipped = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
      if ((frontmatter == null ? void 0 : frontmatter.type) !== "highlight") continue;
      try {
        const candidate = toReadFlowCandidate(file, await this.app.vault.cachedRead(file), frontmatter);
        if (candidate) candidates.push(candidate);
        else skipped.push({ path: file.path, reason: "\u4E0D\u662F ReadFlow \u6458\u5F55" });
      } catch (error) {
        skipped.push({ path: file.path, reason: error.message });
      }
    }
    return { candidates, skipped };
  }
  /** Obsidian Trash only, one file at a time, with an exact per-file outcome. */
  async trashSources(paths) {
    const results = [];
    for (const path of paths) {
      try {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file) throw new Error("\u6587\u4EF6\u5DF2\u4E0D\u5B58\u5728");
        await this.app.fileManager.trashFile(file);
        results.push({ path, ok: true });
      } catch (error) {
        results.push({ path, ok: false, reason: error.message });
      }
    }
    return results;
  }
  isCanvasFile(path) {
    var _a;
    return ((_a = this.app.vault.getAbstractFileByPath(path)) == null ? void 0 : _a.extension) === "canvas";
  }
  /**
   * A remembered board is only honoured when it is the legacy default or lives in the
   * managed folder, and when the file is still there. Anything else falls back safely.
   */
  resolveBoardPath(candidate) {
    if (candidate && isAllowedBoardPath(candidate) && this.isCanvasFile(candidate)) return candidate;
    return DEFAULT_BOARD_PATH;
  }
  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
    this.boardPath = this.resolveBoardPath(this.settings.lastBoardPath);
    return this.settings;
  }
  async saveSettings() {
    await this.saveData(this.settings);
    if (this.repository) this.repository.setNoteFolder(this.settings.noteFolder);
    return this.settings;
  }
  requireFile(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file == null ? void 0 : file.stat)) throw new Error(`File not found: ${path}`);
    return file;
  }
  async activate() {
    await this.ensureBoard();
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_KNOWLEDGE_CANVAS, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    return leaf.view;
  }
  /** Re-renders every open canvas so a just-saved setting takes effect immediately. */
  refreshOpenViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)) leaf.view.render();
  }
  /**
   * Renaming a Markdown file has to fan out to every managed board, not just the
   * open one. A damaged board reports its reason without stopping the others and
   * without being overwritten.
   */
  async onFileRename(file, oldPath) {
    if (!oldPath.toLowerCase().endsWith(".md") || !file.path.toLowerCase().endsWith(".md")) return;
    const suppressed = (view) => [...this.renameSuppressions].some((entry) => entry.view === view && isInsideFolderPath(oldPath, entry.folder));
    const failures = [];
    const openInViews = /* @__PURE__ */ new Set();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KNOWLEDGE_CANVAS)) {
      const view = leaf.view;
      openInViews.add(view.boardPath);
      if (suppressed(view)) continue;
      try {
        await view.handleRename(file, oldPath);
      } catch (error) {
        failures.push(`${view.boardPath}\uFF1A${error.message}`);
      }
    }
    const handledByControllers = /* @__PURE__ */ new Set();
    for (const controller of [...this.embeddedControllers]) {
      const boardPath = controller.boardPath;
      handledByControllers.add(boardPath);
      try {
        await controller.handleRename(file, oldPath);
      } catch (error) {
        failures.push(`${boardPath}\uFF1A${error.message}`);
      }
    }
    for (const board of this.listMaintainedBoards()) {
      if (openInViews.has(board.path) || handledByControllers.has(board.path) || !this.isCanvasFile(board.path)) continue;
      try {
        const data = await this.boardStore.load(board.path);
        if (updateFilePath(data, oldPath, file.path)) await this.boardStore.save(board.path, data);
      } catch (error) {
        failures.push(`${board.path}\uFF1A${error.message}`);
      }
    }
    if (failures.length) new import_obsidian8.Notice(`\u90E8\u5206\u753B\u5E03\u672A\u80FD\u66F4\u65B0\u6587\u4EF6\u8DEF\u5F84\uFF1A${failures.join("\uFF1B")}`);
  }
};

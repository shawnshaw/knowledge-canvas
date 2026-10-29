/**
 * Pure state for the collapsible "知识种子＋" tool entry in the canvas' top-left corner.
 * The collapsed default belongs to the view only; nothing here is persisted.
 */

/** The board actions that only appear once the entry is expanded. */
export const TOOL_ENTRY_BASE_ACTIONS = Object.freeze(['sticky', 'importFile', 'importFolder', 'layout']);

/**
 * The top bar's board cluster, in the order the design fixes it: the switcher, then New Board,
 * then the ReadFlow import as a secondary action. Keeping the import here is what stops the
 * expanded tool entry from offering a second, duplicate entry point.
 */
export const TOPBAR_BOARD_ACTIONS = Object.freeze(['boardSelect', 'newBoard', 'importReadFlow']);

export function createToolEntryState() {
  return { expanded: false };
}

/** Unknown events return the same state object so the caller can skip a repaint. */
export function reduceToolEntry(state, event) {
  switch (event?.type) {
    case 'toggle': return { expanded: !state.expanded };
    case 'expand': return { expanded: true };
    case 'collapse': return { expanded: false };
    default: return state;
  }
}

/** Everything the DOM needs, so the collapsed and expanded rules live in one place. */
export function toolEntryView(state) {
  const expanded = state?.expanded === true;
  return {
    expanded,
    icon: expanded ? 'x' : 'plus',
    ariaLabel: expanded ? '收起画板工具' : '展开画板工具',
    ariaExpanded: String(expanded),
    visibleActions: expanded ? [...TOOL_ENTRY_BASE_ACTIONS] : [],
  };
}

/**
 * 顶栏「重载」菜单的动作清单与守卫逻辑。纯函数，不依赖 obsidian，方便单测。
 */

export const RELOAD_ACTIONS = [
  { id: 'board', title: '重载画板数据', icon: 'refresh-cw' },
  { id: 'plugin', title: '重载插件代码', icon: 'rotate-cw' },
];

export function findReloadAction(id) {
  return RELOAD_ACTIONS.find((action) => action.id === id) ?? null;
}

/**
 * 判断某个动作当前能不能执行。不能执行时附带给用户看的原因。
 * 重载插件会走 onunload，浮动编辑器有未保存内容时那里会直接抛错，
 * 所以提前拦下并说清楚，而不是让用户看到一个失败 Notice。
 */
export function resolveReloadAction(id, { editorDirty = false } = {}) {
  const action = findReloadAction(id);
  if (!action) return { ok: false, reason: `未知的重载动作：${id}` };
  if (action.id === 'plugin' && editorDirty) {
    return { ok: false, reason: '浮动编辑器还有未保存内容，先保存或关闭它再重载插件' };
  }
  return { ok: true, action };
}

/**
 * 执行动作。handlers 以 action.id 为键；同步抛错和 reject 都收敛成 { ok: false, reason }。
 */
export async function runReloadAction(id, context, handlers) {
  const resolved = resolveReloadAction(id, context);
  if (!resolved.ok) return resolved;
  try {
    await handlers[resolved.action.id]();
    return resolved;
  } catch (error) {
    return { ok: false, reason: error?.message ?? String(error) };
  }
}

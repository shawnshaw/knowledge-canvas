/**
 * What a mounted canvas surface may write.
 *
 * The embedded ReadFlow surface is a first-class renderer, so "read-only" is decided in
 * one place instead of being re-derived by every command: without the single-writer token
 * (another surface owns the board) or with a failed load, nothing may be written.
 */

export function canMutateBoard({ writerOwned, loadError } = {}) {
  return writerOwned === true && !loadError;
}

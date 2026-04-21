import isObject from "./isObject";

// Walk a pair of typeDef objects in parallel and collect every path where
// the later value overrides an incompatible earlier one. We only flag
// *structural* conflicts — cases where later-wins silently drops user
// intent — not the normal deep-merge case where two objects share a key
// and both values are themselves objects (those get merged, not dropped).
//
// A conflict is reported when:
//   - both sides define the same key,
//   - the values are not both plain objects, and
//   - the values are not deep-equal.
//
// The array-override case (later array replaces earlier array) is treated
// as a conflict because `merge.ts` documents arrays as "override" — the
// earlier list is silently lost.
const detectConflictsAt = (
  prev: unknown,
  next: unknown,
  path: string[],
  out: string[]
): void => {
  if (isObject(prev) && isObject(next)) {
    for (const key of Object.keys(next)) {
      if (key in prev) {
        detectConflictsAt(prev[key], next[key], [...path, key], out);
      }
    }
    return;
  }

  if (deepEqual(prev, next)) return;

  out.push(path.join("."));
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (isObject(a) && isObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      if (!(k in b)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
};

/**
 * Walk a list of typeDef objects (as passed to `combineTypeDefs`) and
 * return every dotted path where a later item's value overrides an
 * earlier one with an incompatible value. Used by `combineTypeDefs` to
 * surface a dev-only warning so schema composition bugs (two files both
 * declaring `Query.getPost` with different shapes) don't silently collapse
 * to whichever one merged last.
 */
const detectConflicts = (items: readonly unknown[]): string[] => {
  const conflicts: string[] = [];
  const accumulator: Record<string, unknown> = {};
  for (const item of items) {
    if (!isObject(item)) continue;
    detectConflictsAt(accumulator, item, [], conflicts);
    // Merge `item` into the accumulator shallowly — we only need the
    // previously-seen shape for comparison, not a full deep merge. This
    // keeps the detector independent of `merge.ts`.
    for (const key of Object.keys(item)) {
      if (isObject(accumulator[key]) && isObject(item[key])) {
        accumulator[key] = shallowDeepMerge(accumulator[key], item[key]);
      } else {
        accumulator[key] = item[key];
      }
    }
  }
  return conflicts;
};

const shallowDeepMerge = (
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b)) {
    if (isObject(out[k]) && isObject(b[k])) {
      out[k] = shallowDeepMerge(
        out[k] as Record<string, unknown>,
        b[k] as Record<string, unknown>
      );
    } else {
      out[k] = b[k];
    }
  }
  return out;
};

export default detectConflicts;

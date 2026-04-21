import { TypeBuilder } from "../builder";
import isObject from "./isObject";

type Evaluate<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? ReturnType<T[K]>
    : T[K];
};

// Only zero-arg, unnamed (or arrow) functions are treated as thunks. The
// canonical typograph pattern is `author: () => t.type<User>("User")`, and
// arrow functions have `length === 0` and `name === ""` (or the inferred
// property name). A class constructor, a bound method, or any function
// that expects arguments would throw or produce garbage if we invoked it
// blindly, so narrow the guard instead of invoking every callable.
const isThunk = (value: unknown): value is () => unknown => {
  if (typeof value !== "function") return false;
  if (value.length !== 0) return false;
  // Class constructors have `prototype` as a non-writable, non-enumerable
  // own property created by the runtime. Arrow functions don't have one at
  // all; regular function declarations *do* have one but we accept those
  // too because a user could legitimately write `author: function () { ... }`.
  // The cheap way to exclude classes is to check for a `prototype` whose
  // descriptor marks it non-writable.
  const descriptor = Object.getOwnPropertyDescriptor(value, "prototype");
  if (descriptor && descriptor.writable === false) return false;
  return true;
};

/**
 * Recursively evaluates every key in an object.
 *
 * - `TypeBuilder` instances are coerced to their GraphQL type string.
 * - Plain objects are walked recursively (cycle-guarded).
 * - Zero-arg functions are invoked (used to unwrap lazy
 *   `() => t.type<...>(...)` thunks for circular references). Functions
 *   that take arguments, or class constructors, are left as-is so we
 *   don't invoke them with garbage.
 * - Everything else is left as-is.
 *
 * @param obj - The object to evaluate
 */
const evaluate = <T extends object>(obj: T): Evaluate<T> => {
  // Cycle guard. A typeDef assembled from `builder.*` output should never
  // contain a direct plain-object cycle (the intentional circular pattern
  // uses thunks, which we invoke exactly once per walk). But a
  // user-constructed cycle (`const x: any = {}; x.self = x`) would
  // otherwise stack-overflow; a WeakSet of visited objects gives us a
  // friendly error instead.
  const visited = new WeakSet<object>();
  return evaluateInner(obj, visited);
};

const evaluateInner = <T extends object>(
  obj: T,
  visited: WeakSet<object>
): Evaluate<T> => {
  if (visited.has(obj)) {
    throw new Error(
      "[typograph] evaluate: detected a cycle in typeDefs. Use a thunk (`() => t.type<...>(...)`) to express circular type references instead of a direct object reference."
    );
  }
  visited.add(obj);

  const result = {} as Evaluate<T>;

  for (const k of Object.keys(obj)) {
    const key = k as keyof T;
    const value = obj[key];

    if (value instanceof TypeBuilder) {
      // Defaulted TypeBuilders carry both a type string and a runtime
      // default value. Encode both as a richer object so downstream
      // consumers (buildGraphQLQuery → operation header rendering) can
      // emit `$varName: Type = <default>` without losing the value.
      // Non-defaulted TypeBuilders stay as plain strings — the most common
      // path — so existing consumers don't need to know about the richer
      // shape unless they care about defaults.
      if (value.hasDefault()) {
        result[key] = {
          type: value.toString(),
          default: value.getDefault(),
        } as Evaluate<T>[keyof T];
      } else {
        result[key] = value.toString() as Evaluate<T>[keyof T];
      }
      continue;
    }

    if (isObject(value)) {
      result[key] = evaluateInner(value, visited) as Evaluate<T>[keyof T];
      continue;
    }

    if (isThunk(value)) {
      result[key] = value() as Evaluate<T>[keyof T];
      continue;
    }

    result[key] = value as Evaluate<T>[keyof T];
  }

  return result;
};

export default evaluate;

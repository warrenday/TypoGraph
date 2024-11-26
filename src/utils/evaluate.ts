import isObject from "./isObject";

type Evaluate<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? ReturnType<T[K]>
    : T[K];
};

/**
 * Recursively evaluates every key in an object.
 *
 * @param obj - The object to evaluate
 */
const evaluate = <T extends object>(obj: T): Evaluate<T> => {
  let result = {} as Evaluate<T>;

  for (const k of Object.keys(obj)) {
    const key = k as keyof T;
    const value = obj[key];

    if (isObject(value)) {
      result[key] = evaluate(value as object) as Evaluate<T>[keyof T];
      continue;
    }

    if (typeof value === "function") {
      result[key] = value() as Evaluate<T>[keyof T];
    } else {
      result[key] = value as Evaluate<T>[keyof T];
    }
  }

  return result;
};

export default evaluate;

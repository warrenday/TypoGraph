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
const evaluate = <T extends any>(obj: T): Evaluate<T> => {
  let result = {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (isObject(value)) {
      result[key] = evaluate(value);
      continue;
    }

    if (typeof value === "function") {
      result[key] = value();
    } else {
      result[key] = value;
    }
  }

  return result as Evaluate<T>;
};

export default evaluate;

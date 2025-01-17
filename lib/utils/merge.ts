import { Merge } from "../common";
import isObject from "./isObject";

/**
 * Deep merge an array of objects.
 *
 * @param items - The objects to merge
 * @returns A single merged object
 *
 * @example
 * merge({ a: 1 }, { b: 2 }) // { a: 1, b: 2 }
 * merge({ a: 1 }, { a: 2 }) // { a: 2 }
 * merge({ a: { b: 1 } }, { a: { c: 2 } }) // { a: { b: 1, c: 2 } }
 */
const merge = <T extends { [key: string]: any }[]>(...items: T): Merge<T> => {
  return items.reduce((result, current) => {
    if (!current) return result;

    for (const key of Object.keys(current)) {
      const resultValue = result[key];
      const currentValue = current[key];

      // Handle nested objects
      if (isObject(resultValue) && isObject(currentValue)) {
        result[key] = merge(resultValue, currentValue);
      } else {
        // For primitives or arrays, just override
        result[key] = currentValue;
      }
    }

    return result;
  }, {}) as Merge<T>;
};

export default merge;

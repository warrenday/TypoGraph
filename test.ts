// type UnionToIntersection<U> = (
//   U extends any ? (arg: U) => void : never
// ) extends (arg: infer I) => void ? I : never

// type Merge<T extends object[]> = UnionToIntersection<T[number]>;

// const a = {
//   name: "John",
//   age: 30,
// };

// const b = {
//   name: "Jane",
//   city: "New York",
// };

// const c = {
//   country: "UK"
// }

// const merge = <T extends object[]>(...items: T): Merge<T> => {
//   return items.reduce((result, current) => {
//     return {
//       ...result,
//       ...current,
//     };
//   }, {})
// };

// const merged = merge(a, b, c);

// merged.

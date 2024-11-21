// Helper type to merge array of objects into a single object
type UnionToIntersection<U> =
  // First convert union to union of functions and set the argument type
  // to the type of the union. We need this to combine the types correctly.
  (
    U extends any ? (k: U) => void : never
  ) extends // Now we have the arguments, we can infer and return them.
  // Typescript combines arguments of all functions into a single object
  // rather than creating a union of objects, it's a trick to get a single object.
  (k: infer I) => void
    ? I
    : never;

export type Merge<T extends Array<Record<string, any>>> = UnionToIntersection<
  T[number]
>;

export type ExtractValue<T> = {
  [K in keyof T]: T[K] extends () => any ? ReturnType<T[K]> : T[K];
};

export type BaseTypeDefs = {
  Query: Record<string, { input: any; output: any }>;
  Mutation: Record<string, { input: any; output: any }>;
  [key: string]: Record<string, any>;
};

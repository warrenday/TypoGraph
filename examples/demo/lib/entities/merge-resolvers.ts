type Slice = {
  Query?: Record<string, unknown>;
  Mutation?: Record<string, unknown>;
  Subscription?: Record<string, unknown>;
  [type: string]: Record<string, unknown> | undefined;
};

export const mergeResolvers = <T extends Slice>(slices: T[]): T => {
  const out: Record<string, Record<string, unknown>> = {};

  for (const slice of slices) {
    for (const [typeName, fields] of Object.entries(slice)) {
      if (!fields) continue;
      out[typeName] = { ...(out[typeName] ?? {}), ...fields };
    }
  }

  return out as T;
};

import createClient, { args } from "./client";
import type {
  SelectionSet,
  SelectionsByOperation,
  MergedVariables,
  ArgsWrapper,
  VariableReference,
} from "./client";
import type { Resolvers } from "./types/resolvers";
import { createTypeDefBuilder, t, TypeBuilder } from "./builder";

export { createClient, createTypeDefBuilder, t, TypeBuilder, args };
export type {
  Resolvers,
  SelectionSet,
  SelectionsByOperation,
  MergedVariables,
  ArgsWrapper,
  VariableReference,
};

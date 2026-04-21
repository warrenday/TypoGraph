import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

// Use this to access the MDX components; you can override or add custom
// components here. See https://fumadocs.dev/docs/ui/mdx for more info.
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...components,
  };
}

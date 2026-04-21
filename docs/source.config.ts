import { defineConfig, defineDocs } from "fumadocs-mdx/config";

// Typograph docs — single `docs` collection sourced from content/docs.
// See https://fumadocs.dev/docs/mdx/collections for customisation options.
export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig({
  mdxOptions: {
    // MDX options
  },
});

import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: {
        main: resolve(__dirname, "lib/main.ts"),
        "integrations/urql": resolve(__dirname, "lib/integrations/urql.ts"),
        "integrations/apollo": resolve(
          __dirname,
          "lib/integrations/apollo.ts",
        ),
        "integrations/react-query": resolve(
          __dirname,
          "lib/integrations/react-query.ts",
        ),
      },
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: [
        "graphql",
        "urql",
        "react",
        "@apollo/client",
        "@tanstack/react-query",
        "graphql-ws",
      ],
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
});

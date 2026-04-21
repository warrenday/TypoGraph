import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Apollo Server's standalone helper mounts at `/`, so rewrite the
      // client-side `/graphql` path to `/` when forwarding to :4000.
      "/graphql": {
        target: "http://localhost:4000",
        rewrite: (p) => p.replace(/^\/graphql/, ""),
      },
    },
  },
});

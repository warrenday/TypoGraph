import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  transpilePackages: ["typograph"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "placehold.co" }],
  },
  // Force a single copy of `urql`: the repo root has its own via its
  // library tests, and without this alias the demo ends up with two
  // React contexts and a broken Provider.
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      urql: join(__dirname, "node_modules/urql"),
    };
    return config;
  },
};

export default nextConfig;

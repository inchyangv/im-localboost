const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a second dev server (e.g. a parallel agent session) use its own build dir instead of clobbering .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Allow the local build to trace files from ../shared (deployments.json, abi/).
  // Skipped under `vercel build`: @vercel/next prefixes the tracing root again ("web/web/.next")
  // and every route is prerendered statically, so runtime tracing is not needed there.
  ...(process.env.VERCEL
    ? {}
    : { experimental: { outputFileTracingRoot: path.join(__dirname, "..") } }),
};

module.exports = nextConfig;

const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow the build to trace files from ../shared (deployments.json, abi/).
    outputFileTracingRoot: path.join(__dirname, ".."),
  },
};

module.exports = nextConfig;

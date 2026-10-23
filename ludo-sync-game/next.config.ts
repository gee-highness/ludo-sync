import type { NextConfig } from "next";

// One id per build: names the service worker's caches, so a new deploy replaces the old ones.
const buildId = `${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  generateBuildId: async () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  poweredByHeader: false,
  compress: true,
  experimental: { optimizePackageImports: ["@chakra-ui/react", "@chakra-ui/icons"] },
  async headers() {
    return [
      { source: "/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;

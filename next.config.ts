import type { NextConfig } from "next";
import { makeBuildId } from "./server/build-config";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  generateBuildId: async () => makeBuildId(process.env),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
export default config;

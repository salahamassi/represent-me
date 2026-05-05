import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native bindings (resvg's platform-specific binaries) and WASM-loading
  // packages don't bundle cleanly through Turbopack — mark them external
  // so Next loads them via Node's `require` at runtime instead.
  serverExternalPackages: ["@resvg/resvg-js", "satori", "shiki"],
};

export default nextConfig;

import type { NextConfig } from "next"
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "heic-decode", "libheif-js"],
  outputFileTracingIncludes: {
    "/*": [
      "./assets/fonts/**/*",
      "./migrations/**/*",
      "./modules/media/heic-worker.cjs",
      "./node_modules/heic-decode/**/*",
      "./node_modules/libheif-js/**/*",
    ],
  },
}
export default nextConfig

import type { NextConfig } from "next";
import path from "path";
import { loadEnvConfig } from "@next/env";

/**
 * 로컬: 상위(cursol/) .env.local 후 앱 폴더 덮어쓰기.
 * Vercel: 저장소 루트만 클론되므로 상위 경로 로드 생략(빌드/런타임 혼선 방지).
 */
const projectDir = process.cwd();
if (process.env.VERCEL) {
  loadEnvConfig(projectDir);
} else {
  loadEnvConfig(path.join(projectDir, ".."));
  loadEnvConfig(projectDir);
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;

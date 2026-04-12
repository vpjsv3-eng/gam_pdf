import type { NextConfig } from "next";
import path from "path";
import { loadEnvConfig } from "@next/env";

/** monorepo 상위(cursol/)의 .env.local도 읽기 — 앱 폴더 설정이 있으면 덮어씀 */
const projectDir = process.cwd();
loadEnvConfig(path.join(projectDir, ".."));
loadEnvConfig(projectDir);

const nextConfig: NextConfig = {};

export default nextConfig;

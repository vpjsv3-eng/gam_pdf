import fs from "node:fs";
import path from "node:path";

let attempted = false;

function setIfEmpty(key: string, value: string) {
  const cur = process.env[key];
  if (cur === undefined || String(cur).trim() === "") {
    process.env[key] = value;
  }
}

function parseAndApplyEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  let raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    setIfEmpty(key, value);
  }
}

/**
 * Next가 상위 폴더 .env.local을 안 읽는 경우(모노레포) 대비.
 * 앱 디렉터리 → 한 단계 위 순으로 .env.local / .env 탐색.
 */
export function ensureOpenAiEnv(): void {
  if (process.env.OPENAI_API_KEY?.trim()) return;
  if (attempted) return;
  attempted = true;

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, ".env"),
    path.join(cwd, "..", ".env.local"),
    path.join(cwd, "..", ".env"),
  ];

  for (const file of candidates) {
    parseAndApplyEnvFile(path.resolve(file));
    if (process.env.OPENAI_API_KEY?.trim()) break;
  }
}

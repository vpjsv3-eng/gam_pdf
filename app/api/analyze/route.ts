import OpenAI from "openai";
import { NextResponse } from "next/server";
import { CADASTRAL_VISION_USER_TEXT } from "@/lib/cadastralVisionPrompt";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { ensureOpenAiEnv } from "@/lib/loadLocalEnv";
import { decodeAnalyzePdfText, type AnalyzePostBody } from "@/lib/analyzePayloadCodec";

/** GPT가 빈 객체·전부 null만 주면 vision으로 채워야 함(빈 {}는 truthy라 !block만으로는 부족) */
function needsVisionBackfill(block: unknown): boolean {
  if (block == null) return true;
  if (typeof block !== "object" || Array.isArray(block)) return false;
  const o = block as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 0) return true;
  return keys.every((k) => {
    const v = o[k];
    if (v == null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) {
      return true;
    }
    return false;
  });
}

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  ensureOpenAiEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const openai = new OpenAI({ apiKey });

  let body: AnalyzePostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  let pdfText: string;
  try {
    pdfText = decodeAnalyzePdfText(body);
  } catch {
    return NextResponse.json(
      { error: "압축된 본문(pdfTextGzipBase64)을 해제할 수 없습니다." },
      { status: 400 },
    );
  }

  const cadastralB64 =
    typeof body.cadastralMapPngBase64 === "string" ? body.cadastralMapPngBase64.trim() : "";
  if (cadastralB64.length > 14_000_000) {
    return NextResponse.json(
      { error: "지적도 이미지(base64)가 너무 큽니다. 페이지 수를 줄여 주세요." },
      { status: 400 },
    );
  }

  const buildingRegistryB64 =
    typeof body.buildingRegistryPngBase64 === "string"
      ? body.buildingRegistryPngBase64.trim()
      : "";
  if (buildingRegistryB64.length > 14_000_000) {
    return NextResponse.json(
      { error: "건축물대장 이미지(base64)가 너무 큽니다. 페이지 수를 줄여 주세요." },
      { status: 400 },
    );
  }

  const landUsePlanB64 =
    typeof body.landUsePlanPngBase64 === "string" ? body.landUsePlanPngBase64.trim() : "";
  if (landUsePlanB64.length > 14_000_000) {
    return NextResponse.json(
      { error: "토지이용계획 이미지(base64)가 너무 큽니다. 페이지 수를 줄여 주세요." },
      { status: 400 },
    );
  }

  if (!pdfText) {
    return NextResponse.json(
      { error: "pdfText·text·pdfTextGzipBase64 중 하나에 추출된 PDF 텍스트를 넣어 주세요." },
      { status: 400 },
    );
  }

  if (pdfText.length > 900_000) {
    return NextResponse.json(
      { error: "텍스트가 너무 깁니다. 일부만 업로드하거나 나누어 주세요." },
      { status: 400 },
    );
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: pdfText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json(
        { error: "모델 응답이 비어 있습니다." },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "모델이 유효한 JSON을 반환하지 않았습니다.", raw },
        { status: 502 },
      );
    }

    if (process.env.NODE_ENV === "development" && parsed && typeof parsed === "object") {
      const parcels = (parsed as { parcels?: unknown[] }).parcels;
      if (Array.isArray(parcels)) {
        parcels.forEach((parcel, i) => {
          if (!parcel || typeof parcel !== "object") return;
          const p = parcel as Record<string, unknown>;
          const bi = (p.basic_info ?? {}) as Record<string, unknown>;
          const ow = (p.ownership ?? {}) as Record<string, unknown>;
          const anchorKeys = [
            ...Object.keys(bi).filter((k) => k.endsWith("_anchor")),
            ...Object.keys(ow).filter((k) => k.endsWith("_anchor")),
          ];
          console.log("[analyze] parcel", i, "type=", p.type, "_anchor keys:", anchorKeys);
        });
      }
    }

    let responseBody: unknown = parsed;
    if (
      cadastralB64.length > 0 &&
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      try {
        const vision = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${cadastralB64}`,
                    detail: "high",
                  },
                },
                { type: "text", text: CADASTRAL_VISION_USER_TEXT },
              ],
            },
          ],
          max_tokens: 500,
          response_format: { type: "json_object" },
          temperature: 0.1,
        });
        const vraw = vision.choices[0]?.message?.content?.trim();
        if (vraw) {
          const vparsed = JSON.parse(vraw) as Record<string, unknown>;
          responseBody = { ...(parsed as Record<string, unknown>), cadastral_map: vparsed };
        }
      } catch {
        /* 지적도 vision 실패 시 텍스트 분석 결과만 유지 */
      }
    }

    // ── 건축물대장 vision (텍스트 추출 없을 때만) ──
    if (
      buildingRegistryB64.length > 0 &&
      responseBody &&
      typeof responseBody === "object" &&
      !Array.isArray(responseBody)
    ) {
      const existingBr = (responseBody as Record<string, unknown>).building_registry;
      if (needsVisionBackfill(existingBr)) {
        try {
          const brVision = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${buildingRegistryB64}`,
                      detail: "high",
                    },
                  },
                  {
                    type: "text",
                    text: `이 이미지는 일반건축물대장입니다. 아래 JSON만 반환하세요.
{
  "대지면적": "숫자+단위 또는 null",
  "총연면적": "숫자+단위 또는 null",
  "건폐율": "퍼센트 또는 null",
  "용적률": "퍼센트 또는 null",
  "주용도": "문자열 또는 null",
  "주구조": "문자열 또는 null",
  "층수": "문자열 또는 null",
  "위반건축물": "해당없음 또는 해당 또는 null",
  "사용승인일": "날짜 또는 null",
  "동별내역": []
}`,
                  },
                ],
              },
            ],
            max_tokens: 1000,
            response_format: { type: "json_object" },
            temperature: 0.1,
          });
          const brRaw = brVision.choices[0]?.message?.content?.trim();
          if (brRaw) {
            responseBody = {
              ...(responseBody as Record<string, unknown>),
              building_registry: JSON.parse(brRaw) as Record<string, unknown>,
            };
          }
        } catch {
          /* 실패 시 유지 */
        }
      }
    }

    // ── 토지이용계획확인서 vision (텍스트 추출 없을 때만) ──
    if (
      landUsePlanB64.length > 0 &&
      responseBody &&
      typeof responseBody === "object" &&
      !Array.isArray(responseBody)
    ) {
      const existingLup = (responseBody as Record<string, unknown>).land_use_plan;
      if (needsVisionBackfill(existingLup)) {
        try {
          const lupVision = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${landUsePlanB64}`,
                      detail: "high",
                    },
                  },
                  {
                    type: "text",
                    text: `이 이미지는 토지이용계획확인서입니다.
'국토의 계획 및 이용에 관한 법률에 따른 지역·지구 등' 항목만 추출하세요.
다른 법령 항목은 추출하지 마세요. 아래 JSON만 반환하세요.
{
  "소재지": "문자열 또는 null",
  "지번": "문자열 또는 null",
  "지목": "문자열 또는 null",
  "면적": "숫자+단위 또는 null",
  "국토계획법_용도지역": "문자열 또는 null",
  "지구단위계획구역_여부": true 또는 false
}`,
                  },
                ],
              },
            ],
            max_tokens: 500,
            response_format: { type: "json_object" },
            temperature: 0.1,
          });
          const lupRaw = lupVision.choices[0]?.message?.content?.trim();
          if (lupRaw) {
            responseBody = {
              ...(responseBody as Record<string, unknown>),
              land_use_plan: JSON.parse(lupRaw) as Record<string, unknown>,
            };
          }
        } catch {
          /* 실패 시 유지 */
        }
      }
    }

    console.log(
      "[analyze 응답] building_registry:",
      JSON.stringify((responseBody as Record<string, unknown>)?.building_registry ?? null),
    );
    console.log(
      "[analyze 응답] land_use_plan:",
      JSON.stringify((responseBody as Record<string, unknown>)?.land_use_plan ?? null),
    );

    return NextResponse.json(responseBody);
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

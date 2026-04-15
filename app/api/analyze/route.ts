import OpenAI from "openai";
import { NextResponse } from "next/server";
import { CADASTRAL_VISION_USER_TEXT } from "@/lib/cadastralVisionPrompt";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { ensureOpenAiEnv } from "@/lib/loadLocalEnv";
import { decodeAnalyzePdfText, type AnalyzePostBody } from "@/lib/analyzePayloadCodec";

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

    return NextResponse.json(responseBody);
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

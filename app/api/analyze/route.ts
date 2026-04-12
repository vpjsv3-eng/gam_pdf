import OpenAI from "openai";
import { NextResponse } from "next/server";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { ensureOpenAiEnv } from "@/lib/loadLocalEnv";

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

  let body: { pdfText?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const pdfText = (body.pdfText ?? body.text ?? "").trim();
  if (!pdfText) {
    return NextResponse.json(
      { error: "pdfText(또는 text) 필드에 추출된 PDF 텍스트를 넣어 주세요." },
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
          const ctxKeys = [
            ...Object.keys(bi).filter((k) => k.endsWith("_context")),
            ...Object.keys(ow).filter((k) => k.endsWith("_context")),
          ];
          console.log("[analyze] parcel", i, "type=", p.type, "_context keys:", ctxKeys);
        });
      }
    }

    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

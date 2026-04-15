import OpenAI from "openai";
import { NextResponse } from "next/server";
import { ensureOpenAiEnv } from "@/lib/loadLocalEnv";

export const runtime = "nodejs";
export const maxDuration = 60;

const VISION_PROMPT = `이 이미지가 어떤 문서인지 판별해줘.
아래 중 하나만 JSON으로 반환:
{"sectionType": "land_use_plan"} - 토지이용계획확인서인 경우
{"sectionType": "building_registry"} - 건축물대장(일반건축물대장, 총괄표제부)인 경우
{"sectionType": null} - 그 외 모든 경우
JSON 외 다른 텍스트 없이 반환.`;

export async function POST(request: Request) {
  ensureOpenAiEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const raw = typeof body.image === "string" ? body.image.trim() : "";
  if (!raw || raw.length > 4_500_000) {
    return NextResponse.json(
      { error: "image(base64)가 없거나 너무 큽니다." },
      { status: 400 },
    );
  }

  const dataUrl = raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
      max_tokens: 80,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    let text = response.choices[0]?.message?.content?.trim() ?? "";
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1]!.trim();
    let sectionType: string | null = null;
    try {
      const parsed = JSON.parse(text) as { sectionType?: string | null };
      if (parsed.sectionType === "land_use_plan" || parsed.sectionType === "building_registry") {
        sectionType = parsed.sectionType;
      } else {
        sectionType = null;
      }
    } catch {
      sectionType = null;
    }

    return NextResponse.json({ sectionType });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "vision 요청 실패";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

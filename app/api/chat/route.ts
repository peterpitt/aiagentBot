import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/advisors";
import { getProvider } from "@/lib/providers";

// Node runtime so the official SDKs run normally.
export const runtime = "nodejs";
// 深度輸出較久；Vercel Hobby 方案上限較短，詳見 README。
export const maxDuration = 300;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let body: { provider?: string; model?: string; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("無效的請求內容。", { status: 400 });
  }

  const def = getProvider(body?.provider);
  if (!def) {
    return new Response("未知的模型供應商。", { status: 400 });
  }
  if (!def.enabled()) {
    return new Response(
      `供應商「${def.label}」尚未啟用，請在環境變數設定對應的金鑰或端點（見 README）。`,
      { status: 400 },
    );
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("缺少對話內容。", { status: 400 });
  }

  const safe: ChatMessage[] = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content }));

  if (safe.length === 0 || safe[0].role !== "user") {
    return new Response("對話必須以使用者訊息開始。", { status: 400 });
  }

  const model = (body?.model && body.model.trim()) || def.defaultModel();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (t: string) => {
        try {
          controller.enqueue(encoder.encode(t));
        } catch {
          /* controller 可能已關閉 */
        }
      };

      try {
        if (def.kind === "anthropic") {
          await streamAnthropic(def.apiKey?.() || "", model, safe, push);
        } else {
          await streamOpenAICompatible(
            def.baseURL?.() || "",
            def.apiKey?.() || "",
            model,
            safe,
            push,
          );
        }
      } catch (err: unknown) {
        push("\n\n⚠️ " + describeError(err));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Anthropic（Claude）：system 參數 + 串流 */
async function streamAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  push: (t: string) => void,
) {
  const client = new Anthropic({ apiKey });
  const run = client.messages.stream({
    model,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages: messages as Anthropic.MessageParam[],
  });
  for await (const event of run) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      push(event.delta.text);
    }
  }
  const final = await run.finalMessage();
  if (final.stop_reason === "refusal") {
    push("\n\n（模型基於安全理由停止了這次生成。）");
  }
}

/** OpenAI 相容端點（Ollama / Qwen / NVIDIA Nemotron）：system 當作第一則訊息 */
async function streamOpenAICompatible(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  push: (t: string) => void,
) {
  const client = new OpenAI({ apiKey: apiKey || "none", baseURL });
  const maxTokens = process.env.OPENAI_MAX_TOKENS
    ? Number(process.env.OPENAI_MAX_TOKENS)
    : undefined;

  const stream = await client.chat.completions.create({
    model,
    stream: true,
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) push(delta);
  }
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Claude API Key 無效，請檢查 ANTHROPIC_API_KEY。";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "呼叫過於頻繁（rate limited），請稍候再試。";
  }
  if (err instanceof OpenAI.APIError) {
    // 本地模型最常見：端點未啟動或模型名稱錯誤
    if (err.status === undefined) {
      return "無法連線到模型端點（Ollama/本地伺服器是否已啟動？baseURL 是否正確？）。";
    }
    return `模型端點錯誤 ${err.status}：${err.message}`;
  }
  if (err instanceof Anthropic.APIError) {
    return `API 錯誤 ${err.status ?? ""}：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "生成時發生未知錯誤。";
}

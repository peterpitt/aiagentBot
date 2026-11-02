import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/advisors";

// Node runtime so the official SDK runs normally.
export const runtime = "nodejs";
// Deep boardroom answers take a while; allow a long function (Vercel Pro 等方案才吃得滿，
// Hobby 方案上限較短，詳見 README)。
export const maxDuration = 300;

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("伺服器未設定 ANTHROPIC_API_KEY，請在 .env.local 或部署平台填入。", {
      status: 500,
    });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("無效的請求內容。", { status: 400 });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("缺少對話內容。", { status: 400 });
  }

  // 僅保留必要欄位，避免把前端雜訊送上 API。
  const safeMessages: Anthropic.MessageParam[] = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));

  if (safeMessages.length === 0 || safeMessages[0].role !== "user") {
    return new Response("對話必須以使用者訊息開始。", { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const run = client.messages.stream({
          model: MODEL,
          max_tokens: 32000,
          system: SYSTEM_PROMPT,
          messages: safeMessages,
        });

        for await (const event of run) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await run.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n（模型基於安全理由停止了這次生成。）"));
        }
        controller.close();
      } catch (err: unknown) {
        let msg = "生成時發生未知錯誤。";
        if (err instanceof Anthropic.AuthenticationError) {
          msg = "API Key 無效，請檢查 ANTHROPIC_API_KEY。";
        } else if (err instanceof Anthropic.RateLimitError) {
          msg = "呼叫過於頻繁（rate limited），請稍候再試。";
        } else if (err instanceof Anthropic.APIError) {
          msg = `API 錯誤 ${err.status ?? ""}：${err.message}`;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        try {
          controller.enqueue(encoder.encode("\n\n⚠️ " + msg));
        } catch {
          /* controller 可能已關閉 */
        }
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

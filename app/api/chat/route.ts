import { getProvider } from "@/lib/providers";
import { runChat, describeError, type ChatMessage } from "@/lib/chat";

// Node runtime so the official SDKs run normally.
export const runtime = "nodejs";
// 深度輸出較久；Vercel Hobby 方案上限較短，詳見 README。
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: { provider?: string; model?: string; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("無效的請求內容。", { status: 400 });
  }

  const def = getProvider(body?.provider);
  if (!def) return new Response("未知的模型供應商。", { status: 400 });
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
        await runChat(body.provider, body.model, safe, push);
      } catch (err) {
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

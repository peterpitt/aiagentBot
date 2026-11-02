// 共用的聊天核心：Web API（/api/chat）與 Telegram bot 都用這支。
// 依選定的 provider 路由到 Anthropic SDK 或 OpenAI 相容端點，並以 callback 串流輸出。

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./advisors";
import { getProvider } from "./providers";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * 串流一次對話回覆。
 * @param onDelta 每收到一段文字就會被呼叫（累加由呼叫端負責）。
 * 失敗時 throw，由呼叫端決定如何呈現。
 */
export async function runChat(
  providerId: string | undefined,
  modelOverride: string | undefined,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<void> {
  const def = getProvider(providerId);
  if (!def) throw new Error("未知的模型供應商。");
  if (!def.enabled()) {
    throw new Error(
      `供應商「${def.label}」尚未啟用，請設定對應的金鑰或端點（見 README / .env.example）。`,
    );
  }

  const model = (modelOverride && modelOverride.trim()) || def.defaultModel();

  if (def.kind === "anthropic") {
    const client = new Anthropic({ apiKey: def.apiKey?.() || "" });
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
        onDelta(event.delta.text);
      }
    }
    const final = await run.finalMessage();
    if (final.stop_reason === "refusal") {
      onDelta("\n\n（模型基於安全理由停止了這次生成。）");
    }
    return;
  }

  // OpenAI 相容端點（Ollama / Qwen / NVIDIA Nemotron）
  const client = new OpenAI({
    apiKey: def.apiKey?.() || "none",
    baseURL: def.baseURL?.() || "",
  });
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
    if (delta) onDelta(delta);
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Claude API Key 無效，請檢查 ANTHROPIC_API_KEY。";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "呼叫過於頻繁（rate limited），請稍候再試。";
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === undefined) {
      return "無法連線到模型端點（本地伺服器是否已啟動？baseURL 是否正確？）。";
    }
    return `模型端點錯誤 ${err.status}：${err.message}`;
  }
  if (err instanceof Anthropic.APIError) {
    return `API 錯誤 ${err.status ?? ""}：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "生成時發生未知錯誤。";
}

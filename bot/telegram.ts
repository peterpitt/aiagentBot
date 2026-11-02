// Telegram bot（長輪詢 long polling）— 讓你在手機上隨時呼叫 12 位顧問智囊團。
// 長輪詢不需要公開 IP / webhook：只要這支程式在跑、電腦開著即可，
// 也能呼叫同一台電腦上的本地模型（Ollama 等）。
//
// 執行：  npm run bot
// 需要： .env.local 內設定 TELEGRAM_BOT_TOKEN（找 @BotFather 申請）

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // 再讀 .env（不覆蓋已存在的值）

import { Bot, type Context } from "grammy";
import {
  getProvider,
  getEnabledProviders,
  getDefaultProviderId,
} from "../lib/providers";
import { runChat, describeError, type ChatMessage } from "../lib/chat";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error(
    [
      "✗ 找不到 TELEGRAM_BOT_TOKEN。",
      "",
      "設定步驟：",
      "  1. 在 Telegram 找 @BotFather → /newbot → 取得 token",
      "  2. 在 .env.local 加入：TELEGRAM_BOT_TOKEN=123456:ABC...",
      "  3. （建議）設 TELEGRAM_ALLOWED_USERS=你的數字ID，限制只有你能用",
      "  4. 重新執行：npm run bot",
    ].join("\n"),
  );
  process.exit(1);
}

// 允許使用的 Telegram 使用者 ID（逗號分隔）。未設定 = 任何知道 bot 的人都能用（會示警）。
const ALLOWED = (process.env.TELEGRAM_ALLOWED_USERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const DEFAULT_PROVIDER = process.env.BOT_PROVIDER || getDefaultProviderId();
const DEFAULT_MODEL = process.env.BOT_MODEL || "";
const MAX_HISTORY = 8; // 保留最近 8 則（約 4 輪），避免本地模型 context 爆掉

type ChatState = {
  messages: ChatMessage[];
  provider: string;
  model: string;
  busy: boolean;
};
const sessions = new Map<number, ChatState>();

function stateFor(chatId: number): ChatState {
  let s = sessions.get(chatId);
  if (!s) {
    s = {
      messages: [],
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      busy: false,
    };
    sessions.set(chatId, s);
  }
  return s;
}

function allowed(ctx: Context): boolean {
  if (ALLOWED.length === 0) return true;
  const id = ctx.from?.id;
  return id !== undefined && ALLOWED.includes(String(id));
}

function modelLabel(s: ChatState): string {
  const def = getProvider(s.provider);
  const model = s.model || def?.defaultModel() || "(預設)";
  return `${def?.label || s.provider} · ${model}`;
}

// 把長文字切成 Telegram 可接受的區塊（上限 4096，保守用 3900），盡量在換行處切。
function splitMessage(text: string, size = 3900): string[] {
  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (line.length > size) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < line.length; i += size) out.push(line.slice(i, i + size));
      continue;
    }
    if (buf.length + line.length + 1 > size) {
      out.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : ["（無內容）"];
}

const bot = new Bot(TOKEN);

const START_TEXT = [
  "👋 歡迎使用「一人公司頂級智囊團」——12 位 AI 顧問組成的智囊團。",
  "",
  "直接傳一個創業點子給我，我會依四階段輸出落地藍圖（含程式碼與 Google Drive 自動交付流程）。",
  "",
  "指令：",
  "/new 開新會議（清除對話記憶）",
  "/model 查看目前模型與可切換清單",
  "/use <供應商> [模型] 切換模型，例如 /use ollama qwen2.5",
  "/whoami 顯示你的 Telegram ID",
].join("\n");

bot.command("start", async (ctx) => {
  if (!allowed(ctx)) return ctx.reply("⛔ 你未被授權使用此 bot。");
  const s = stateFor(ctx.chat.id);
  await ctx.reply(START_TEXT + `\n\n目前模型：${modelLabel(s)}`);
});

bot.command("whoami", async (ctx) => {
  await ctx.reply(`你的 Telegram user id：${ctx.from?.id ?? "未知"}`);
});

bot.command(["new", "reset"], async (ctx) => {
  if (!allowed(ctx)) return ctx.reply("⛔ 你未被授權使用此 bot。");
  const s = stateFor(ctx.chat.id);
  s.messages = [];
  await ctx.reply("🆕 已開新會議，之前的對話記憶已清除。傳個新點子吧。");
});

bot.command("model", async (ctx) => {
  if (!allowed(ctx)) return ctx.reply("⛔ 你未被授權使用此 bot。");
  const s = stateFor(ctx.chat.id);
  const list = getEnabledProviders();
  const lines =
    list.length > 0
      ? list.map((p) => `• ${p.id}（${p.label}）預設：${p.defaultModel}`).join("\n")
      : "（目前沒有啟用任何供應商，請檢查 .env.local）";
  await ctx.reply(
    `目前模型：${modelLabel(s)}\n\n可用供應商：\n${lines}\n\n切換：/use <供應商> [模型]\n例：/use ollama qwen2.5`,
  );
});

bot.command("use", async (ctx) => {
  if (!allowed(ctx)) return ctx.reply("⛔ 你未被授權使用此 bot。");
  const s = stateFor(ctx.chat.id);
  const args = (ctx.match || "").trim().split(/\s+/).filter(Boolean);
  const pid = args[0];
  const def = getProvider(pid);
  if (!pid || !def) {
    const ids = getEnabledProviders()
      .map((p) => p.id)
      .join(" / ");
    return ctx.reply(`用法：/use <供應商> [模型]\n可用：${ids || "（無）"}`);
  }
  if (!def.enabled()) {
    return ctx.reply(`供應商「${def.label}」尚未啟用（請在 .env.local 設定）。`);
  }
  s.provider = pid;
  s.model = args[1] || "";
  await ctx.reply(`✅ 已切換為：${modelLabel(s)}`);
});

bot.on("message:text", async (ctx) => {
  if (!allowed(ctx)) return ctx.reply("⛔ 你未被授權使用此 bot。");
  const text = ctx.message.text;
  if (text.startsWith("/")) return; // 未知指令忽略

  const s = stateFor(ctx.chat.id);
  if (s.busy) {
    return ctx.reply("⏳ 上一題還在生成中，請稍候…");
  }
  s.busy = true;

  // 持續顯示「正在輸入…」
  await ctx.replyWithChatAction("typing").catch(() => {});
  const typing = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  const history: ChatMessage[] = [...s.messages, { role: "user", content: text }];
  let answer = "";

  try {
    await runChat(s.provider, s.model, history, (d) => {
      answer += d;
    });

    if (!answer.trim()) answer = "（模型沒有回傳內容。）";

    // 更新對話記憶（截斷到最近 MAX_HISTORY 則）
    const assistantMsg: ChatMessage = { role: "assistant", content: answer };
    s.messages = [...history, assistantMsg].slice(-MAX_HISTORY);

    for (const part of splitMessage(answer)) {
      await ctx.reply(part);
    }
  } catch (err) {
    await ctx.reply("⚠️ " + describeError(err));
  } finally {
    clearInterval(typing);
    s.busy = false;
  }
});

bot.catch((err) => {
  console.error("Bot 錯誤：", err.error);
});

console.log(
  [
    "✓ Telegram bot 啟動中（長輪詢）…",
    `  預設模型：${getProvider(DEFAULT_PROVIDER)?.label || DEFAULT_PROVIDER}` +
      (DEFAULT_MODEL ? ` · ${DEFAULT_MODEL}` : ""),
    ALLOWED.length > 0
      ? `  允許的使用者：${ALLOWED.join(", ")}`
      : "  ⚠️ 未設定 TELEGRAM_ALLOWED_USERS：任何知道此 bot 的人都能使用（會消耗你的 API/算力）。建議設定。",
    "  按 Ctrl+C 停止。",
  ].join("\n"),
);

bot.start();

// 優雅關閉
const stop = () => {
  console.log("\n正在停止 bot…");
  bot.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

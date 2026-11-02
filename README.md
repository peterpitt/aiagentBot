# 一人公司頂級 AI 智囊團（Youthinkourfuture Bot）

一個可自行部署的 AI agent 聊天機器人：由 **12 位各領域頂尖顧問** 組成的智囊團，當你輸入一個創業點子後，會嚴格依照四階段流程推演，輸出一份含**實際程式碼、SEO 流量策略與 Google Drive 自動交付流程**的「一人公司落地藍圖」。

四階段：

1. **群雄激辯** — 挑選 3–4 位最相關顧問以第一人稱辯論，點出致命傷與突破口。
2. **戰略收斂** — 結合天時（趨勢）、地利（市場）、人和（技術）收斂出唯一最佳產品型態與變現模式。
3. **落地藍圖** — 護城河定位、MVP 開發與交付路徑（含 App 安裝包自動存進 Google Drive）、SEO 零成本獲客。
4. **可交付 Prompt** — 直接可複製的開發 Prompt、SEO 爆款 Prompt、以及 Make/n8n/GitHub Actions + Google Drive API 的完整自動化腳本。

技術：**Next.js 16（App Router）+ React 19 + TypeScript**，前端是一個深淺色主題、含程式碼複製鈕的對話介面；所有金鑰只放在伺服器端，不會外洩到瀏覽器。

### 可切換多種模型（雲端 + 本地）

介面上有「模型」下拉選單，可在以下供應商間切換（只會顯示你已在環境變數設定的那些）：

| 供應商 | 走法 | 可跑的模型範例 |
|---|---|---|
| **Claude（Anthropic）** | 官方 `@anthropic-ai/sdk` | `claude-opus-5-5`、`claude-sonnet-5-5` |
| **Ollama（本地）** | OpenAI 相容 `http://localhost:11434/v1` | `qwen2.5`、`llama3.1`、`gemma2`… |
| **Qwen（通義千問）** | DashScope 或自架 vLLM（OpenAI 相容） | `qwen-max`、`qwen2.5-72b-instruct` |
| **NVIDIA Nemotron** | build.nvidia.com 或自架 NIM（OpenAI 相容） | `nvidia/nemotron-3-ultra-550b-a55b` |

Claude 走 Anthropic 原生 API；其餘三者都是 **OpenAI 相容端點**，由 `openai` 套件統一呼叫，所以任何 OpenAI 相容的服務（vLLM、LM Studio、text-generation-webui…）改個 `*_BASE_URL` 就能接。下拉選單旁邊還能直接改模型名稱。

---

## 一、本機安裝與執行

需求：Node.js 20 以上。

```bash
git clone https://github.com/peterpitt/youthinkourfuture-bot.git
cd youthinkourfuture-bot
npm install
```

設定 API Key（複製範例檔後填入你的金鑰）：

```bash
cp .env.example .env.local
```

編輯 `.env.local`，把 `ANTHROPIC_API_KEY` 換成你的金鑰（到 <https://console.anthropic.com/settings/keys> 取得）。

啟動開發伺服器：

```bash
npm run dev
```

打開瀏覽器到 <http://localhost:3000>，輸入點子即可開會。

正式打包：

```bash
npm run build
npm run start
```

---

## 二、部署到 Vercel（最省事）

1. 把這個 repo 推到你的 GitHub（已經在上面了）。
2. 到 <https://vercel.com/new> 匯入此 repo。
3. 在 Vercel 專案的 **Settings → Environment Variables** 新增 `ANTHROPIC_API_KEY`（值為你的金鑰）。若想換模型，另外加 `CLAUDE_MODEL`。
4. Deploy。完成後就有一個公開網址。

> ⚠️ Vercel **Hobby（免費）方案**的函式執行時間上限較短（約 60 秒）。智囊團輸出很長時，偶爾會在免費方案被切斷。若要穩定跑完整四階段，建議：
> - 升級 Vercel 方案（函式可跑到 `maxDuration = 300` 秒，已在 `app/api/chat/route.ts` 設定），或
> - 用 `CLAUDE_MODEL=claude-sonnet-5-5` 加快輸出，或
> - 本機執行（`npm run dev`，無時間上限）。

其他平台（Render、Railway、自架 Node 伺服器）同理：設好 `ANTHROPIC_API_KEY` 環境變數，執行 `npm run build && npm run start` 即可。

---

## 三、環境變數

至少啟用一個供應商即可（前端選單只顯示有設定的）。完整清單與說明見 `.env.example`，重點如下：

| 變數 | 供應商 | 說明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude | Anthropic 金鑰；設了就啟用 Claude |
| `CLAUDE_MODEL` | Claude | 預設 `claude-opus-5-5` |
| `OLLAMA_BASE_URL` / `OLLAMA_ENABLED` | Ollama | 設任一個即啟用；預設端點 `http://localhost:11434/v1` |
| `OLLAMA_MODEL` | Ollama | 預設 `qwen2.5` |
| `QWEN_API_KEY` / `QWEN_BASE_URL` | Qwen | 設任一個即啟用（DashScope 或自架） |
| `NVIDIA_API_KEY` / `NVIDIA_BASE_URL` | NVIDIA | 設任一個即啟用（build.nvidia.com 或自架 NIM） |
| `DEFAULT_PROVIDER` | — | 預設選取哪個供應商 |
| `OPENAI_MAX_TOKENS` | 本地/相容端點 | 輸出 token 上限（選填） |

### 本地模型快速開始（Ollama + Qwen）

```bash
# 1. 安裝 Ollama → https://ollama.com
ollama pull qwen2.5        # 下載 Qwen 模型（或 qwen2.5:14b 等）
ollama serve               # 啟動本地伺服器（預設 11434 埠）

# 2. 在 .env.local 加入
echo "OLLAMA_BASE_URL=http://localhost:11434/v1" >> .env.local
echo "OLLAMA_MODEL=qwen2.5" >> .env.local

# 3. npm run dev → 介面「模型」選單選「Ollama（本地）」即可
```

> 本地模型（Ollama / 自架 vLLM / NIM）只有在「跑得到那個端點的機器」上才連得到。
> 部署到 Vercel 等無伺服器平台時，雲端函式連不到你家的 `localhost`——本地模型請在本機或自架伺服器上跑。

---

## 四、Telegram bot（手機隨時呼叫）

想隨時隨地用手機叫出智囊團？這個 repo 內建一個 Telegram bot，用 **long polling（長輪詢）**，
**不需要公開 IP、不用開 port、不用 webhook**——程式向 Telegram 主動拉訊息即可。
只要這支程式在你電腦上跑著、電腦開著，就能用手機隨傳隨到，而且能呼叫**同一台電腦上的本地模型（Ollama 等）**。

設定步驟：

```bash
# 1. 在 Telegram 找 @BotFather → 傳 /newbot → 取得 bot token
# 2. 在 .env.local 加入（連同你要用的模型設定，如 Ollama）：
#    TELEGRAM_BOT_TOKEN=123456:ABC...
#    TELEGRAM_ALLOWED_USERS=你的數字ID     # 強烈建議設，避免別人盜用你的算力/金鑰
#    BOT_PROVIDER=ollama                   # bot 預設用哪個供應商（選填）
#    BOT_MODEL=qwen2.5                     # bot 預設模型（選填）

# 3. 啟動 bot（與 Next.js 的 npm run dev 是兩個獨立程式，可只跑這個）
npm run bot
```

接著在 Telegram 打開你的 bot，直接傳點子即可。指令：

| 指令 | 作用 |
|---|---|
| `/start` | 說明與目前模型 |
| `/new` | 開新會議（清除對話記憶） |
| `/model` | 查看目前模型與可切換清單 |
| `/use <供應商> [模型]` | 切換，例：`/use ollama qwen2.5`、`/use claude` |
| `/whoami` | 顯示你的 Telegram ID（用來設白名單） |

> 🔒 **務必設 `TELEGRAM_ALLOWED_USERS`**：不設的話，任何知道你 bot 名稱的人都能使用、消耗你的 API 額度或本地算力。先把 bot 跑起來、傳 `/whoami` 給它拿到自己的 ID，再填進去重啟。
>
> 💡 要讓它「24 小時都在」，把 `npm run bot` 用 pm2 / systemd / 開機自動啟動掛著即可；電腦關機時 bot 就離線（這是本地部署的特性）。

---

## 五、專案結構

```
youthinkourfuture-bot/
├── app/
│   ├── api/chat/route.ts       # 串流代理：依選擇的供應商路由到 Claude 或 OpenAI 相容端點
│   ├── api/providers/route.ts  # 回傳目前啟用的供應商清單給前端選單
│   ├── layout.tsx              # HTML 外殼、字型
│   ├── page.tsx                # 對話介面（含模型選單、顧問名單、程式碼複製鈕、深淺色主題）
│   └── globals.css             # boardroom 主題樣式
├── bot/
│   └── telegram.ts             # Telegram bot（長輪詢），重用下面的 lib
├── lib/
│   ├── advisors.ts             # 12 位顧問的系統提示、名單與範例點子
│   ├── providers.ts            # 模型供應商設定（Claude / Ollama / Qwen / NVIDIA）
│   └── chat.ts                 # 共用聊天核心（Web 與 Telegram 共用）
├── .env.example
├── package.json
└── README.md
```

想調整智囊團的人設或流程，改 `lib/advisors.ts` 裡的 `SYSTEM_PROMPT` 即可。

---

## 授權

MIT。這個智囊團是 AI 人設扮演，輸出為創業參考，實際投入前請自行驗證市場、法規與技術可行性。

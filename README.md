# 一人公司頂級 AI 智囊團（Youthinkourfuture Bot）

一個可自行部署的 AI agent 聊天機器人：由 **12 位各領域頂尖顧問** 組成的智囊團，當你輸入一個創業點子後，會嚴格依照四階段流程推演，輸出一份含**實際程式碼、SEO 流量策略與 Google Drive 自動交付流程**的「一人公司落地藍圖」。

四階段：

1. **群雄激辯** — 挑選 3–4 位最相關顧問以第一人稱辯論，點出致命傷與突破口。
2. **戰略收斂** — 結合天時（趨勢）、地利（市場）、人和（技術）收斂出唯一最佳產品型態與變現模式。
3. **落地藍圖** — 護城河定位、MVP 開發與交付路徑（含 App 安裝包自動存進 Google Drive）、SEO 零成本獲客。
4. **可交付 Prompt** — 直接可複製的開發 Prompt、SEO 爆款 Prompt、以及 Make/n8n/GitHub Actions + Google Drive API 的完整自動化腳本。

技術：**Next.js 16（App Router）+ React 19 + TypeScript**，透過官方 `@anthropic-ai/sdk` 串流呼叫 Claude。前端是一個深淺色主題、含程式碼複製鈕的對話介面；你的 API Key 只放在伺服器端，不會外洩到瀏覽器。

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

| 變數 | 必填 | 說明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | 你的 Anthropic API 金鑰 |
| `CLAUDE_MODEL` | — | 使用的模型，預設 `claude-opus-5-5`；可改 `claude-sonnet-5-5`（較快較省）或 `claude-haiku-5-5`（最省） |

---

## 四、專案結構

```
youthinkourfuture-bot/
├── app/
│   ├── api/chat/route.ts   # 伺服器端串流代理，呼叫 Claude（API Key 只在這裡）
│   ├── layout.tsx          # HTML 外殼、字型
│   ├── page.tsx            # 對話介面（含顧問名單、程式碼複製鈕、深淺色主題）
│   └── globals.css         # boardroom 主題樣式
├── lib/
│   └── advisors.ts         # 12 位顧問的系統提示、名單與範例點子
├── .env.example
├── package.json
└── README.md
```

想調整智囊團的人設或流程，改 `lib/advisors.ts` 裡的 `SYSTEM_PROMPT` 即可。

---

## 授權

MIT。這個智囊團是 AI 人設扮演，輸出為創業參考，實際投入前請自行驗證市場、法規與技術可行性。

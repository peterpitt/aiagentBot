// 模型供應商（provider）設定。
// Claude 走官方 Anthropic SDK；其餘（Ollama 本地、Qwen、NVIDIA Nemotron、DeepSeek）
// 皆為 OpenAI 相容端點（/v1/chat/completions），由 openai 套件統一處理。
// 每個 provider 以環境變數啟用；沒設定的不會出現在前端選單。

export type ProviderKind = "anthropic" | "openai";

export interface ProviderPublic {
  id: string;
  label: string;
  defaultModel: string;
}

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  /** 是否已由環境變數啟用 */
  enabled: () => boolean;
  /** 預設模型字串 */
  defaultModel: () => string;
  /** OpenAI 相容端點（kind === "openai"） */
  baseURL?: () => string;
  /** API 金鑰；本地端（如 Ollama）可為佔位字串 */
  apiKey?: () => string;
}

const DEFS: ProviderDef[] = [
  {
    id: "claude",
    label: "Claude（Anthropic）",
    kind: "anthropic",
    enabled: () => !!process.env.ANTHROPIC_API_KEY,
    defaultModel: () => process.env.CLAUDE_MODEL || "claude-opus-5-5",
    apiKey: () => process.env.ANTHROPIC_API_KEY || "",
  },
  {
    id: "ollama",
    label: "Ollama（本地）",
    kind: "openai",
    // 設了 OLLAMA_BASE_URL 或 OLLAMA_ENABLED=1 就啟用
    enabled: () => !!(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_ENABLED),
    defaultModel: () => process.env.OLLAMA_MODEL || "qwen2.5",
    baseURL: () => process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    // Ollama 不驗證金鑰，但 openai 套件需要非空字串
    apiKey: () => process.env.OLLAMA_API_KEY || "ollama",
  },
  {
    id: "qwen",
    label: "Qwen",
    kind: "openai",
    enabled: () => !!(process.env.QWEN_API_KEY || process.env.QWEN_BASE_URL),
    defaultModel: () => process.env.QWEN_MODEL || "qwen-max",
    // 預設指向阿里雲 DashScope OpenAI 相容端點；自架 vLLM / Ollama 可改 QWEN_BASE_URL
    baseURL: () =>
      process.env.QWEN_BASE_URL ||
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    apiKey: () => process.env.QWEN_API_KEY || "qwen",
  },
  {
    id: "nvidia",
    label: "NVIDIA Nemotron",
    kind: "openai",
    enabled: () => !!(process.env.NVIDIA_API_KEY || process.env.NVIDIA_BASE_URL),
    defaultModel: () =>
      process.env.NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
    // 預設 build.nvidia.com 雲端 NIM；自架 NIM 容器可改 NVIDIA_BASE_URL（如 http://localhost:8000/v1）
    baseURL: () =>
      process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    apiKey: () => process.env.NVIDIA_API_KEY || "nvidia",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    enabled: () => !!(process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_BASE_URL),
    // deepseek-chat（V3）或 deepseek-reasoner（R1，含思維鏈）
    defaultModel: () => process.env.DEEPSEEK_MODEL || "deepseek-chat",
    // 官方雲端；自架（Ollama / vLLM 跑 deepseek）可改 DEEPSEEK_BASE_URL
    baseURL: () => process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
    apiKey: () => process.env.DEEPSEEK_API_KEY || "deepseek",
  },
];

export function getProvider(id: string | undefined): ProviderDef | undefined {
  return DEFS.find((d) => d.id === id);
}

export function getEnabledProviders(): ProviderPublic[] {
  return DEFS.filter((d) => d.enabled()).map((d) => ({
    id: d.id,
    label: d.label,
    defaultModel: d.defaultModel(),
  }));
}

export function getDefaultProviderId(): string {
  const want = process.env.DEFAULT_PROVIDER;
  if (want && getProvider(want)?.enabled()) return want;
  const first = DEFS.find((d) => d.enabled());
  return first?.id || "claude";
}

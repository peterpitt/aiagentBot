"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { ROSTER, SEEDS } from "@/lib/advisors";

marked.setOptions({ gfm: true, breaks: true });

type Msg = { role: "user" | "assistant"; content: string };
type ProviderPublic = { id: string; label: string; defaultModel: string };

function copyText(text: string, btn: HTMLButtonElement) {
  const done = () => {
    btn.textContent = "已複製 ✓";
    btn.classList.add("done");
    setTimeout(() => {
      btn.textContent = "複製";
      btn.classList.remove("done");
    }, 1600);
  };
  const legacy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch {
      /* ignore */
    }
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(legacy);
  } else {
    legacy();
  }
}

/** 渲染一則智囊團回覆：markdown + 程式碼區塊複製鈕 */
function BotBubble({ content, live }: { content: string; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = marked.parse(content) as string;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // 讓寬表格可橫向捲動
    root.querySelectorAll("table").forEach((t) => {
      if (t.parentElement?.classList.contains("tablewrap")) return;
      const w = document.createElement("div");
      w.className = "tablewrap";
      t.parentNode?.insertBefore(w, t);
      w.appendChild(t);
    });

    if (live) return; // 等串流結束後再加複製鈕，避免每個 chunk 重複

    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.closest(".codeblock")) return;
      const code = pre.querySelector("code");
      const m = (code?.className || "").match(/language-([\w-]+)/);
      const lang = m ? m[1] : "prompt";
      const raw = code ? code.textContent || "" : pre.textContent || "";

      const wrap = document.createElement("div");
      wrap.className = "codeblock";
      const bar = document.createElement("div");
      bar.className = "codebar";
      const label = document.createElement("span");
      label.className = "lang";
      label.textContent = lang;
      const btn = document.createElement("button");
      btn.className = "copybtn";
      btn.type = "button";
      btn.textContent = "複製";
      btn.addEventListener("click", () => copyText(raw, btn));
      bar.appendChild(label);
      bar.appendChild(btn);

      pre.parentNode?.insertBefore(wrap, pre);
      wrap.appendChild(bar);
      wrap.appendChild(pre);
    });
  }, [html, live]);

  return <div className="md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [providers, setProviders] = useState<ProviderPublic[]>([]);
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // 主題（每位使用者的偏好，存在瀏覽器）
  const toggleTheme = useCallback(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur
      ? cur === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ytof-theme", next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ytof-theme");
      if (saved === "dark" || saved === "light") {
        document.documentElement.setAttribute("data-theme", saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // 載入可用的供應商清單（由後端依環境變數決定）
  useEffect(() => {
    let cancelled = false;
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data: { providers: ProviderPublic[]; default: string }) => {
        if (cancelled) return;
        const list = data.providers || [];
        setProviders(list);
        let savedProvider = "";
        try {
          savedProvider = localStorage.getItem("ytof-provider") || "";
        } catch {
          /* ignore */
        }
        const pick =
          list.find((p) => p.id === savedProvider)?.id ||
          list.find((p) => p.id === data.default)?.id ||
          list[0]?.id ||
          "";
        setProviderId(pick);
        const def = list.find((p) => p.id === pick);
        if (def) setModel(def.defaultModel);
      })
      .catch(() => {
        /* 離線或端點錯誤時保持空清單 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onProviderChange = useCallback(
    (id: string) => {
      setProviderId(id);
      const def = providers.find((p) => p.id === id);
      if (def) setModel(def.defaultModel);
      try {
        localStorage.setItem("ytof-provider", id);
      } catch {
        /* ignore */
      }
    },
    [providers],
  );

  const autoGrow = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = useCallback(async () => {
    if (busy) {
      abortRef.current?.abort();
      return;
    }
    const text = input.trim();
    if (!text) return;

    setError(null);
    const next: Msg[] = [
      ...messages,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ];
    setMessages(next);
    setInput("");
    setBusy(true);
    requestAnimationFrame(autoGrow);

    const controller = new AbortController();
    abortRef.current = controller;

    // 送給 API 的對話（不含剛加入的空 assistant 佔位）
    const payload = next.slice(0, -1);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, model, messages: payload }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `伺服器回應 ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err: unknown) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) {
        const msg = err instanceof Error ? err.message : "連線發生錯誤";
        setError(msg);
      }
      setMessages((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          copy.pop(); // 移除空佔位
        }
        return copy;
      });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [busy, input, messages, autoGrow, providerId, model]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setBusy(false);
    setInput("");
  }, []);

  const lastIndex = messages.length - 1;

  return (
    <div className="app">
      <header className="mast">
        <div className="brandrow">
          <div className="seal">智</div>
          <div className="brandtext">
            <h1>一人公司頂級智囊團</h1>
            <p>Youthinkourfuture · 12 位顧問</p>
          </div>
          <div className="masttools">
            <button className="icon-btn" type="button" onClick={toggleTheme} title="切換深淺色">
              ◐ 主題
            </button>
            <button className="icon-btn" type="button" onClick={reset}>
              ↺ 重新開始
            </button>
          </div>
        </div>

        <details className="roster">
          <summary>
            <span className="dot" /> 顧問團名單與核心視角 <span className="chev">▼</span>
          </summary>
          <div className="roster-body">
            {ROSTER.map((g) => (
              <div key={g.label}>
                <div className="rgroup-label">{g.label}</div>
                <div className="rgrid">
                  {g.items.map((it) => (
                    <div className="radv" key={it.num}>
                      <span className="rnum">{it.num}</span>
                      <div>
                        <b>{it.name}</b> <span>{it.focus}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      </header>

      <main>
        {messages.length === 0 ? (
          <div className="intro">
            <p className="lead">把一個點子，交給 12 位頂尖顧問</p>
            <p className="sub">
              輸入你的構想，智囊團會激辯、收斂策略，並產出含程式碼與 Google Drive
              自動交付流程的落地藍圖。試試這些點子：
            </p>
            <div className="seeds">
              {SEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="seed"
                  onClick={() => {
                    setInput(s);
                    requestAnimationFrame(() => {
                      autoGrow();
                      taRef.current?.focus();
                    });
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const live = busy && i === lastIndex && m.role === "assistant";
            if (m.role === "user") {
              return (
                <div className="msg user" key={i}>
                  <div className="who">你的點子</div>
                  <div className="bubble">{m.content}</div>
                </div>
              );
            }
            return (
              <div className="msg bot" key={i}>
                <div className="who">
                  <span className="dot" /> 智囊團會議紀錄
                </div>
                <div className="bubble">
                  {m.content ? (
                    <BotBubble content={m.content} live={live} />
                  ) : (
                    <div className="thinking">
                      <span className="pulse" />
                      顧問們正在閉門會議…
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {error && <div className="errbar">⚠️ {error}</div>}
        <div ref={endRef} />
      </main>

      <div className="composer">
        {providers.length > 0 ? (
          <div className="modelbar">
            <span className="mb-label">模型</span>
            <select
              className="mb-select"
              value={providerId}
              onChange={(e) => onProviderChange(e.target.value)}
              aria-label="選擇模型供應商"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <input
              className="mb-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="模型名稱"
              spellCheck={false}
              aria-label="模型名稱"
            />
          </div>
        ) : (
          <div className="modelbar warn">
            尚未啟用任何模型供應商 — 請在環境變數設定金鑰或本地端點（見 README）。
          </div>
        )}
        <div className="composer-inner">
          <textarea
            id="idea"
            ref={taRef}
            rows={1}
            placeholder="輸入你的點子或構想，例如：我想幫健身教練做一個自動生成課表的工具…"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className={"send" + (busy ? " stop" : "")}
            type="button"
            onClick={send}
            disabled={!busy && input.trim().length === 0}
          >
            {busy ? "停止" : "啟動會議"}
          </button>
        </div>
        <div className="hint">
          智囊團會依點子跑「群雄激辯 → 戰略收斂 → 落地藍圖 → 可交付 Prompt」四階段 ·
          Cmd/Ctrl + Enter 送出
        </div>
      </div>
    </div>
  );
}

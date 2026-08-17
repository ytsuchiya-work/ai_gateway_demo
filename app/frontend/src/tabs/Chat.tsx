import { useEffect, useRef, useState } from "react";
import { api, type ChatResp, type Mode, type Prompt } from "../api";

interface Msg {
  role: "user" | "assistant";
  text: string;
  resp?: ChatResp;
}

const CAT_LABEL: Record<string, string> = {
  normal: "通常",
  pii: "PII含む",
  jailbreak: "ジェイルブレイク",
  unsafe: "不適切",
};
const CAT_CLASS: Record<string, string> = {
  normal: "cat-normal",
  pii: "cat-pii",
  jailbreak: "cat-jail",
  unsafe: "cat-unsafe",
};

export default function Chat({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [auditUrl, setAuditUrl] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.prompts().then(setPrompts).catch(() => {});
    api.config().then((c) => setAuditUrl(c?.audit_log_url || "")).catch(() => {});
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const on = mode === "withgw";

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const resp = await api.chat(mode, text);
      if (resp.rate_limited) {
        setMsgs((m) => [
          ...m,
          { role: "assistant", text: "⛔ レート制限 (HTTP 429): AI Gateway により制限されました。しばらく待って再試行してください。", resp },
        ]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", text: resp.response || "(応答なし)", resp }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "エラーが発生しました。", resp: undefined }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-wrap">
      <div className="chat-side">
        <div className={`mode-banner ${on ? "on" : "off"}`}>
          <div className="mb-head">{on ? "🛡️ ガバナンスあり" : "⚠️ ガバナンスなし"}</div>
          <ul>
            <li className={on ? "yes" : "no"}>{on ? "✓" : "✗"} 有害コンテンツ遮断 (gurdrail_unsafe_content)</li>
            <li className={on ? "yes" : "no"}>{on ? "✓" : "✗"} ジェイルブレイク遮断 (gurdrail_jail_break)</li>
            <li className={on ? "yes" : "no"}>{on ? "✓" : "✗"} PII保護 (gurdrail_custom_PII)</li>
            <li className={on ? "yes" : "no"}>{on ? "✓" : "✗"} レート制限 / 監査ログ (GW適用)</li>
          </ul>
          <button className="mode-switch-btn" onClick={() => setMode(on ? "nogw" : "withgw")}>
            {on ? "ガバナンスを無効化" : "ガバナンスを有効化"}
          </button>
        </div>

        <div className="prompt-lib">
          <h3>テストプロンプト</h3>
          <p className="hint">クリックで挿入。カテゴリで挙動の違いを比較。</p>
          {prompts.map((p) => (
            <button
              key={p.id}
              className={`prompt-chip ${CAT_CLASS[p.category] || ""}`}
              onClick={() => send(p.text)}
              disabled={busy}
              title={p.text}
            >
              <span className="chip-cat">{CAT_LABEL[p.category] || p.category}</span>
              {p.label.replace(/^[^:]+:\s*/, "")}
            </button>
          ))}
        </div>
      </div>

      <div className="chat-main">
        <div className="chat-log">
          {msgs.length === 0 && (
            <div className="empty">
              左のテストプロンプトをクリックするか、下の入力欄から質問してください。<br />
              上部トグルで <b>AI Gateway の有無</b> を切り替えて挙動を比較できます。
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              <div className="bubble-body">{m.text}</div>
              {m.role === "assistant" && m.resp && <Badges resp={m.resp} auditUrl={auditUrl} />}
            </div>
          ))}
          {busy && (
            <div className="bubble assistant">
              <div className="bubble-body typing">生成中{on ? " (ガードレール適用中)" : ""}…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="サポートへの質問を入力…"
            disabled={busy}
          />
          <button onClick={() => send(input)} disabled={busy || !input.trim()}>
            送信
          </button>
        </div>
      </div>
    </div>
  );
}

function Badges({ resp, auditUrl }: { resp: ChatResp; auditUrl: string }) {
  const g = resp.governance;
  const m = resp.metrics;
  if (!g?.enabled) {
    return (
      <div className="badges">
        <span className="badge gray">ガバナンスなし</span>
        <span className="badge gray">監査記録なし</span>
        {m && <span className="badge dim">{m.latency_ms}ms · {m.output_tokens}tok</span>}
      </div>
    );
  }
  return (
    <div className="badges">
      {g.blocked ? (
        <>
          <span className="badge red">⛔ GWブロック: {g.policy_name || g.safety_verdict}</span>
          <span className="badge dim">モデル未実行 (0 tok)</span>
        </>
      ) : (
        <span className="badge green">✓ ガードレール通過</span>
      )}
      {g.logged && (auditUrl ? (
        <a className="badge blue as-link" href={auditUrl} target="_blank" rel="noreferrer" title="ワークスペースの監査ログを開く">📋 監査記録: {g.request_id} ↗</a>
      ) : (
        <span className="badge blue">📋 監査記録: {g.request_id}</span>
      ))}
      {m && m.latency_ms > 0 && <span className="badge dim">{m.latency_ms}ms · {m.output_tokens}tok</span>}
      {g.blocked && g.policy_reason && (
        <div className="policy-reason">検知理由: {g.policy_reason}</div>
      )}
    </div>
  );
}

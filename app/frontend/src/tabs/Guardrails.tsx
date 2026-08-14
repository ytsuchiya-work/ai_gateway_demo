import { useEffect, useState } from "react";
import { api, type ChatResp, type Prompt } from "../api";

export default function Guardrails() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [nogw, setNogw] = useState<ChatResp | null>(null);
  const [withgw, setWithgw] = useState<ChatResp | null>(null);

  useEffect(() => {
    api.prompts().then((p) => {
      setPrompts(p.filter((x) => x.category === "pii" || x.category === "unsafe" || x.category === "jailbreak"));
    });
  }, []);

  async function compare(text: string) {
    if (!text.trim() || busy) return;
    setInput(text);
    setBusy(true);
    setNogw(null);
    setWithgw(null);
    try {
      const [a, b] = await Promise.all([api.chat("nogw", text), api.chat("withgw", text)]);
      setNogw(a);
      setWithgw(b);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>入出力管理 (ガードレール)</h2>
          <p className="muted">
            同じ入力を <b>ガバナンスなし</b> と <b>ガバナンスあり</b> の両方へ同時送信し、
            PIIマスク・安全性ブロックの違いを並べて比較します。ガードレールは Databricks の
            <code> ai_mask</code> / <code>ai_query</code> で実装しています。
          </p>
        </div>
      </div>

      <div className="gr-prompts">
        {prompts.map((p) => (
          <button key={p.id} className="prompt-chip cat-pii" disabled={busy} onClick={() => compare(p.text)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="composer wide">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && compare(input)}
          placeholder="PII や不適切な内容を含む入力を試す…"
          disabled={busy}
        />
        <button onClick={() => compare(input)} disabled={busy || !input.trim()}>
          {busy ? "比較中…" : "並べて比較"}
        </button>
      </div>

      <div className="compare">
        <Side title="⚠️ ガバナンスなし" cls="off" resp={nogw} raw={input} />
        <Side title="🛡️ ガバナンスあり" cls="on" resp={withgw} raw={input} />
      </div>
    </div>
  );
}

function Side({ title, cls, resp, raw }: { title: string; cls: string; resp: ChatResp | null; raw: string }) {
  const g = resp?.governance;
  return (
    <div className={`side ${cls}`}>
      <div className="side-head">{title}</div>
      {!resp ? (
        <div className="empty small">未実行</div>
      ) : (
        <>
          <div className="step">
            <div className="step-lbl">① 入力</div>
            <div className="step-box">
              {g?.enabled && g.pii_input_masked ? (
                <>
                  <div className="line-through">{raw}</div>
                  <div className="masked">↓ PIIマスク後: {g.masked_input}</div>
                </>
              ) : (
                <div>{raw}</div>
              )}
            </div>
          </div>
          <div className="step">
            <div className="step-lbl">② 安全性チェック</div>
            <div className="step-box">
              {g?.enabled ? (
                g.blocked ? (
                  <span className="pill red">⛔ ブロック ({g.safety_verdict})</span>
                ) : (
                  <span className="pill green">✓ {g.safety_verdict}</span>
                )
              ) : (
                <span className="pill gray">チェックなし (素通り)</span>
              )}
            </div>
          </div>
          <div className="step">
            <div className="step-lbl">③ 応答</div>
            <div className="step-box resp">{resp.response}</div>
          </div>
          <div className="step">
            <div className="step-lbl">④ 監査</div>
            <div className="step-box">
              {g?.enabled && g.logged ? (
                <span className="pill blue">📋 記録済み {g.request_id}</span>
              ) : (
                <span className="pill gray">記録なし</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

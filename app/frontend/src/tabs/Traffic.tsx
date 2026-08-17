import { useState } from "react";
import { api, type Mode } from "../api";

interface Row {
  i: number;
  status: "sending" | "done";
  code?: number;
  content?: string;
  latency_ms?: number;
  policy?: string | null;
}

const N = 10;

export default function Traffic({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [prompt, setPrompt] = useState("");
  const on = mode === "withgw";

  async function run() {
    setRunning(true);
    setRows([]);
    try {
      for (let i = 1; i <= N; i++) {
        setRows((prev) => [...prev, { i, status: "sending" }]);
        const r = await api.rateOne(mode);
        if (i === 1) setPrompt(r.prompt);
        setRows((prev) => prev.map((x) => (x.i === i ? { ...x, ...r, status: "done" } : x)));
      }
    } finally {
      setRunning(false);
    }
  }

  const ok = rows.filter((r) => r.status === "done" && r.code === 200 && !r.policy).length;
  const limited = rows.filter((r) => r.code === 429).length;
  const doneCount = rows.filter((r) => r.status === "done").length;

  function kind(r: Row): { cls: string; label: string } {
    if (r.status === "sending") return { cls: "sending", label: "送信中…" };
    if (r.code === 429) return { cls: "blocked", label: "429 レート制限" };
    if (r.code === 200 && r.policy) return { cls: "policy", label: `ポリシー: ${r.policy}` };
    if (r.code === 200) return { cls: "ok", label: "200 OK" };
    return { cls: "err", label: `エラー (${r.code})` };
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>トラフィック制御 (レート制限)</h2>
          <p className="muted">
            AI Gateway の QPM 制限（<b>3 回/分</b>）により、ガバナンス有効時のエンドポイントは
            1 分あたり 3 リクエストに制限されます。<b>{N} 回連続</b>で呼び出し、各リクエストと応答を
            リアルタイムに表示します。上限を超えたリクエストは <b>HTTP 429</b> で拒否されます。
            ガバナンスなしのエンドポイントは無制限です。
          </p>
        </div>
      </div>

      <div className="config-cards">
        <div className={`cfg-card ${on ? "dim" : "active"}`}>
          <h4>ガバナンスなし <code>endpoint_no_gw</code></h4>
          <div className="cfg-val">レート制限: <b>なし (無制限)</b></div>
          <p>DoS・コスト暴走・特定ユーザーの独占を防げない</p>
        </div>
        <div className={`cfg-card ${on ? "active" : "dim"}`}>
          <h4>ガバナンスあり <code>endpoint_with_gw</code></h4>
          <div className="cfg-val">レート制限: <b>QPM = 3 (3 回/分)</b></div>
          <p>超過リクエストは自動的に 429 で拒否。悪用・暴走を抑制</p>
        </div>
      </div>

      <div className="run-row">
        <div className="seg">
          <button className={`seg-btn ${!on ? "sel" : ""}`} onClick={() => setMode("nogw")} disabled={running}>ガバナンスなし</button>
          <button className={`seg-btn ${on ? "sel" : ""}`} onClick={() => setMode("withgw")} disabled={running}>ガバナンスあり</button>
        </div>
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? `実行中… (${doneCount}/${N})` : `▶ ${N} 回連続で呼び出し`}
        </button>
      </div>

      {(rows.length > 0 || running) && (
        <>
          <div className="rate-legend">
            <span className="lg ok">成功 {ok}</span>
            <span className="lg blocked">429 制限 {limited}</span>
            {prompt && <span className="probe-prompt">送信プロンプト: 「{prompt}」</span>}
          </div>

          <div className="live-log">
            <div className="log-row head">
              <div className="log-i">#</div>
              <div className="log-status">ステータス</div>
              <div className="log-resp">レスポンス</div>
              <div className="log-lat">遅延</div>
            </div>
            {rows.map((r) => {
              const k = kind(r);
              return (
                <div key={r.i} className={`log-row ${k.cls}`}>
                  <div className="log-i">#{r.i}</div>
                  <div className={`log-status ${k.cls}`}>{k.label}</div>
                  <div className="log-resp">
                    {r.status === "sending"
                      ? "…"
                      : r.code === 429
                      ? "QPM 上限超過のため拒否されました"
                      : r.content || "(応答なし)"}
                  </div>
                  <div className="log-lat">{r.status === "done" && r.code !== 429 ? `${r.latency_ms}ms` : "—"}</div>
                </div>
              );
            })}
          </div>

          {!running && rows.length > 0 && (
            <p className="muted">
              {on
                ? `QPM=3 を超えた ${limited} 件が 429 で拒否されました。これが AI Gateway のトラフィック制御です。`
                : "全リクエストが成功しました。ガバナンスなしでは制限がかからず、コストや悪用のリスクが残ります。"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

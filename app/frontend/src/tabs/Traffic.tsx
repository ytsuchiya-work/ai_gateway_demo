import { useState } from "react";
import { api, type Mode } from "../api";

export default function Traffic({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<any>(null);
  const on = mode === "withgw";

  async function run() {
    setRunning(true);
    setRes(null);
    try {
      setRes(await api.rateTest(mode, 25));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>トラフィック制御 (レート制限)</h2>
          <p className="muted">
            AI Gateway の rate limit により、ガバナンス有効時のエンドポイントは
            AI Gateway のレート制限が適用されています。25回連続で呼び出し、超過分が
            <b> HTTP 429</b> で拒否される様子を確認します。ガバナンスなしのエンドポイントは無制限です。
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
          <div className="cfg-val">レート制限: <b>AI Gateway 適用</b></div>
          <p>超過リクエストは自動的に 429 で拒否。悪用・暴走を抑制</p>
        </div>
      </div>

      <div className="run-row">
        <div className="seg">
          <button className={`seg-btn ${!on ? "sel" : ""}`} onClick={() => setMode("nogw")}>ガバナンスなし</button>
          <button className={`seg-btn ${on ? "sel" : ""}`} onClick={() => setMode("withgw")}>ガバナンスあり</button>
        </div>
        <button className="btn primary" onClick={run} disabled={running}>
          {running ? "実行中…" : "▶ 25回連続で呼び出し"}
        </button>
      </div>

      {res && (
        <div className="rate-result">
          <div className="rate-bars">
            {res.results.map((r: any) => (
              <div
                key={r.i}
                className={`rate-cell ${r.code === 200 ? "ok" : r.code === 429 ? "blocked" : "err"}`}
                title={`#${r.i}: HTTP ${r.code}`}
              >
                {r.i}
              </div>
            ))}
          </div>
          <div className="rate-legend">
            <span className="lg ok">成功 {res.ok}</span>
            <span className="lg blocked">429 制限 {res.rate_limited}</span>
            {res.other > 0 && <span className="lg err">その他 {res.other}</span>}
          </div>
          <p className="muted">
            {on
              ? "上限を超えたリクエストが 429 で拒否されました。これが AI Gateway のトラフィック制御です(分散カウンタのため上限付近は多少前後します)。"
              : "全リクエストが成功しました。ガバナンスなしでは制限がかからず、コストや悪用のリスクが残ります。"}
          </p>
        </div>
      )}
    </div>
  );
}

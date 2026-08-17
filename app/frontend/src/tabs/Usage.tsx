import { useEffect, useState } from "react";
import { api, type UsageResp } from "../api";

const APP_SP = "2faf7f11-4728-46f0-b278-5e7a1cf2958e";
function reqName(r: string) {
  return r === APP_SP ? "ai-gateway-demo (アプリSP)" : r;
}

export default function Usage() {
  const [d, setD] = useState<UsageResp | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setD(await api.usage());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const s = d?.summary;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>使用状況 (Usage)</h2>
          <p className="muted">
            AI Gateway が全リクエストを記録する <code>system.ai_gateway.usage</code> システムテーブルから、
            消費トークン・使用モデル・リクエスト元プリンシパル・推定コストを集計します。
            {d?.audit_log_url && (
              <> <a className="ext-link" href={d.audit_log_url} target="_blank" rel="noreferrer">
                システムテーブルを開く ↗
              </a></>
            )}
          </p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>{loading ? "更新中…" : "🔄 更新"}</button>
      </div>

      {d && !d.available && (
        <div className="notice warn">使用状況を取得できませんでした: {d.error}</div>
      )}

      {s && (
        <>
          <div className="usage-tiles">
            <div className="utile"><div className="ut-num">{s.requests.toLocaleString()}</div><div className="ut-lbl">総リクエスト</div></div>
            <div className="utile"><div className="ut-num">{s.total_tokens.toLocaleString()}</div><div className="ut-lbl">総トークン</div></div>
            <div className="utile"><div className="ut-num">{s.input_tokens.toLocaleString()}</div><div className="ut-lbl">入力トークン</div></div>
            <div className="utile"><div className="ut-num">{s.output_tokens.toLocaleString()}</div><div className="ut-lbl">出力トークン</div></div>
            <div className="utile cost"><div className="ut-num">${s.est_cost_usd}</div><div className="ut-lbl">推定コスト<br /><span className="ut-sub">≈${d?.cost_rate_per_1k}/1K tok</span></div></div>
          </div>

          <div className="usage-grid">
            <div className="usage-card">
              <h3>使用モデル別</h3>
              <UsageTable rows={d!.by_model!} label="モデル" />
            </div>
            <div className="usage-card">
              <h3>リクエスト元(ユーザー/SP)別</h3>
              <UsageTable rows={d!.by_requester!} label="プリンシパル" fmt={reqName} />
            </div>
            <div className="usage-card">
              <h3>エンドポイント別</h3>
              <UsageTable rows={d!.by_endpoint!} label="エンドポイント" fmt={(k) => k.split(".").pop() || k} />
            </div>
          </div>

          <h3>最近のリクエスト（system.ai_gateway.usage）</h3>
          <div className="table-scroll">
            <table className="audit-table">
              <thead>
                <tr><th>時刻(UTC)</th><th>エンドポイント</th><th>リクエスト元</th><th>種別</th><th>モデル</th><th>状態</th><th>tokens</th><th>遅延</th></tr>
              </thead>
              <tbody>
                {d!.recent!.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.event_time?.slice(0, 19)}</td>
                    <td>{r.endpoint}</td>
                    <td className="cell-clip">{reqName(r.requester)}</td>
                    <td><span className={`pill ${r.requester_type === "SERVICE_PRINCIPAL" ? "blue" : "gray"}`}>{r.requester_type === "SERVICE_PRINCIPAL" ? "SP" : "ユーザー"}</span></td>
                    <td className="mono">{r.model}</td>
                    <td><span className={`pill ${r.status_code === "200" ? "green" : "red"}`}>{r.status_code}</span></td>
                    <td className="mono">{r.total_tokens}</td>
                    <td className="mono">{r.latency_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            ※ コストは総トークン数 × 概算単価による推定値です（正確な課金は <code>system.billing.usage</code> を参照）。
          </p>
        </>
      )}
    </div>
  );
}

function UsageTable({ rows, label, fmt }: { rows: { key: string; requests: number; total_tokens: number }[]; label: string; fmt?: (k: string) => string }) {
  return (
    <table className="mini-table">
      <thead><tr><th>{label}</th><th>件数</th><th>tokens</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="cell-clip">{fmt ? fmt(r.key) : r.key}</td>
            <td className="mono">{r.requests}</td>
            <td className="mono">{r.total_tokens.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

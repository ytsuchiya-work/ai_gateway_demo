import { useEffect, useState } from "react";
import { api, type AuditRow, type Mode } from "../api";

export default function Audit({ mode }: { mode: Mode }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [summary, setSummary] = useState({ withgw: 0, nogw: 0 });
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api.audit();
      setRows(d.rows || []);
      setSummary(d.summary || { withgw: 0, nogw: 0 });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const on = mode === "withgw";

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>監査ログ (Audit Trail)</h2>
          <p className="muted">
            AI Gateway の usage tracking により、ガバナンス有効時は全リクエストが自動で
            Inference Table に記録されます。下表はアプリが記録したライブ監査ログです
            (プラットフォーム側の <code>ai_gateway_demo.withgw_audit_payload</code> にも同時に蓄積)。
          </p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "更新中…" : "🔄 更新"}
        </button>
      </div>

      <div className="stat-row">
        <div className="stat on">
          <div className="stat-num">{summary.withgw}</div>
          <div className="stat-lbl">ガバナンスあり<br />記録件数</div>
        </div>
        <div className="stat off">
          <div className="stat-num">{summary.nogw}</div>
          <div className="stat-lbl">ガバナンスなし<br />記録件数</div>
        </div>
      </div>

      {!on && (
        <div className="notice warn">
          現在 <b>ガバナンスなし</b> モードです。この状態のリクエストは
          <b> 一切記録されません</b>（監査証跡が残らない = 誰が・何を・いつ問い合わせたか追跡不能）。
          上部トグルで有効化すると、以降のリクエストが下表に記録されます。
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          監査ログはまだありません。チャットタブで <b>ガバナンスあり</b> にして質問すると記録されます。
        </div>
      ) : (
        <div className="table-scroll">
          <table className="audit-table">
            <thead>
              <tr>
                <th>時刻(UTC)</th>
                <th>リクエストID</th>
                <th>安全性</th>
                <th>アクション</th>
                <th>入力(マスク後)</th>
                <th>応答</th>
                <th>tok(in/out)</th>
                <th>遅延</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.request_id}>
                  <td className="mono">{r.ts?.slice(0, 19)}</td>
                  <td className="mono">{r.request_id}</td>
                  <td>
                    <span className={`pill ${r.safety_verdict === "safe" ? "green" : "red"}`}>
                      {r.safety_verdict}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${r.action === "blocked" ? "red" : r.action === "masked" ? "amber" : "gray"}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="cell-clip">{r.masked_input}</td>
                  <td className="cell-clip">{r.model_output}</td>
                  <td className="mono">{r.input_tokens}/{r.output_tokens}</td>
                  <td className="mono">{r.latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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
  // 現在のトグル(GWのON/OFF)に対応するログだけを表示する
  const visible = rows.filter((r) => r.mode === mode);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>監査ログ (Audit Trail)</h2>
          <p className="muted">
            AI Gateway の usage tracking により、ガバナンス有効時は全リクエストが自動で
            Inference Table に記録されます。下表は現在のトグル状態
            (<b>{on ? "ガバナンスあり" : "ガバナンスなし"}</b>) のログを表示しています。
            ブロックされたリクエストはモデルに到達しないため tok/遅延は「—」です。
          </p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "更新中…" : "🔄 更新"}
        </button>
      </div>

      <div className="stat-row">
        <div className={`stat on ${on ? "" : "faded"}`}>
          <div className="stat-num">{summary.withgw}</div>
          <div className="stat-lbl">ガバナンスあり<br />記録件数</div>
        </div>
        <div className={`stat off ${on ? "faded" : ""}`}>
          <div className="stat-num">{summary.nogw}</div>
          <div className="stat-lbl">ガバナンスなし<br />記録件数</div>
        </div>
      </div>

      {!on ? (
        <div className="notice warn">
          現在 <b>ガバナンスなし (GW OFF)</b> です。この状態のリクエストは
          <b> 一切記録されません</b>（誰が・何を・いつ問い合わせたか追跡不能）。
          上部トグルを ON にすると、以降のリクエストが監査ログに記録されます。
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="empty">
          {on
            ? "ガバナンスありの監査ログはまだありません。チャットタブで質問すると記録されます。"
            : "ガバナンスなし(GW OFF)では監査ログは記録されません。"}
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
              {visible.map((r) => {
                const blocked = r.action === "blocked";
                return (
                  <tr key={r.request_id}>
                    <td className="mono">{r.ts?.slice(0, 19)}</td>
                    <td className="mono">{r.request_id}</td>
                    <td>
                      <span className={`pill ${r.safety_verdict === "safe" ? "green" : "red"}`}>
                        {r.safety_verdict}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${blocked ? "red" : r.action === "masked" ? "amber" : "gray"}`}>
                        {r.action}
                      </span>
                    </td>
                    <td className="cell-clip">{r.masked_input}</td>
                    <td className="cell-clip">
                      {r.model_output}
                      {blocked && <span className="note-inline"> (モデル未実行)</span>}
                    </td>
                    <td className="mono">{blocked ? "—" : `${r.input_tokens}/${r.output_tokens}`}</td>
                    <td className="mono">{blocked ? "—" : `${r.latency_ms}ms`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api";

export default function Overview() {
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => {
    api.config().then(setCfg).catch(() => {});
  }, []);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>概要 — Unity AI Gateway とは</h2>
          <p className="muted">
            Unity AI Gateway は、LLM/エージェントへのすべてのトラフィックを一元的に仲介し、
            <b>監査性・トラフィック制御・入出力管理</b> を提供するガバナンス層です。
          </p>
        </div>
      </div>

      <div className="arch">
        <div className="arch-col">
          <div className="arch-title off">ガバナンスなし</div>
          <div className="flow">
            <div className="node app">アプリ / ユーザー</div>
            <div className="arrow">→</div>
            <div className="node llm">LLM エンドポイント</div>
          </div>
          <div className="arch-note off">
            誰が何を送ったか不明・無制限・PII素通り・有害入力も通過
          </div>
        </div>
        <div className="arch-col">
          <div className="arch-title on">ガバナンスあり (AI Gateway)</div>
          <div className="flow">
            <div className="node app">アプリ / ユーザー</div>
            <div className="arrow">→</div>
            <div className="node gw">AI Gateway<br /><small>監査 / 制限 / ガードレール</small></div>
            <div className="arrow">→</div>
            <div className="node llm">LLM エンドポイント</div>
          </div>
          <div className="arch-note on">
            全リクエストを記録・レート制限・PIIマスク・安全性フィルタ
          </div>
        </div>
      </div>

      <table className="compare-table">
        <thead>
          <tr><th>観点</th><th>ガバナンスなし</th><th>ガバナンスあり (AI Gateway)</th></tr>
        </thead>
        <tbody>
          <tr><td>監査性 (誰が/何を/いつ)</td><td className="no">✗ 追跡不能</td><td className="yes">✓ Inference Table に自動記録</td></tr>
          <tr><td>トラフィック制御</td><td className="no">✗ 無制限</td><td className="yes">✓ レート制限 (5回/分)</td></tr>
          <tr><td>入力の PII 保護</td><td className="no">✗ 素通り</td><td className="yes">✓ ai_mask でマスク</td></tr>
          <tr><td>安全性 / インジェクション</td><td className="no">✗ 無防備</td><td className="yes">✓ ai_query でブロック</td></tr>
          <tr><td>出力の PII 漏洩防止</td><td className="no">✗ そのまま返却</td><td className="yes">✓ 出力もマスク</td></tr>
        </tbody>
      </table>

      {cfg && (
        <div className="cfg-detail">
          <h3>実際のエンドポイント構成</h3>
          <div className="cfg-grid">
            <div className="cfg-box off">
              <h4><code>{cfg.nogw?.name}</code></h4>
              <p>AI Gateway: <b>{cfg.nogw?.has_gateway ? "あり" : "なし"}</b></p>
            </div>
            <div className="cfg-box on">
              <h4><code>{cfg.withgw?.name}</code></h4>
              <ul>
                <li>usage tracking: <b>{cfg.withgw?.usage_tracking ? "有効" : "-"}</b></li>
                <li>inference table: <code>{cfg.withgw?.inference_table || "-"}</code></li>
                <li>rate limit: <b>{cfg.withgw?.rate_limit || "-"}</b></li>
                <li>guardrails: <b>{cfg.guardrails?.pii_mask}</b>, <b>{cfg.guardrails?.safety}</b></li>
              </ul>
            </div>
          </div>
          <p className="muted small">
            ※ 当ワークスペース(東京リージョン)では AI Gateway ネイティブ guardrails が未提供のため、
            入出力ガードレールは Databricks AI Functions (ai_mask / ai_query) で実装しています。
            監査・レート制限は AI Gateway のネイティブ機能をそのまま使用しています。
          </p>
        </div>
      )}
    </div>
  );
}

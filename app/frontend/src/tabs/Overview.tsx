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
          <tr><td>安全性 (有害コンテンツ)</td><td className="no">✗ モデル任せ (不確実)</td><td className="yes">✓ ネイティブGWガードレール gurdrail_unsafe_content でブロック</td></tr>
          <tr><td>ジェイルブレイク / インジェクション</td><td className="no">✗ モデル任せ</td><td className="yes">✓ ネイティブGWガードレール gurdrail_jail_break でブロック</td></tr>
          <tr><td>トラフィック制御</td><td className="no">✗ 無制限</td><td className="yes">✓ レート制限 (GW適用)</td></tr>
          <tr><td>PII 保護 (入出力)</td><td className="no">✗ 素通り</td><td className="yes">✓ ai_mask でマスク (補完)</td></tr>
          <tr><td>監査性 (誰が/何を/いつ)</td><td className="no">✗ 追跡不能</td><td className="yes">✓ 監査ログに自動記録</td></tr>
        </tbody>
      </table>

      {cfg && (
        <div className="cfg-detail">
          <h3>実際のエンドポイント構成</h3>
          <div className="cfg-grid">
            <div className="cfg-box off">
              <h4><code>{cfg.nogw?.name}</code></h4>
              <p>AI Gateway ガードレール: <b>なし</b></p>
              <p>レート制限: <b>なし (無制限)</b></p>
            </div>
            <div className="cfg-box on">
              <h4><code>{cfg.withgw?.name}</code></h4>
              <ul>
                <li>ネイティブ・ガードレール: {(cfg.withgw?.guardrails || []).map((g: string) => <code key={g}>{g} </code>)}</li>
                <li>レート制限: <b>{cfg.withgw?.rate_limit ? "適用あり" : "-"}</b></li>
                <li>PIIマスク: <b>{cfg.withgw?.pii_mask}</b></li>
              </ul>
            </div>
          </div>
          <p className="muted small">
            呼び出しは AI Gateway 統合ルート <code>{cfg.gateway_route}</code> 経由、
            モデルはカタログ修飾名で指定します。安全性・ジェイルブレイクは
            <b> AI Gateway のネイティブ service policy</b> がブロックし、PII は Databricks AI Function
            <code> ai_mask</code> で補完的にマスクします。
          </p>
        </div>
      )}
    </div>
  );
}

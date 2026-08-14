# Unity AI Gateway ガバナンス比較デモ

LLM / エージェントに対するガバナンスが **Unity AI Gateway の有無** でどう変わるかを、
カスタマーサポート AI を題材に視覚的に示すデモです。アプリ上部のトグルで
「ガバナンスなし」⇄「ガバナンスあり」を切り替え、**監査性・トラフィック制御・入出力管理**
の 3 つの観点で挙動の違いを比較できます。

すべての資産（ダミーデータ・サービングエンドポイント・アプリ）は
**Databricks Asset Bundle (DAB)** でデプロイします。

- **GitHub**: https://github.com/ytsuchiya-work/ai_gateway_demo
- **ワークスペース**: `fevm-classic-stable-ytcy`
- **カタログ/スキーマ**: `classic_stable_ytcy_catalog.ai_gateway_demo`
- **アプリURL**: https://ai-gateway-demo-7474645908464260.aws.databricksapps.com

---

## デモで見せられること

| 観点 | ガバナンスなし (`ai-gw-demo-nogw`) | ガバナンスあり (`ai-gw-demo-withgw`) |
|---|---|---|
| **監査性** | 記録なし・追跡不能 | 全リクエストを自動記録 (Inference Table + アプリ監査ログ) |
| **トラフィック制御** | 無制限 | レート制限 10 回/分 → 超過は HTTP 429 |
| **入力の PII 保護** | 素通り | `ai_mask` で氏名/電話/カード/メール/住所をマスク |
| **安全性 / インジェクション** | 無防備 | `ai_query` で harmful / jailbreak をブロック |
| **出力の PII 漏洩防止** | そのまま返却 | 出力も `ai_mask` でマスク |

### 画面（5 タブ）
1. **チャット** — トグルで挙動比較。応答にガードレール判定バッジ（安全性・PIIマスク・監査記録）を表示。
2. **監査ログ** — ガバナンスあり時のリクエストを一覧表示。なし時は「記録なし」。
3. **トラフィック制御** — 15 回連続呼び出しで 429 による制限を可視化。
4. **入出力管理** — 同じ入力を両モードへ同時送信し、マスク/ブロックの違いを左右比較。
5. **概要** — 構成図・比較表・実際のエンドポイント構成（ライブ取得）。

---

## アーキテクチャ

```
アプリ (React + FastAPI, Databricks Apps)
   │  mode トグル
   ├─ nogw  → ai-gw-demo-nogw  (external_model) ─┐
   │                                             ├─→ FM API: databricks-meta-llama-3-1-8b-instruct
   └─ withgw→ ai-gw-demo-withgw (external_model) ─┘   (OpenAI互換プロキシ / PAT はシークレット)
                    │
                    ├─ AI Gateway: usage tracking → Inference Table (withgw_audit_payload)
                    └─ AI Gateway: rate limit 10/min
   withgw のガードレール (アプリ層):
     ├─ ai_mask     … 入力/出力の PII マスク
     └─ ai_query    … 安全性分類 (safe / harmful / jailbreak) → harmful,jailbreak をブロック
```

### 設計上のポイント / 制約
- **エンドポイントは `external_model` 型**で、ワークスペース自身の Foundation Model API
  (pay-per-token, OpenAI 互換) をプロキシします。認証には PAT をシークレット
  `ai_gateway_demo/fm_api_token` に格納して使用。**専用 GPU 不要・外部キー不要**で、
  課金は pay-per-token の実使用分のみ。
- **リクエストに `max_tokens` は送らない**こと。external_model(provider=openai) が内部で
  `max_completion_tokens` に変換し、FM API が拒否するため。出力長はシステムプロンプトで制御。
- **入出力ガードレールはアプリ層で実装**しています。当ワークスペース（東京リージョン）では
  AI Gateway ネイティブ guardrails のバックエンド `llama-guard-internal` が
  データレジデンシー制約で利用不可のためです（PII/safety いずれも）。代替として
  UC 管理下・監査可能な Databricks AI Functions（`ai_mask` / `ai_query`）を SQL Warehouse
  経由で呼び出しています。**監査（Inference Table）とレート制限は AI Gateway のネイティブ機能**
  をそのまま使用しています。
  - 別リージョン（US 等）のワークスペースであれば、`ai-gw-demo-withgw` の `ai_gateway.guardrails`
    に `pii`/`safety` を設定するだけで、ガードレールもネイティブ機能に置き換え可能です。

---

## 構成資産

| 種別 | 名前 | 備考 |
|---|---|---|
| スキーマ | `classic_stable_ytcy_catalog.ai_gateway_demo` | 全資産の格納先 |
| テーブル | `customers` | 顧客マスタ（PII含む・ダミー50件） |
| テーブル | `support_tickets` | サポート問い合わせ履歴（120件） |
| テーブル | `test_prompts` | アプリのクイック挿入プロンプト（通常/PII/ジェイルブレイク/不適切） |
| テーブル | `app_request_log` | アプリが記録するライブ監査ログ |
| テーブル | `withgw_audit_payload` | AI Gateway が自動生成する Inference Table |
| Job | `ai_gateway_demo データ生成` | 上記テーブルを生成 |
| サービングEP | `ai-gw-demo-nogw` | ガバナンスなし |
| サービングEP | `ai-gw-demo-withgw` | AI Gateway 適用（監査+レート制限） |
| App | `ai-gateway-demo` | React + FastAPI |
| Secret | `ai_gateway_demo/fm_api_token` | FM API プロキシ用 PAT（DAB管理外・手動作成） |

---

## デプロイ手順

### 前提（初回のみ・DAB管理外）
FM API プロキシ用の PAT をシークレットに格納します。
```bash
export DATABRICKS_CLI_DO_NOT_EXECUTE_NEWER_VERSION=1
P=fe-vm-classic-stable-ytcy
# PAT 発行
databricks tokens create --lifetime-seconds 7776000 --comment "ai_gateway_demo" --profile $P
# シークレットスコープ + 格納（<TOKEN> は上記の token_value）
databricks secrets create-scope ai_gateway_demo --profile $P
databricks secrets put-secret ai_gateway_demo fm_api_token --string-value "<TOKEN>" --profile $P
```

### バンドルのデプロイ
```bash
# フロントエンドをビルド（frontend/dist を生成 → デプロイ対象）
cd app/frontend && npm install && npm run build && cd ../..

# 資産をデプロイ（スキーマは data job が作成）
databricks bundle deploy -t dev
databricks bundle run generate_data -t dev        # ダミーデータ生成
databricks bundle run ai_gateway_demo_app -t dev  # アプリ起動（初回はコンピュート起動に数分）
```

### アプリ サービスプリンシパルへの権限付与（DAB管理外）
アプリの SP（`databricks apps get ai-gateway-demo` で確認）に以下を付与:
- 両サービングエンドポイントに `CAN_QUERY`
- SQL Warehouse に `CAN_USE`
- `GRANT USE CATALOG / USE SCHEMA / SELECT / MODIFY ON SCHEMA classic_stable_ytcy_catalog.ai_gateway_demo TO \`<sp-client-id>\``

> pay-per-token の FM エンドポイント（`ai_query`/`ai_mask` が内部利用）はワークスペース
> 既定でアクセス可能なため、個別付与は不要です。

---

## ローカル開発

```bash
cd app
python -m venv .venv && .venv/bin/pip install -r requirements.txt
export DATABRICKS_PROFILE=fe-vm-classic-stable-ytcy
.venv/bin/python -m uvicorn app:app --port 8000    # バックエンド
# 別ターミナルで
cd app/frontend && npm run dev                      # フロント (http://localhost:5173, /api を 8000 にプロキシ)
```

---

## デモの流れ（推奨シナリオ）

1. **概要タブ**で構成と 3 観点を説明。
2. **チャットタブ**（トグル OFF＝ガバナンスなし）で「PII: 本人確認情報」を送信
   → 氏名・電話・カード番号がそのまま処理され、監査記録も残らないことを見せる。
3. トグルを **ON**（ガバナンスあり）にして同じプロンプトを送信
   → PII がマスクされ、監査記録 ID が付与されることを見せる。
4. 「ジェイルブレイク」「不適切（危険物）」プロンプト → **ブロック**されることを見せる。
5. **監査ログタブ**で、ガバナンスありのリクエストのみが記録されている（なしは 0 件）ことを見せる。
6. **トラフィック制御タブ**で 15 回連続呼び出し → ON では 429 で制限、OFF では全通過。
7. **入出力管理タブ**で同一入力の左右比較を見せて締める。

---

## 後片付け

```bash
databricks bundle destroy -t dev --auto-approve
# シークレットは手動作成のため個別削除
databricks secrets delete-scope ai_gateway_demo --profile fe-vm-classic-stable-ytcy
```

> ⚠️ `destroy` はスキーマ配下のテーブルも削除します。

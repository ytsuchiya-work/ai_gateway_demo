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

| 観点 | ガバナンスなし (`endpoint_no_gw`) | ガバナンスあり (`endpoint_with_gw`) |
|---|---|---|
| **安全性 (有害コンテンツ)** | モデル任せ（不確実） | AI Gateway ネイティブ・ガードレール `gurdrail_unsafe_content` でブロック |
| **ジェイルブレイク/インジェクション** | モデル任せ | ネイティブ・ガードレール `gurdrail_jail_break` でブロック |
| **PII 保護** | 素通り | ネイティブ・ガードレール `gurdrail_custom_PII` でブロック |
| **トラフィック制御** | 無制限 | AI Gateway レート制限 → 超過は HTTP 429 |
| **監査性** | 記録なし・追跡不能 | 全リクエスト(入力/判定/応答/tok/遅延)を監査ログに自動記録 |

> 有害コンテンツ・ジェイルブレイク・PII はすべて **AI Gateway のネイティブ service policy**
> (`gurdrail_unsafe_content` / `gurdrail_jail_break` / `gurdrail_custom_PII`) がゲートウェイでブロックします。
> ブロック時は `finish_reason=content_filter` と `databricks_service_policy{name,reason}` が返り、
> アプリはポリシー名と検知理由を表示します。アプリ側の `ai_mask` / `ai_query` は使用しない完全ネイティブ構成です。
>
> ⚠️ これらは LLM 判定ポリシーのため発火は**文脈依存（非決定的）**です。同じ PII 文でもブロックされたり
> 通過したりします。デモで確実にブロックを見せるには「PII: カード番号照会」等の明確に機微な要求が有効です。

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
   │   AI Gateway 統合ルート: {host}/ai-gateway/mlflow/v1/chat/completions
   │   model = カタログ修飾名
   ├─ nogw  → classic_stable_ytcy_catalog.ai_gateway_demo.endpoint_no_gw   (ガードレール/制限なし)
   └─ withgw→ classic_stable_ytcy_catalog.ai_gateway_demo.endpoint_with_gw
                    ├─ ネイティブ service policy: gurdrail_unsafe_content /
                    │                             gurdrail_jail_break / gurdrail_custom_PII
                    └─ レート制限 (AI Gateway)
   監査: withgw の各リクエストを app_request_log に記録
```

### 設計上のポイント
- **これら2エンドポイントは Unity Catalog の AI Gateway エンドポイント**（`endpoint_with_gw` /
  `endpoint_no_gw`）で、**AI Gateway 統合ルート `/ai-gateway/mlflow/v1`** に対して
  **カタログ修飾のモデル名**で呼び出します（OpenAI 互換）。classic の
  `/serving-endpoints/{name}` パスや `serving-endpoints get` では見えません。
- **有害コンテンツ・ジェイルブレイク・PII のガードレールはすべてゲートウェイのネイティブ
  service policy**（`gurdrail_unsafe_content` / `gurdrail_jail_break` / `gurdrail_custom_PII`）が
  担います。ブロック時は `finish_reason=content_filter` と、`databricks_service_policy` に
  `name`/`reason` が入って返るため、アプリはこれを検知してポリシー名と検知理由を表示します。
  **アプリ側の `ai_mask` / `ai_query` は使用しません**（完全ネイティブ構成）。
- これらは LLM 判定ポリシーのため**発火は文脈依存（非決定的）**です。明確に機微・危険な要求は
  ブロックされ、正当な問い合わせは通過します（同じ文でも実行ごとに結果が変わり得ます）。
- **アプリのサービスプリンシパルには、両エンドポイントへの `Can Query` 付与が必要**です
  （エンドポイントの Permissions UI から付与）。付与がないとゲートウェイ呼び出しが 404 になります。
- 補足: 旧構成の `external_model` 型エンドポイント（`ai-gw-demo-nogw` / `ai-gw-demo-withgw`, DAB管理）は
  当リージョンでネイティブ guardrails が使えなかった時期の代替実装です。本デモはこの UC AI Gateway
  エンドポイントを使用します（旧EPは未使用。`bundle destroy` で削除可）。

---

## 構成資産

| 種別 | 名前 | 備考 |
|---|---|---|
| スキーマ | `classic_stable_ytcy_catalog.ai_gateway_demo` | 全資産の格納先 |
| テーブル | `customers` | 顧客マスタ（PII含む・ダミー50件） |
| テーブル | `support_tickets` | サポート問い合わせ履歴（120件） |
| テーブル | `test_prompts` | アプリのクイック挿入プロンプト（通常/PII/ジェイルブレイク/不適切） |
| テーブル | `app_request_log` | アプリが記録する監査ログ（withgw のみ） |
| Job | `ai_gateway_demo データ生成` | 上記テーブルを生成 |
| AI Gateway EP | `classic_stable_ytcy_catalog.ai_gateway_demo.endpoint_no_gw` | ガバナンスなし（UI で作成・DAB管理外） |
| AI Gateway EP | `classic_stable_ytcy_catalog.ai_gateway_demo.endpoint_with_gw` | ネイティブ・ガードレール + レート制限（UI で作成・DAB管理外） |
| App | `ai-gateway-demo` | React + FastAPI |
| (旧・未使用) | `ai-gw-demo-nogw` / `ai-gw-demo-withgw` | external_model 版。DAB管理だが本デモでは未使用 |
| (旧・未使用) | Secret `ai_gateway_demo/fm_api_token` | 旧 external_model のプロキシ用 PAT |

---

## デプロイ手順

### 前提
- `endpoint_with_gw` / `endpoint_no_gw`（UC AI Gateway エンドポイント）が作成済みであること。
  `endpoint_with_gw` にはネイティブ・ガードレール（`gurdrail_unsafe_content` /
  `gurdrail_jail_break`）とレート制限が設定済み。

### バンドルのデプロイ（データ + アプリ）
```bash
# フロントエンドをビルド（frontend/dist を生成 → デプロイ対象）
cd app/frontend && npm install && npm run build && cd ../..

# 資産をデプロイ（スキーマは data job が作成）
databricks bundle deploy -t dev
databricks bundle run generate_data -t dev        # ダミーデータ生成
databricks bundle run ai_gateway_demo_app -t dev  # アプリ起動（初回はコンピュート起動に数分）
```
> ⚠️ `frontend/dist/` は .gitignore 対象。デプロイ/同期の直前に必ず `npm run build` すること。

### アプリ サービスプリンシパルへの権限付与（必須）
アプリの SP（`databricks apps get ai-gateway-demo` の `service_principal_client_id`）に付与:
- **両 AI Gateway エンドポイントに `Can Query`**（各エンドポイントの Permissions UI から）
  — これがないとゲートウェイ呼び出しが **404** になる
- SQL Warehouse に `CAN_USE`
- `GRANT USE CATALOG / USE SCHEMA / SELECT / MODIFY ON SCHEMA classic_stable_ytcy_catalog.ai_gateway_demo TO \`<sp-client-id>\``（test_prompts 読取・監査ログ書込用）

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

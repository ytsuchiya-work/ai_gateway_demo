"""環境設定とデュアルモード認証 (ローカル / Databricks Apps)。"""
import os
from functools import lru_cache
from databricks.sdk import WorkspaceClient

# Databricks Apps 実行中かどうか
IS_APP = bool(os.environ.get("DATABRICKS_APP_NAME"))

# --- デモ資産の設定 (app.yaml の env で上書き) ---
CATALOG = os.environ.get("DEMO_CATALOG", "classic_stable_ytcy_catalog")
SCHEMA = os.environ.get("DEMO_SCHEMA", "ai_gateway_demo")
WAREHOUSE_ID = os.environ.get("DEMO_WAREHOUSE_ID", "e351c2d1b16eae95")

# Unity Catalog AI Gateway エンドポイント (カタログ修飾のモデル名で呼び出す)。
# 呼び出しは AI Gateway 統合ルート /ai-gateway/mlflow/v1 経由。
NOGW_MODEL = os.environ.get("NOGW_MODEL", "classic_stable_ytcy_catalog.ai_gateway_demo.endpoint_no_gw")
WITHGW_MODEL = os.environ.get("WITHGW_MODEL", "classic_stable_ytcy_catalog.ai_gateway_demo.endpoint_with_gw")

FQN = f"{CATALOG}.{SCHEMA}"


def gateway_url() -> str:
    """AI Gateway 統合ルート (OpenAI互換) のベースURL。"""
    override = os.environ.get("AI_GATEWAY_URL")
    if override:
        return override.rstrip("/")
    return f"{get_host()}/ai-gateway/mlflow/v1"


@lru_cache(maxsize=1)
def get_client() -> WorkspaceClient:
    if IS_APP:
        return WorkspaceClient()
    profile = os.environ.get("DATABRICKS_PROFILE", "fe-vm-classic-stable-ytcy")
    return WorkspaceClient(profile=profile)


def get_host() -> str:
    host = os.environ.get("DATABRICKS_HOST", "")
    if IS_APP and host:
        if not host.startswith("http"):
            host = f"https://{host}"
        return host.rstrip("/")
    return get_client().config.host.rstrip("/")


def get_token() -> str:
    """Bearer トークンを取得。

    Databricks Apps 実行時は注入される DATABRICKS_TOKEN (SP の OAuth トークン)
    を使う。これは AI Gateway ルートに対して有効。ローカルは CLI プロファイルの
    認証ヘッダーから取得。
    """
    if IS_APP:
        tok = os.environ.get("DATABRICKS_TOKEN")
        if tok:
            return tok
    auth = get_client().config.authenticate()
    return auth["Authorization"].replace("Bearer ", "")

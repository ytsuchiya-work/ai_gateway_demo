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
NOGW_ENDPOINT = os.environ.get("NOGW_ENDPOINT", "ai-gw-demo-nogw")
WITHGW_ENDPOINT = os.environ.get("WITHGW_ENDPOINT", "ai-gw-demo-withgw")

FQN = f"{CATALOG}.{SCHEMA}"


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
    """OAuth/PAT いずれでも Bearer トークンを取得。"""
    auth = get_client().config.authenticate()
    return auth["Authorization"].replace("Bearer ", "")

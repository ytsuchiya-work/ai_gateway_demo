"""Unity AI Gateway エンドポイント呼び出し。

AI Gateway 統合ルート (/ai-gateway/mlflow/v1, OpenAI互換) 経由で
カタログ修飾のモデル名 (classic_stable_ytcy_catalog.ai_gateway_demo.endpoint_*)
を呼び出す。ガバナンスあり(endpoint_with_gw)ではゲートウェイの
service policy ガードレールが発火し、ブロック時は下記の構造化レスポンスが返る:

  {"id":"databricks-guardrail-block",
   "choices":[{"finish_reason":"content_filter","message":{"content":"..."}}],
   "databricks_service_policy":{"name":"gurdrail_jail_break","action":"deny",
                                "phase":"pre_call","reason":"..."}}
"""
import time
import httpx
from . import config

SYSTEM_PROMPT = (
    "あなたは丁寧なカスタマーサポート担当AIです。"
    "日本語で、200文字程度の簡潔な回答をしてください。"
)


class RateLimited(Exception):
    """AI Gateway のレート制限 (HTTP 429)。"""


def invoke(model: str, user_message: str) -> dict:
    """エンドポイントを呼び出す。

    戻り値: content, input_tokens, output_tokens, latency_ms,
            blocked(bool), policy(dict|None)
    """
    url = f"{config.gateway_url()}/chat/completions"
    token = config.get_token()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 512,
        "temperature": 0.3,
    }
    t0 = time.time()
    with httpx.Client(timeout=60.0) as client:
        r = client.post(url, headers={"Authorization": f"Bearer {token}"}, json=payload)
    latency_ms = int((time.time() - t0) * 1000)

    if r.status_code == 429:
        raise RateLimited()
    r.raise_for_status()
    data = r.json()
    choice = (data.get("choices") or [{}])[0]
    content = choice.get("message", {}).get("content", "")
    usage = data.get("usage", {}) or {}
    policy = data.get("databricks_service_policy")
    blocked = bool(policy) or choice.get("finish_reason") == "content_filter"
    return {
        "content": content,
        "input_tokens": usage.get("prompt_tokens", 0),
        "output_tokens": usage.get("completion_tokens", 0),
        "latency_ms": latency_ms,
        "blocked": blocked,
        "policy": policy,
    }


def invoke_status(model: str) -> int:
    """レート制限デモ用: HTTPステータスコードだけを返す軽量呼び出し。"""
    url = f"{config.gateway_url()}/chat/completions"
    token = config.get_token()
    payload = {"model": model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 5}
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(url, headers={"Authorization": f"Bearer {token}"}, json=payload)
        return r.status_code
    except Exception:
        return 0

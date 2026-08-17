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

    # ボディを先にパースする。ガードレールのブロックや通常応答は 2xx で返るが、
    # 念のためステータスに関わらず service policy / choices があればそれを採用する。
    data = None
    try:
        data = r.json()
    except Exception:
        data = None

    if not isinstance(data, dict) or not (data.get("databricks_service_policy") or data.get("choices")):
        # 真のエラー。ボディを含めて分かりやすく送出する。
        raise RuntimeError(f"gateway {r.status_code}: {r.text[:300]}")

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


def invoke_probe(model: str, message: str) -> dict:
    """トラフィック制御デモ用: 1リクエストのステータス・応答・遅延を返す(例外を投げない)。

    戻り値: {code, content, latency_ms, policy}
      code=200: 通常応答(content) または ガードレールブロック(policy)
      code=429: レート制限
    """
    url = f"{config.gateway_url()}/chat/completions"
    token = config.get_token()
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": message}],
        "max_tokens": 80,
        "temperature": 0,
    }
    import time as _t
    t0 = _t.time()
    try:
        with httpx.Client(timeout=40.0) as client:
            r = client.post(url, headers={"Authorization": f"Bearer {token}"}, json=payload)
    except Exception as e:
        return {"code": 0, "content": f"error: {e}", "latency_ms": int((_t.time() - t0) * 1000), "policy": None}
    latency_ms = int((_t.time() - t0) * 1000)
    if r.status_code != 200:
        return {"code": r.status_code, "content": r.text[:200], "latency_ms": latency_ms, "policy": None}
    try:
        d = r.json()
    except Exception:
        return {"code": 200, "content": r.text[:200], "latency_ms": latency_ms, "policy": None}
    choice = (d.get("choices") or [{}])[0]
    policy = d.get("databricks_service_policy")
    return {
        "code": 200,
        "content": choice.get("message", {}).get("content", ""),
        "latency_ms": latency_ms,
        "policy": (policy or {}).get("name"),
    }

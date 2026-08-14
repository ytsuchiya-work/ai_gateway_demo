"""サービングエンドポイント呼び出し。

注意: 当デモの external_model エンドポイントは provider=openai で FM API を
プロキシしており、リクエストに max_tokens を含めると内部で
max_completion_tokens に変換され FM API に拒否される。よって max_tokens は
送らず、システムプロンプトで出力長を制御する。
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


def invoke(endpoint: str, user_message: str) -> dict:
    """エンドポイントを呼び出し、応答テキスト・トークン数・レイテンシを返す。"""
    host = config.get_host()
    token = config.get_token()
    url = f"{host}/serving-endpoints/{endpoint}/invocations"
    payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
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
    return {
        "content": content,
        "input_tokens": usage.get("prompt_tokens", 0),
        "output_tokens": usage.get("completion_tokens", 0),
        "latency_ms": latency_ms,
    }


def invoke_status(endpoint: str, user_message: str) -> int:
    """レート制限デモ用: HTTPステータスコードだけを返す軽量呼び出し。"""
    host = config.get_host()
    token = config.get_token()
    url = f"{host}/serving-endpoints/{endpoint}/invocations"
    payload = {"messages": [{"role": "user", "content": user_message}], "temperature": 0.0}
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(url, headers={"Authorization": f"Bearer {token}"}, json=payload)
        return r.status_code
    except Exception:
        return 0

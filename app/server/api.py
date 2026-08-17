"""デモ API ルーター。

ガバナンスあり = Unity AI Gateway エンドポイント endpoint_with_gw
  - ネイティブ service policy ガードレール (すべてゲートウェイ側でブロック):
      gurdrail_unsafe_content (有害コンテンツ) /
      gurdrail_jail_break (ジェイルブレイク/インジェクション) /
      gurdrail_custom_PII (PII を含む要求)
  - レート制限もゲートウェイで適用
ガバナンスなし = endpoint_no_gw (ガードレール・レート制限なし)

安全性・PII・ジェイルブレイクはすべてゲートウェイのネイティブポリシーが担うため、
アプリ層の ai_mask / ai_query は使用しない (完全ネイティブ)。
"""
import os
from fastapi import APIRouter
from pydantic import BaseModel

from . import config, llm, audit
from .sql import run_sql

router = APIRouter()


class ChatReq(BaseModel):
    mode: str  # "nogw" | "withgw"
    message: str


@router.get("/health")
def health():
    return {"ok": True, "app": config.IS_APP}


@router.get("/prompts")
def prompts():
    rows = run_sql(
        f"SELECT prompt_id, category, label, prompt_text FROM {config.FQN}.test_prompts ORDER BY prompt_id"
    )
    return [{"id": r[0], "category": r[1], "label": r[2], "text": r[3]} for r in rows]


def _audit_log_url() -> str:
    """AI Gateway 使用状況(監査ログ)システムテーブルの Catalog Explorer URL。"""
    return f"{config.get_host()}/explore/data/system/ai_gateway/usage"


@router.get("/config")
def gateway_config():
    """エンドポイント構成の説明を返す (概要タブ用)。"""
    return {
        "nogw": {"name": config.NOGW_MODEL, "has_gateway": False},
        "withgw": {
            "name": config.WITHGW_MODEL,
            "has_gateway": True,
            "guardrails": ["gurdrail_unsafe_content", "gurdrail_jail_break", "gurdrail_custom_PII"],
            "rate_limit": True,
        },
        "gateway_route": config.gateway_url(),
        "audit_log_url": _audit_log_url(),
    }


# トークンあたりの概算単価 (USD / 1K tokens)。デモ用の推定値。
COST_PER_1K_USD = float(os.environ.get("USAGE_COST_PER_1K_USD", "0.002"))
# system.ai_gateway.usage 上のデモ2エンドポイント絞り込み
_USAGE_FILTER = "endpoint_name LIKE '%ai_gateway_demo.endpoint_%gw'"


@router.get("/usage")
def usage():
    """system.ai_gateway.usage を集計して返す (使用状況タブ用)。"""
    T = "system.ai_gateway.usage"
    try:
        s = run_sql(
            f"""SELECT COUNT(*), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0),
                       COALESCE(SUM(total_tokens),0)
                FROM {T} WHERE {_USAGE_FILTER}"""
        )[0]
    except Exception as e:
        return {"available": False, "error": str(e)[:300], "audit_log_url": _audit_log_url()}

    total_tokens = int(s[3] or 0)
    summary = {
        "requests": int(s[0] or 0),
        "input_tokens": int(s[1] or 0),
        "output_tokens": int(s[2] or 0),
        "total_tokens": total_tokens,
        "est_cost_usd": round(total_tokens / 1000.0 * COST_PER_1K_USD, 4),
    }

    def agg(col: str):
        rows = run_sql(
            f"""SELECT COALESCE({col},'(不明)'), COUNT(*), COALESCE(SUM(total_tokens),0)
                FROM {T} WHERE {_USAGE_FILTER} GROUP BY {col} ORDER BY COUNT(*) DESC LIMIT 20"""
        )
        return [{"key": r[0], "requests": int(r[1] or 0), "total_tokens": int(r[2] or 0)} for r in rows]

    recent_rows = run_sql(
        f"""SELECT CAST(event_time AS STRING), endpoint_name, requester, requester_type,
                   COALESCE(destination_model,'-'), CAST(status_code AS STRING),
                   COALESCE(total_tokens,0), COALESCE(latency_ms,0)
            FROM {T} WHERE {_USAGE_FILTER} ORDER BY event_time DESC LIMIT 40"""
    )
    recent = [{
        "event_time": r[0], "endpoint": (r[1] or "").split(".")[-1], "requester": r[2],
        "requester_type": r[3], "model": r[4], "status_code": r[5],
        "total_tokens": int(r[6] or 0), "latency_ms": int(r[7] or 0),
    } for r in recent_rows]

    return {
        "available": True,
        "summary": summary,
        "cost_rate_per_1k": COST_PER_1K_USD,
        "by_model": agg("destination_model"),
        "by_requester": agg("requester"),
        "by_endpoint": agg("endpoint_name"),
        "recent": recent,
        "audit_log_url": _audit_log_url(),
    }


@router.post("/chat")
def chat(req: ChatReq):
    if req.mode == "withgw":
        return _chat_withgw(req.message)
    return _chat_nogw(req.message)


def _chat_nogw(message: str) -> dict:
    """ガバナンスなし: ガードレール・監査・レート制限なしで生のエンドポイントを呼ぶ。"""
    try:
        res = llm.invoke(config.NOGW_MODEL, message)
    except llm.RateLimited:
        return {"rate_limited": True, "mode": "nogw"}
    return {
        "mode": "nogw",
        "endpoint": config.NOGW_MODEL,
        "response": res["content"],
        "rate_limited": False,
        "governance": {"enabled": False},
        "metrics": {
            "input_tokens": res["input_tokens"],
            "output_tokens": res["output_tokens"],
            "latency_ms": res["latency_ms"],
        },
    }


def _chat_withgw(message: str) -> dict:
    """ガバナンスあり: 生入力をゲートウェイへ → ネイティブ service policy が判定 → 監査。"""
    try:
        res = llm.invoke(config.WITHGW_MODEL, message)
    except llm.RateLimited:
        return {"rate_limited": True, "mode": "withgw"}

    policy = res.get("policy")
    blocked = res.get("blocked")

    if blocked:
        pname = (policy or {}).get("name", "guardrail")
        preason = (policy or {}).get("reason", "")
        response = f"⛔ AI Gateway のガードレール『{pname}』によりブロックされました。"
        verdict = pname
        action = "blocked"
    else:
        response = res["content"]
        verdict = "safe"
        preason = ""
        action = "allowed"

    metrics = {
        "input_tokens": res["input_tokens"],
        "output_tokens": res["output_tokens"],
        "latency_ms": res["latency_ms"],
    }

    request_id = None
    try:
        request_id = audit.log_request({
            "mode": "withgw",
            "endpoint": config.WITHGW_MODEL.split(".")[-1],
            "user_input": message,
            "masked_input": message,
            "safety_verdict": verdict,
            "action": action,
            "model_output": response,
            "input_tokens": metrics["input_tokens"],
            "output_tokens": metrics["output_tokens"],
            "latency_ms": metrics["latency_ms"],
        })
    except Exception:
        pass

    return {
        "mode": "withgw",
        "endpoint": config.WITHGW_MODEL,
        "response": response,
        "rate_limited": False,
        "governance": {
            "enabled": True,
            "safety_verdict": verdict,
            "blocked": blocked,
            "policy_name": (policy or {}).get("name") if blocked else None,
            "policy_reason": preason if blocked else None,
            "action": action,
            "logged": request_id is not None,
            "request_id": request_id,
        },
        "metrics": metrics,
    }


@router.get("/audit")
def audit_log():
    return {"summary": audit.audit_summary(), "rows": audit.list_requests(50),
            "audit_log_url": _audit_log_url()}


# トラフィック制御デモ用の probe。全ガードレール(PII/有害/JB/hallucination)を通過し、
# 実際の応答が返る無害な挨拶にする(レート制限のみを可視化するため)。
PROBE_PROMPT = "「こんにちは」と短く挨拶を返してください。"


class RateOneReq(BaseModel):
    mode: str


@router.post("/ratelimit-one")
def ratelimit_one(req: RateOneReq):
    """トラフィック制御デモ用: 1リクエストを送り、ステータス・応答・遅延を返す。"""
    model = config.WITHGW_MODEL if req.mode == "withgw" else config.NOGW_MODEL
    res = llm.invoke_probe(model, PROBE_PROMPT)
    return {
        "prompt": PROBE_PROMPT,
        "code": res["code"],
        "content": res["content"],
        "latency_ms": res["latency_ms"],
        "policy": res["policy"],
    }


class RateReq(BaseModel):
    mode: str
    count: int = 20


@router.post("/ratelimit-test")
def ratelimit_test(req: RateReq):
    model = config.WITHGW_MODEL if req.mode == "withgw" else config.NOGW_MODEL
    results = []
    ok = rl = other = 0
    for i in range(min(req.count, 25)):
        code = llm.invoke_status(model)
        results.append({"i": i + 1, "code": code})
        if code == 200:
            ok += 1
        elif code == 429:
            rl += 1
        else:
            other += 1
    return {"mode": req.mode, "endpoint": model, "ok": ok, "rate_limited": rl,
            "other": other, "results": results}

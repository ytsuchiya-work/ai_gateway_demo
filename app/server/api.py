"""デモ API ルーター。

ガバナンスあり = Unity AI Gateway エンドポイント endpoint_with_gw
  - ネイティブ service policy ガードレール (安全性 gurdrail_unsafe_content /
    ジェイルブレイク gurdrail_jail_break) がゲートウェイでブロック
  - レート制限もゲートウェイで適用
  - PII マスクはアプリ層の ai_mask で補完
ガバナンスなし = endpoint_no_gw (ガードレール・レート制限なし)
"""
from fastapi import APIRouter
from pydantic import BaseModel

from . import config, llm, guardrails, audit
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


@router.get("/config")
def gateway_config():
    """エンドポイント構成の説明を返す (概要タブ用)。"""
    return {
        "nogw": {"name": config.NOGW_MODEL, "has_gateway": False},
        "withgw": {
            "name": config.WITHGW_MODEL,
            "has_gateway": True,
            "guardrails": ["gurdrail_unsafe_content", "gurdrail_jail_break"],
            "rate_limit": True,
            "pii_mask": "ai_mask (アプリ層で補完)",
        },
        "gateway_route": config.gateway_url(),
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
    """ガバナンスあり: PIIマスク(ai_mask) → ゲートウェイ(ネイティブガードレール) → 出力マスク → 監査。"""
    # 入力 PII マスク (ai_mask)
    gin = guardrails.mask_text(message)
    llm_input = gin["masked_text"] if gin["pii_detected"] else message

    try:
        res = llm.invoke(config.WITHGW_MODEL, llm_input)
    except llm.RateLimited:
        return {"rate_limited": True, "mode": "withgw"}

    policy = res.get("policy")
    blocked = res.get("blocked")

    if blocked:
        pname = (policy or {}).get("name", "guardrail")
        preason = (policy or {}).get("reason", "")
        response = f"⛔ AI Gateway のガードレール『{pname}』によりブロックされました。"
        masked_out_flag = False
        verdict = pname
        action = "blocked"
    else:
        gout = guardrails.mask_text(res["content"])
        response = gout["masked_text"]
        masked_out_flag = gout["pii_detected"]
        verdict = "safe"
        preason = ""
        action = "masked" if (gin["pii_detected"] or masked_out_flag) else "allowed"

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
            "masked_input": gin["masked_text"],
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
            "pii_input_masked": gin["pii_detected"],
            "pii_output_masked": masked_out_flag,
            "masked_input": gin["masked_text"],
            "action": action,
            "logged": request_id is not None,
            "request_id": request_id,
        },
        "metrics": metrics,
    }


@router.get("/audit")
def audit_log():
    return {"summary": audit.audit_summary(), "rows": audit.list_requests(50)}


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

"""デモ API ルーター。"""
from fastapi import APIRouter
from pydantic import BaseModel

from . import config, llm, guardrails, audit
from .sql import run_sql

router = APIRouter()

BLOCK_MESSAGE = (
    "申し訳ございませんが、そのご要望にはお答えできません。"
    "AI Gateway のガードレールにより、安全性ポリシー違反の可能性がある入力として"
    "ブロックされました。"
)
UNSAFE = guardrails.BLOCK_VERDICTS  # {"harmful", "jailbreak"}


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
    return [
        {"id": r[0], "category": r[1], "label": r[2], "text": r[3]} for r in rows
    ]


@router.get("/config")
def gateway_config():
    """両エンドポイントの AI Gateway 構成を返す (概要タブ用)。"""
    w = config.get_client()

    def summarize(name: str) -> dict:
        try:
            ep = w.serving_endpoints.get(name)
            gw = ep.ai_gateway
            if not gw:
                return {"name": name, "has_gateway": False}
            rl = gw.rate_limits[0] if gw.rate_limits else None
            rl_period = getattr(rl.renewal_period, "value", rl.renewal_period) if rl else None
            it = gw.inference_table_config
            return {
                "name": name,
                "has_gateway": True,
                "usage_tracking": bool(gw.usage_tracking_config and gw.usage_tracking_config.enabled),
                "inference_table": (f"{it.catalog_name}.{it.schema_name}.{it.table_name_prefix}_payload"
                                    if it and it.enabled else None),
                "rate_limit": (f"{rl.calls} calls / {rl_period}" if rl else None),
            }
        except Exception as e:
            return {"name": name, "has_gateway": False, "error": str(e)}

    return {
        "nogw": summarize(config.NOGW_ENDPOINT),
        "withgw": summarize(config.WITHGW_ENDPOINT),
        # ガードレールはアプリ層 (ai_mask / ai_classify) で withgw のみ適用
        "guardrails": {
            "pii_mask": "ai_mask (person/phone/card/email/address)",
            "safety": "ai_query (safe / harmful / jailbreak)",
        },
    }


@router.post("/chat")
def chat(req: ChatReq):
    if req.mode == "withgw":
        return _chat_withgw(req.message)
    return _chat_nogw(req.message)


def _chat_nogw(message: str) -> dict:
    """ガバナンスなし: ガードレール・監査・レート制限なしで生のLLMを呼ぶ。"""
    try:
        res = llm.invoke(config.NOGW_ENDPOINT, message)
    except llm.RateLimited:
        return {"rate_limited": True, "mode": "nogw"}
    return {
        "mode": "nogw",
        "endpoint": config.NOGW_ENDPOINT,
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
    """ガバナンスあり: 入力ガードレール → LLM → 出力ガードレール → 監査記録。"""
    gin = guardrails.check_input(message)
    verdict = gin["verdict"]
    blocked = verdict in UNSAFE

    if blocked:
        response = BLOCK_MESSAGE
        masked_out_flag = False
        metrics = {"input_tokens": 0, "output_tokens": 0, "latency_ms": 0}
        action = "blocked"
    else:
        llm_input = gin["masked_text"] if gin["pii_detected"] else message
        try:
            res = llm.invoke(config.WITHGW_ENDPOINT, llm_input)
        except llm.RateLimited:
            return {"rate_limited": True, "mode": "withgw"}
        gout = guardrails.mask_output(res["content"])
        response = gout["masked_text"]
        masked_out_flag = gout["pii_detected"]
        metrics = {
            "input_tokens": res["input_tokens"],
            "output_tokens": res["output_tokens"],
            "latency_ms": res["latency_ms"],
        }
        action = "masked" if (gin["pii_detected"] or masked_out_flag) else "allowed"

    # 監査記録 (withgw のみ)
    request_id = None
    try:
        request_id = audit.log_request({
            "mode": "withgw",
            "endpoint": config.WITHGW_ENDPOINT,
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
        "endpoint": config.WITHGW_ENDPOINT,
        "response": response,
        "rate_limited": False,
        "governance": {
            "enabled": True,
            "safety_verdict": verdict,
            "blocked": blocked,
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
    count: int = 10


@router.post("/ratelimit-test")
def ratelimit_test(req: RateReq):
    ep = config.WITHGW_ENDPOINT if req.mode == "withgw" else config.NOGW_ENDPOINT
    results = []
    ok = rl = other = 0
    for i in range(min(req.count, 20)):
        code = llm.invoke_status(ep, "ping")
        results.append({"i": i + 1, "code": code})
        if code == 200:
            ok += 1
        elif code == 429:
            rl += 1
        else:
            other += 1
    return {"mode": req.mode, "endpoint": ep, "ok": ok, "rate_limited": rl,
            "other": other, "results": results}

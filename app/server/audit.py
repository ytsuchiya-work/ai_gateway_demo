"""監査ログ (app_request_log) への記録・参照。

「AI Gateway が有効な時だけ監査証跡が自動で残る」ことを可視化する。
withgw モードのリクエストのみ記録し、nogw モードでは一切記録しない。
これは AI Gateway の usage tracking / inference table と同じ思想
(実際の withgw エンドポイントにも inference table が構成されている)。
"""
import uuid
from datetime import datetime, timezone
from .sql import run_sql
from . import config

TABLE = f"{config.FQN}.app_request_log"


def log_request(rec: dict) -> str:
    request_id = uuid.uuid4().hex[:12]
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    run_sql(
        f"""INSERT INTO {TABLE}
        (request_id, ts, mode, endpoint, user_input, masked_input, safety_verdict,
         action, model_output, input_tokens, output_tokens, latency_ms)
        VALUES (:rid, TIMESTAMP(:ts), :mode, :ep, :uin, :min, :sv, :act, :out,
                :itok, :otok, :lat)""",
        params=[
            {"name": "rid", "value": request_id},
            {"name": "ts", "value": ts},
            {"name": "mode", "value": rec["mode"]},
            {"name": "ep", "value": rec["endpoint"]},
            {"name": "uin", "value": rec["user_input"][:2000]},
            {"name": "min", "value": rec["masked_input"][:2000]},
            {"name": "sv", "value": rec["safety_verdict"]},
            {"name": "act", "value": rec["action"]},
            {"name": "out", "value": rec["model_output"][:2000]},
            {"name": "itok", "value": str(rec["input_tokens"]), "type": "INT"},
            {"name": "otok", "value": str(rec["output_tokens"]), "type": "INT"},
            {"name": "lat", "value": str(rec["latency_ms"]), "type": "INT"},
        ],
    )
    return request_id


def list_requests(limit: int = 50) -> list[dict]:
    rows = run_sql(
        f"""SELECT request_id, CAST(ts AS STRING), mode, endpoint, user_input,
                   masked_input, safety_verdict, action, model_output,
                   input_tokens, output_tokens, latency_ms
            FROM {TABLE} ORDER BY ts DESC LIMIT {int(limit)}"""
    )
    cols = ["request_id", "ts", "mode", "endpoint", "user_input", "masked_input",
            "safety_verdict", "action", "model_output", "input_tokens",
            "output_tokens", "latency_ms"]
    return [dict(zip(cols, r)) for r in rows]


def audit_summary() -> dict:
    """監査ログの件数サマリ (mode別)。"""
    try:
        rows = run_sql(f"SELECT mode, COUNT(*) FROM {TABLE} GROUP BY mode")
        by_mode = {r[0]: int(r[1]) for r in rows}
    except Exception:
        by_mode = {}
    return {"withgw": by_mode.get("withgw", 0), "nogw": by_mode.get("nogw", 0)}

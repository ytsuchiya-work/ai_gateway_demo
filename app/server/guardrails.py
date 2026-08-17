"""PII ガードレール層 (ai_mask)。

安全性・ジェイルブレイクの判定は Unity AI Gateway エンドポイント
(endpoint_with_gw) のネイティブ service policy が担う。ここでは
それらのポリシーが対象としない PII マスクを Databricks AI Function
`ai_mask` で補完する (入力・出力の両方)。
"""
from .sql import run_sql

PII_ENTITIES = "array('person','phone number','credit card number','email address','street address')"


def mask_text(text: str) -> dict:
    """テキストの PII をマスク。戻り値: {masked_text, pii_detected}"""
    if not text or not text.strip():
        return {"masked_text": text, "pii_detected": False}
    rows = run_sql(
        f"SELECT ai_mask(:txt, {PII_ENTITIES}) AS masked",
        params=[{"name": "txt", "value": text}],
    )
    masked = rows[0][0]
    return {"masked_text": masked, "pii_detected": masked.strip() != text.strip()}

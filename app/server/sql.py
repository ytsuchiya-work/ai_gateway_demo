"""SQL Warehouse 実行ヘルパー (Statement Execution API 経由)。"""
from databricks.sdk.service.sql import StatementState, StatementParameterListItem
from . import config


def run_sql(statement: str, params: list[dict] | None = None) -> list[list]:
    """SQL を実行し data_array (行のリスト) を返す。

    params は {"name","value","type"?} の dict のリスト。
    """
    w = config.get_client()
    kwargs = dict(warehouse_id=config.WAREHOUSE_ID, statement=statement, wait_timeout="30s")
    if params:
        kwargs["parameters"] = [
            StatementParameterListItem(name=p["name"], value=p.get("value"), type=p.get("type"))
            for p in params
        ]
    resp = w.statement_execution.execute_statement(**kwargs)
    state = resp.status.state
    if state != StatementState.SUCCEEDED:
        msg = resp.status.error.message if resp.status.error else str(state)
        raise RuntimeError(f"SQL failed: {msg}")
    if resp.result and resp.result.data_array:
        return resp.result.data_array
    return []

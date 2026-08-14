"""Unity AI Gateway ガバナンス比較デモ - FastAPI エントリポイント。"""
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from server.api import router as api_router

app = FastAPI(title="Unity AI Gateway Governance Demo")
app.include_router(api_router, prefix="/api")


@app.exception_handler(Exception)
async def all_exceptions(request, exc):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# --- React フロントエンド (frontend/dist) を配信 ---
FRONTEND = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(FRONTEND):
    assets = os.path.join(FRONTEND, "assets")
    if os.path.isdir(assets):
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = os.path.join(FRONTEND, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(FRONTEND, "index.html"))

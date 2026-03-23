"""The Attic AI — Python sidecar for ZIM extraction and entity extraction."""

from fastapi import FastAPI

app = FastAPI(title="Attic AI Sidecar", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

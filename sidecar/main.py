"""The Attic AI — Python sidecar for ZIM extraction and entity extraction."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Attic AI Sidecar", version="0.1.0")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ZimRequest(BaseModel):
    file_path: str
    limit: int = Field(default=100, ge=1, le=10_000)


class EntityRequest(BaseModel):
    text: str
    ollama_host: str = "http://ollama:11434"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract/zim")
async def extract_zim(req: ZimRequest) -> list[dict]:
    """Extract articles from a ZIM file."""
    from extractors.zim import extract_articles

    try:
        articles = extract_articles(req.file_path, limit=req.limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return articles


@app.post("/extract/entities")
async def extract_entities_endpoint(req: EntityRequest) -> dict:
    """Extract named entities and relationships from text."""
    from extractors.entities import extract_entities

    try:
        result = await extract_entities(req.text, req.ollama_host)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return result

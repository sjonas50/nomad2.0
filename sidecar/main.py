"""The Attic AI — Python sidecar for ZIM extraction, entity extraction, and voice transcription."""

from __future__ import annotations

import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
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
    import os

    # Path traversal protection: restrict to allowed directory
    allowed_dir = os.environ.get("ZIM_STORAGE_DIR", "/data/zim")
    resolved = os.path.realpath(req.file_path)
    if not resolved.startswith(os.path.realpath(allowed_dir) + os.sep):
        raise HTTPException(status_code=400, detail="file_path must be within the ZIM storage directory")

    from extractors.zim import extract_articles

    try:
        articles = extract_articles(resolved, limit=req.limit)
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


@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)) -> dict:
    """Transcribe audio using whisper.cpp. Accepts WAV, WebM, OGG, MP3, M4A, FLAC."""
    from extractors.whisper import transcribe, SUPPORTED_FORMATS
    from pathlib import Path

    ext = Path(file.filename or "audio.wav").suffix.lower()
    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {ext}. Supported: {', '.join(SUPPORTED_FORMATS)}",
        )

    # Write upload to temp file
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = transcribe(tmp_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return result

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


class ZimSearchRequest(BaseModel):
    file_path: str
    query: str
    limit: int = Field(default=20, ge=1, le=100)


class ZimArticleRequest(BaseModel):
    file_path: str
    path: str


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


@app.post("/zim/search")
async def zim_search(req: ZimSearchRequest) -> list[dict]:
    """Search articles in a ZIM file by title substring match."""
    import os

    allowed_dir = os.environ.get("ZIM_STORAGE_DIR", "/data/zim")
    resolved = os.path.realpath(req.file_path)
    if not resolved.startswith(os.path.realpath(allowed_dir) + os.sep):
        raise HTTPException(status_code=400, detail="file_path must be within the ZIM storage directory")

    try:
        from libzim.reader import Archive  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(status_code=501, detail="libzim is not installed") from exc

    try:
        archive = Archive(resolved)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    query_lower = req.query.lower()
    results: list[dict] = []

    for entry_idx in range(archive.entry_count):
        if len(results) >= req.limit:
            break
        entry = archive._get_entry_by_id(entry_idx)
        try:
            item = entry.get_item()
        except Exception:
            continue
        if "html" not in str(item.mimetype):
            continue
        if query_lower in entry.title.lower():
            results.append({
                "title": entry.title,
                "path": entry.path,
            })

    return results


@app.post("/zim/article")
async def zim_article(req: ZimArticleRequest) -> dict:
    """Read a single article from a ZIM file by path, returning HTML content."""
    import os

    allowed_dir = os.environ.get("ZIM_STORAGE_DIR", "/data/zim")
    resolved = os.path.realpath(req.file_path)
    if not resolved.startswith(os.path.realpath(allowed_dir) + os.sep):
        raise HTTPException(status_code=400, detail="file_path must be within the ZIM storage directory")

    try:
        from libzim.reader import Archive  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(status_code=501, detail="libzim is not installed") from exc

    try:
        archive = Archive(resolved)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    try:
        entry = archive.get_entry_by_path(req.path)
        item = entry.get_item()
        content = bytes(item.content).decode("utf-8")
        return {
            "title": entry.title,
            "path": entry.path,
            "html": content,
        }
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Article not found: {req.path}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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

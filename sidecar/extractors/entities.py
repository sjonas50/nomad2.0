"""Named-entity extraction with Ollama classification and heuristic fallback."""

from __future__ import annotations

import json
import re
from itertools import combinations
from typing import Any

import httpx

# Regex for capitalized multi-word phrases (entity candidates).
_ENTITY_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b")

# Simple heuristic word lists for fallback classification.
_PLACE_SUFFIXES = {
    "City", "County", "State", "Country", "River", "Mountain", "Lake",
    "Island", "Bay", "Ocean", "Sea", "Park", "Street", "Avenue",
}
_ORG_SUFFIXES = {
    "Inc", "Corp", "LLC", "Ltd", "University", "College", "Institute",
    "Foundation", "Association", "Company", "Group", "Agency", "Department",
}
_TITLE_PREFIXES = {
    "Mr", "Mrs", "Ms", "Dr", "Prof", "President", "Senator", "General",
    "Captain", "King", "Queen", "Prince", "Princess",
}


def _classify_heuristic(name: str) -> str:
    """Classify an entity using keyword heuristics."""
    tokens = name.split()
    if tokens[0] in _TITLE_PREFIXES:
        return "person"
    if any(t in _ORG_SUFFIXES for t in tokens):
        return "org"
    if any(t in _PLACE_SUFFIXES for t in tokens):
        return "place"
    return "concept"


async def _classify_with_ollama(
    candidates: list[str],
    ollama_host: str,
    model: str = "llama3",
) -> dict[str, dict[str, Any]]:
    """Ask Ollama to classify entity candidates.

    Returns:
        Mapping of entity name to {"type": ..., "confidence": ...}.
    """
    if not candidates:
        return {}

    prompt = (
        "Classify each named entity below as one of: person, org, place, concept.\n"
        "Return ONLY a JSON array of objects with keys: name, type, confidence (0-1).\n"
        "No explanation, no markdown fences.\n\n"
        "Entities:\n" + "\n".join(f"- {c}" for c in candidates)
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{ollama_host}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        body = resp.json()

    raw = body.get("response", "")
    # Strip possible markdown fences.
    raw = re.sub(r"```(?:json)?", "", raw).strip()

    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return {}

    result: dict[str, dict[str, Any]] = {}
    for item in items:
        if isinstance(item, dict) and "name" in item:
            result[item["name"]] = {
                "type": item.get("type", "concept"),
                "confidence": float(item.get("confidence", 0.5)),
            }
    return result


def _build_relationships(
    entities: list[dict[str, Any]],
    text: str,
    window: int = 200,
) -> list[dict[str, str]]:
    """Build co-occurrence relationships between entities within a text window."""
    positions: dict[str, list[int]] = {}
    for ent in entities:
        name = ent["name"]
        for match in re.finditer(re.escape(name), text):
            positions.setdefault(name, []).append(match.start())

    relationships: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for a, b in combinations(positions.keys(), 2):
        pair = tuple(sorted((a, b)))
        if pair in seen:
            continue
        # Check if any occurrence of a is within `window` chars of any occurrence of b.
        for pa in positions[a]:
            for pb in positions[b]:
                if abs(pa - pb) <= window:
                    seen.add(pair)
                    relationships.append(
                        {"from": pair[0], "to": pair[1], "type": "co-occurrence"}
                    )
                    break
            else:
                continue
            break

    return relationships


async def extract_entities(text: str, ollama_host: str) -> dict[str, Any]:
    """Extract named entities from text with Ollama classification + heuristic fallback.

    Args:
        text: The source text to analyse.
        ollama_host: Base URL of the Ollama instance (e.g. http://ollama:11434).

    Returns:
        Dict with keys ``entities`` and ``relationships``.
    """
    # 1. Find candidate entity names via regex.
    raw_candidates = _ENTITY_RE.findall(text)
    # Deduplicate while preserving order.
    seen: set[str] = set()
    candidates: list[str] = []
    for c in raw_candidates:
        if c not in seen and len(c) > 1:
            seen.add(c)
            candidates.append(c)

    if not candidates:
        return {"entities": [], "relationships": []}

    # 2. Attempt Ollama classification; fall back to heuristics on failure.
    ollama_results: dict[str, dict[str, Any]] = {}
    try:
        ollama_results = await _classify_with_ollama(candidates, ollama_host)
    except Exception:
        pass  # Fall back to heuristic classification.

    entities: list[dict[str, Any]] = []
    for name in candidates:
        if name in ollama_results:
            entities.append(
                {
                    "name": name,
                    "type": ollama_results[name]["type"],
                    "confidence": ollama_results[name]["confidence"],
                }
            )
        else:
            entities.append(
                {
                    "name": name,
                    "type": _classify_heuristic(name),
                    "confidence": 0.5,
                }
            )

    # 3. Build co-occurrence relationships.
    relationships = _build_relationships(entities, text)

    return {"entities": entities, "relationships": relationships}

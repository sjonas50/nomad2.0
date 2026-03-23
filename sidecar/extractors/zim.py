"""ZIM file article extraction using python-libzim."""

from __future__ import annotations

import re
from typing import Any


def _strip_html(html: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_articles(file_path: str, limit: int = 100) -> list[dict[str, Any]]:
    """Extract articles from a ZIM file.

    Args:
        file_path: Absolute path to the ZIM file.
        limit: Maximum number of articles to return.

    Returns:
        List of dicts with keys: title, url, content.

    Raises:
        RuntimeError: If libzim is not installed.
    """
    try:
        from libzim.reader import Archive  # type: ignore[import-untyped]
    except ImportError as exc:
        raise RuntimeError(
            "libzim is not installed. Install with: pip install libzim"
        ) from exc

    archive = Archive(file_path)
    articles: list[dict[str, Any]] = []

    for entry_idx in range(archive.entry_count):
        if len(articles) >= limit:
            break

        entry = archive._get_entry_by_id(entry_idx)

        # Only process article-type entries (namespace "C" in modern ZIM,
        # or items that have content).
        try:
            item = entry.get_item()
        except Exception:
            continue

        # Skip non-HTML content (images, metadata, etc.)
        mimetype = str(item.mimetype)
        if "html" not in mimetype:
            continue

        title = entry.title
        path = entry.path
        content_bytes: bytes = bytes(item.content)

        try:
            html = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            continue

        plain_text = _strip_html(html)
        if not plain_text:
            continue

        articles.append(
            {
                "title": title,
                "url": path,
                "content": plain_text,
            }
        )

    return articles

"""Whisper.cpp transcription via subprocess."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

WHISPER_BIN = os.environ.get("WHISPER_BIN", "/usr/local/bin/whisper-cpp")
WHISPER_MODEL = os.environ.get(
    "WHISPER_MODEL",
    "/app/models/ggml-base.en.bin",
)

# Supported input formats — ffmpeg converts non-WAV to WAV
SUPPORTED_FORMATS = {".wav", ".webm", ".ogg", ".mp3", ".m4a", ".flac"}


def _ensure_wav(input_path: str) -> str:
    """Convert input audio to 16kHz mono WAV if needed."""
    ext = Path(input_path).suffix.lower()
    if ext == ".wav":
        return input_path

    wav_path = input_path + ".converted.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1", "-f", "wav", wav_path,
        ],
        capture_output=True,
        check=True,
        timeout=120,
    )
    return wav_path


def transcribe(audio_path: str, language: str = "en") -> dict:
    """Run whisper.cpp on an audio file and return structured transcript.

    Returns:
        {
            "text": "full transcript text",
            "segments": [{"start": 0.0, "end": 2.5, "text": "segment text"}, ...],
            "language": "en"
        }
    """
    if not Path(audio_path).exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    ext = Path(audio_path).suffix.lower()
    if ext not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported audio format: {ext}")

    wav_path = _ensure_wav(audio_path)

    # Run whisper.cpp with CSV output for timestamps
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
        csv_output = tmp.name

    try:
        cmd = [
            WHISPER_BIN,
            "-m", WHISPER_MODEL,
            "-f", wav_path,
            "-l", language,
            "--output-csv",
            "-of", csv_output.replace(".csv", ""),  # whisper-cpp appends .csv
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            raise RuntimeError(f"whisper.cpp failed: {result.stderr}")

        # Parse CSV output (start,end,text)
        segments = []
        full_text_parts = []
        csv_file = csv_output if Path(csv_output).exists() else csv_output.replace(".csv", "") + ".csv"

        if Path(csv_file).exists():
            with open(csv_file) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("start"):
                        continue
                    parts = line.split(",", 2)
                    if len(parts) >= 3:
                        start_ms = int(parts[0].strip().strip('"'))
                        end_ms = int(parts[1].strip().strip('"'))
                        text = parts[2].strip().strip('"').strip()
                        if text:
                            segments.append({
                                "start": start_ms / 1000.0,
                                "end": end_ms / 1000.0,
                                "text": text,
                            })
                            full_text_parts.append(text)

        # Fallback: parse stdout if CSV didn't work
        if not segments and result.stdout:
            full_text_parts = [result.stdout.strip()]
            segments = [{"start": 0.0, "end": 0.0, "text": result.stdout.strip()}]

        return {
            "text": " ".join(full_text_parts),
            "segments": segments,
            "language": language,
        }
    finally:
        # Cleanup temp files
        for p in [csv_output, csv_output.replace(".csv", "") + ".csv"]:
            try:
                os.unlink(p)
            except OSError:
                pass
        if wav_path != audio_path:
            try:
                os.unlink(wav_path)
            except OSError:
                pass

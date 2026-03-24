#!/usr/bin/env bash
# Detect hardware and recommend model/whisper configuration
# Usage: ./scripts/detect_hardware.sh
# Output: JSON with recommended config

set -euo pipefail

IS_APPLE_SILICON=false
ARCH=$(uname -m)
CHIP=""

if [[ "$(uname -s)" == "Darwin" ]]; then
  TOTAL_RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_BYTES / 1024 / 1024 / 1024))
  CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo "1")
  if [[ "$ARCH" == "arm64" ]]; then
    IS_APPLE_SILICON=true
    CHIP=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon")
  fi
else
  TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
  CPU_CORES=$(nproc 2>/dev/null || echo "1")
fi

# Model recommendations
OLLAMA_MODEL="qwen2.5:1.5b"
WHISPER_MODEL="base.en"
OLLAMA_NUM_CTX=4096

if [ "$TOTAL_RAM_GB" -ge 48 ]; then
  OLLAMA_MODEL="qwen2.5:32b"
  WHISPER_MODEL="small.en"
  OLLAMA_NUM_CTX=8192
elif [ "$TOTAL_RAM_GB" -ge 24 ]; then
  OLLAMA_MODEL="qwen2.5:14b"
  WHISPER_MODEL="small.en"
  OLLAMA_NUM_CTX=8192
elif [ "$TOTAL_RAM_GB" -ge 16 ]; then
  OLLAMA_MODEL="qwen2.5:7b"
  WHISPER_MODEL="base.en"
  OLLAMA_NUM_CTX=4096
fi

cat <<EOF
{
  "platform": "$(uname -s)",
  "arch": "$ARCH",
  "is_apple_silicon": $IS_APPLE_SILICON,
  "chip": "$CHIP",
  "ram_gb": $TOTAL_RAM_GB,
  "cpu_cores": $CPU_CORES,
  "metal_gpu": $IS_APPLE_SILICON,
  "recommended": {
    "ollama_model": "$OLLAMA_MODEL",
    "max_model_size": "$OLLAMA_MODEL",
    "whisper_model": "$WHISPER_MODEL",
    "ollama_num_ctx": $OLLAMA_NUM_CTX,
    "recommended_profile": "$([ "$TOTAL_RAM_GB" -ge 16 ] && echo "full" || echo "default")",
    "docker_profile": "$([ "$TOTAL_RAM_GB" -ge 16 ] && echo "full" || echo "default")"
  }
}
EOF

#!/usr/bin/env bash
# Hardware detection script for The Attic AI
# Outputs JSON with system info for profile selection

set -euo pipefail

# RAM (KB → GB)
if [ -f /proc/meminfo ]; then
  RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
elif command -v sysctl >/dev/null 2>&1; then
  RAM_KB=$(sysctl -n hw.memsize 2>/dev/null | awk '{print int($1/1024)}')
else
  RAM_KB=0
fi
RAM_GB=$((RAM_KB / 1024 / 1024))

# CPU
CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)
ARCH=$(uname -m)

# GPU detection (NVIDIA)
GPU="none"
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "nvidia-unknown")
fi

# Disk space (GB)
DISK_FREE_GB=$(df -BG . 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G' || echo "0")

# Recommend profile
PROFILE="default"
if [ "$RAM_GB" -ge 16 ]; then
  PROFILE="full"
elif [ "$RAM_GB" -ge 12 ]; then
  PROFILE="graph"
fi

# Recommend max model size
MAX_MODEL="1.5b"
if [ "$RAM_GB" -ge 32 ]; then
  MAX_MODEL="13b"
elif [ "$RAM_GB" -ge 16 ]; then
  MAX_MODEL="8b"
elif [ "$RAM_GB" -ge 12 ]; then
  MAX_MODEL="3b"
fi

cat <<EOF
{
  "ram_gb": ${RAM_GB},
  "cpu_cores": ${CPU_CORES},
  "arch": "${ARCH}",
  "gpu": "${GPU}",
  "disk_free_gb": ${DISK_FREE_GB},
  "recommended_profile": "${PROFILE}",
  "max_model_size": "${MAX_MODEL}"
}
EOF

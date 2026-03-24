FROM python:3.11-slim

WORKDIR /app

# System deps for libzim, ffmpeg (audio conversion), and whisper.cpp build
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        libzim-dev \
        ffmpeg \
        curl \
        cmake \
        git \
    && rm -rf /var/lib/apt/lists/*

# Build whisper.cpp from source
ARG WHISPER_VERSION=v1.7.4
RUN git clone --depth 1 --branch ${WHISPER_VERSION} https://github.com/ggerganov/whisper.cpp.git /tmp/whisper && \
    cd /tmp/whisper && \
    cmake -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --config Release -j$(nproc) && \
    cp build/bin/whisper-cli /usr/local/bin/whisper-cpp && \
    rm -rf /tmp/whisper

# Download default whisper model (base.en — 142MB, good for M4 MacBook Pro)
ARG WHISPER_MODEL=base.en
RUN mkdir -p /app/models && \
    curl -L -o /app/models/ggml-${WHISPER_MODEL}.bin \
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin"

ENV WHISPER_BIN=/usr/local/bin/whisper-cpp
ENV WHISPER_MODEL=/app/models/ggml-base.en.bin

# Install Python deps
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy source code
COPY main.py .
COPY extractors/ extractors/

EXPOSE 8100

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]

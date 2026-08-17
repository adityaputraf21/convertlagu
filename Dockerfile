FROM node:20-bookworm-slim

# ffmpeg (audio processing) + python3/pip (to install yt-dlp) + curl (healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp as a standalone binary — no venv headaches, always latest release
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# create the folders used for user data + temp conversion files.
# NOTE: don't use the Docker `VOLUME` instruction here — Railway's builder
# rejects it ("dockerfile invalid: docker VOLUME ... is not supported").
# Persistent storage on Railway is configured separately via Railway Volumes
# in the dashboard (mount to these same paths) — see DEPLOY-RAILWAY.md.
RUN mkdir -p /app/data /app/tmp

ENV PORT=3000
ENV DATA_DIR=/app/data
ENV TMP_DIR=/app/tmp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server/index.js"]

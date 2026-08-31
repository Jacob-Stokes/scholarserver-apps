FROM ghcr.io/vrtmrz/livesync-cli:1.0.21-cli@sha256:c5f7897bd0763e79250136a7631e1aa41ae7b48780151349f3ad0673c15cf17c

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"

COPY --chmod=755 apps/obsidian/livesync-worker/worker.mjs /app/scholarserver-worker.mjs
USER 1000:1000
ENTRYPOINT ["node", "/app/scholarserver-worker.mjs"]

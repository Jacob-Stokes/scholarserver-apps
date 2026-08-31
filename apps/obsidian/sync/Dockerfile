FROM node:24-alpine AS ui-build

WORKDIR /source/apps/obsidian/ui
COPY vendor/scholarserver-ui /source/vendor/scholarserver-ui
COPY apps/obsidian/ui/package.json apps/obsidian/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/obsidian/ui/ ./
RUN npm run build

FROM node:22.22.0-alpine3.23

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"

RUN npm install --global obsidian-headless@0.0.14 \
    && (deluser --remove-home node 2>/dev/null || true)
WORKDIR /app
COPY apps/obsidian/sync/package.json apps/obsidian/sync/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
RUN addgroup -g 1000 obsidian \
    && adduser -u 1000 -G obsidian -h /home/obsidian -s /bin/sh -D obsidian \
    && mkdir -p /vault /runtime /livesync-runtime /home/obsidian/.config \
    && chown -R 1000:1000 /vault /runtime /livesync-runtime /home/obsidian

COPY --chown=1000:1000 apps/obsidian/sync/controller.mjs /app/controller.mjs
COPY --chown=1000:1000 apps/obsidian/sync/livesync-setup.mjs /app/livesync-setup.mjs
COPY --from=ui-build --chown=1000:1000 /source/apps/obsidian/ui/dist /app/ui

ENV HOME=/home/obsidian
USER 1000:1000
CMD ["node", "/app/controller.mjs"]

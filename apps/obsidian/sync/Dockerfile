FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS ui-build

WORKDIR /source/apps/obsidian/ui
COPY vendor/scholarserver-ui /source/vendor/scholarserver-ui
COPY apps/obsidian/ui/package.json apps/obsidian/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/obsidian/ui/ ./
RUN npm run build

FROM node:22.22.0-alpine3.23@sha256:e4bf2a82ad0a4037d28035ae71529873c069b13eb0455466ae0bc13363826e34

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"

RUN deluser --remove-home node
WORKDIR /app
COPY apps/obsidian/sync/package.json apps/obsidian/sync/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
# Only MIT-licensed native dependencies are compiled here, never Headless.
RUN apk add --no-cache --virtual .native-build python3 make g++ \
    && npm rebuild better-sqlite3 --build-from-source \
    && apk del .native-build \
    && rm -rf /root/.npm /root/.cache
RUN addgroup -g 1000 obsidian \
    && adduser -u 1000 -G obsidian -h /home/obsidian -s /bin/sh -D obsidian \
    && mkdir -p /vault /runtime /official-client /livesync-runtime /home/obsidian/.config \
    && chown -R 1000:1000 /vault /runtime /official-client /livesync-runtime /home/obsidian

COPY --chown=1000:1000 apps/obsidian/sync/controller.mjs /app/controller.mjs
COPY --chown=1000:1000 apps/obsidian/sync/research-note.mjs /app/research-note.mjs
COPY --chown=1000:1000 apps/obsidian/sync/official-client.mjs apps/obsidian/sync/official-command.mjs /app/
COPY packages/controller-runtime /app/node_modules/@scholarserver/controller-runtime
COPY --chown=1000:1000 apps/obsidian/sync/livesync-setup.mjs /app/livesync-setup.mjs
COPY --chown=1000:1000 apps/obsidian/sync/couchdb-request.mjs /app/couchdb-request.mjs
COPY --chown=1000:1000 apps/obsidian/sync/livesync-settings.mjs /app/livesync-settings.mjs
COPY --chown=1000:1000 apps/obsidian/sync/livesync-lifecycle.mjs /app/livesync-lifecycle.mjs
COPY --from=ui-build --chown=1000:1000 /source/apps/obsidian/ui/dist /app/ui

ENV HOME=/home/obsidian
USER 1000:1000
CMD ["node", "/app/controller.mjs"]

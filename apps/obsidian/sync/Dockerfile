FROM node:22.22.0-alpine3.23

RUN npm install --global obsidian-headless@0.0.14 \
    && (deluser --remove-home node 2>/dev/null || true)
RUN addgroup -g 1000 obsidian \
    && adduser -u 1000 -G obsidian -h /home/obsidian -s /bin/sh -D obsidian \
    && mkdir -p /vault /runtime /home/obsidian/.config \
    && chown -R 1000:1000 /vault /runtime /home/obsidian

COPY --chown=1000:1000 controller.mjs /app/controller.mjs

ENV HOME=/home/obsidian
USER 1000:1000
CMD ["node", "/app/controller.mjs"]

FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"
WORKDIR /app
RUN apk add --no-cache tini \
    && mkdir -p /state /linked \
    && chown -R 10001:10001 /state /linked
COPY --chown=10001:10001 apps/zotero/automations/worker.mjs ./worker.mjs
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "worker.mjs"]

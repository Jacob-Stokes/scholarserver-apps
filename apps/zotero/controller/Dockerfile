FROM node:24-alpine AS ui-build

WORKDIR /source/apps/zotero/ui
COPY vendor/scholarserver-ui /source/vendor/scholarserver-ui
COPY apps/zotero/ui/package.json apps/zotero/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/zotero/ui/ ./
RUN npm run build

FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"
WORKDIR /app
RUN apk add --no-cache tini
COPY --chown=10001:10001 apps/zotero/controller/controller.mjs ./controller.mjs
COPY --from=ui-build --chown=10001:10001 /source/apps/zotero/ui/dist /app/ui
RUN mkdir -p /runtime /data /linked /cache \
    && chown -R 10001:10001 /runtime /data /linked /cache
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "controller.mjs"]

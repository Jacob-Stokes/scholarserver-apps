FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS ui-build

WORKDIR /source/apps/zotero/ui
COPY vendor/scholarserver-ui /source/vendor/scholarserver-ui
COPY apps/zotero/ui/package.json apps/zotero/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/zotero/ui/ ./
RUN npm run build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"
WORKDIR /app
RUN apk add --no-cache tini
COPY --chown=10001:10001 apps/zotero/controller/controller.mjs ./controller.mjs
COPY --chown=10001:10001 apps/zotero/controller/status-model.mjs ./status-model.mjs
COPY packages/controller-runtime /app/node_modules/@scholarserver/controller-runtime
COPY --from=ui-build --chown=10001:10001 /source/apps/zotero/ui/dist /app/ui
RUN mkdir -p /runtime /data /linked /cache \
    && chown -R 10001:10001 /runtime /data /linked /cache
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "controller.mjs"]

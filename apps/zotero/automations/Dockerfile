FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"
WORKDIR /app
RUN apk add --no-cache tini \
    && mkdir -p /state /linked \
    && chown -R 10001:10001 /state /linked
COPY --chown=10001:10001 apps/zotero/automations/worker.mjs ./worker.mjs
COPY packages/controller-runtime /app/node_modules/@scholarserver/controller-runtime
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "worker.mjs"]

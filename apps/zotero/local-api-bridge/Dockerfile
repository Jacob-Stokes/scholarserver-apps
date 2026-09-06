FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"
WORKDIR /app
RUN apk add --no-cache tini
COPY --chown=10001:10001 apps/zotero/controller/controller.mjs ./controller.mjs
RUN mkdir -p /runtime \
    && chown -R 10001:10001 /runtime
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "controller.mjs", "--local-api-bridge"]

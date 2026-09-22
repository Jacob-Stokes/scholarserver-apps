FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS build
WORKDIR /source
COPY packages/mcp-common ./packages/mcp-common
RUN cd packages/mcp-common && npm ci --ignore-scripts && npm run build
WORKDIR /source/apps/paperless/integration
COPY apps/paperless/integration/package.json apps/paperless/integration/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --install-links

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps" org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=build /source/apps/paperless/integration/node_modules ./node_modules
COPY apps/paperless/integration/server.mjs apps/paperless/integration/client.mjs apps/paperless/integration/tools.mjs apps/paperless/integration/package.json ./
COPY LICENSE /usr/share/doc/scholarserver-paperless/LICENSE
USER 1000:1000
EXPOSE 7016
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["node", "--input-type=module", "-e", "const r = await fetch('http://127.0.0.1:7016/health', {signal: AbortSignal.timeout(3000)}); if (!r.ok) process.exit(1)"]
CMD ["node", "server.mjs"]

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS build
WORKDIR /source
COPY packages/mcp-common ./packages/mcp-common
RUN cd packages/mcp-common && npm ci --ignore-scripts && npm run build
COPY packages/controller-runtime ./packages/controller-runtime
COPY vendor/scholarserver-ui ./vendor/scholarserver-ui
WORKDIR /source/apps/freshrss/ui
COPY apps/freshrss/ui/package.json apps/freshrss/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/freshrss/ui ./
RUN npm run build
WORKDIR /source/apps/freshrss/integration
COPY apps/freshrss/integration/package.json apps/freshrss/integration/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --install-links

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps" org.opencontainers.image.title="ScholarServer FreshRSS integration" org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=build /source/apps/freshrss/integration/node_modules ./node_modules
COPY --from=build /source/apps/freshrss/ui/dist ./ui
COPY apps/freshrss/integration/server.mjs apps/freshrss/integration/setup.mjs apps/freshrss/integration/client.mjs apps/freshrss/integration/tools.mjs apps/freshrss/integration/package.json ./
COPY LICENSE apps/freshrss/DISTRIBUTION.md /usr/share/doc/scholarserver-freshrss/
USER 1000:1000
EXPOSE 8080 8082 7015
CMD ["node", "server.mjs"]

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS build
WORKDIR /source
COPY packages/controller-runtime ./packages/controller-runtime
COPY vendor/scholarserver-ui ./vendor/scholarserver-ui
WORKDIR /source/apps/n8n/ui
COPY apps/n8n/ui/package.json apps/n8n/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/n8n/ui ./
RUN npm run build
WORKDIR /source/apps/n8n/integration
COPY apps/n8n/integration/package.json apps/n8n/integration/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --install-links

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"
WORKDIR /app/integration
COPY --from=build /source/apps/n8n/integration/node_modules ./node_modules
COPY --from=build /source/apps/n8n/ui/dist ./ui
COPY apps/n8n/integration/client.mjs apps/n8n/integration/templates.mjs apps/n8n/integration/workflows.mjs apps/n8n/integration/setup.mjs apps/n8n/integration/server.mjs apps/n8n/integration/package.json ./
COPY apps/n8n/templates ../templates
COPY apps/n8n/integration/configuration.mjs ./
COPY apps/n8n/integration/requirements.mjs apps/n8n/integration/inventory.mjs ./
COPY apps/n8n/integration/manager-connection.mjs ./
COPY apps/n8n/integration/catalog.mjs apps/n8n/integration/research-access.mjs apps/n8n/integration/research-bridge.mjs ./
COPY apps/n8n/integration/bootstrap-client.mjs apps/n8n/integration/password-setup.mjs apps/n8n/integration/setup-actions.mjs ./
USER 1000:1000
EXPOSE 8080
CMD ["node", "server.mjs"]

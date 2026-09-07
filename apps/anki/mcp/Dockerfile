FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /build
COPY packages/mcp-common/package.json packages/mcp-common/package-lock.json packages/mcp-common/tsconfig.json ./packages/mcp-common/
COPY packages/mcp-common/src ./packages/mcp-common/src
RUN cd packages/mcp-common && npm ci --ignore-scripts --no-audit --no-fund && npm run build
WORKDIR /build/apps/anki/mcp
COPY apps/anki/mcp/package.json apps/anki/mcp/package-lock.json apps/anki/mcp/tsconfig.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund --install-links
COPY apps/anki/mcp/src ./src
RUN npm run build && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --install-links

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
WORKDIR /app
COPY LICENSE apps/anki/UPSTREAM_NOTICES.md /usr/share/doc/scholarserver-anki/
COPY --from=build /build/apps/anki/mcp/node_modules ./node_modules
COPY --from=build /build/apps/anki/mcp/dist ./dist
COPY apps/anki/mcp/package.json ./
USER 1000:1000
ENV PORT=7006
EXPOSE 7006
CMD ["node", "dist/server.js"]

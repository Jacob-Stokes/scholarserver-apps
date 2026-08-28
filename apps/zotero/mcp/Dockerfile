FROM node:22-alpine AS build
WORKDIR /build
COPY packages/mcp-common/package.json packages/mcp-common/tsconfig.json ./packages/mcp-common/
COPY packages/mcp-common/src ./packages/mcp-common/src
RUN cd packages/mcp-common && npm install --no-audit --no-fund && npm run build

WORKDIR /build/apps/zotero/mcp
COPY apps/zotero/mcp/package.json apps/zotero/mcp/tsconfig.json ./
RUN npm install --no-audit --no-fund --install-links
COPY apps/zotero/mcp/src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache curl tini
COPY --from=build /build/apps/zotero/mcp/node_modules ./node_modules
COPY --from=build /build/apps/zotero/mcp/dist ./dist
COPY apps/zotero/mcp/package.json ./
ENV PORT=7012
EXPOSE 7012
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

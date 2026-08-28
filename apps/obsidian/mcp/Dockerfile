FROM node:22.22.0-alpine3.23 AS build
WORKDIR /build/packages/mcp-common

COPY packages/mcp-common/package.json packages/mcp-common/tsconfig.json ./
COPY packages/mcp-common/src ./src
RUN npm install --no-audit --no-fund && npm run build

WORKDIR /build/apps/obsidian/mcp
COPY apps/obsidian/mcp/package.json apps/obsidian/mcp/tsconfig.json ./
RUN npm install --no-audit --no-fund --install-links
COPY apps/obsidian/mcp/src ./src
RUN npm run build

FROM node:22.22.0-alpine3.23
WORKDIR /app
RUN apk add --no-cache tini curl
COPY --from=build /build/apps/obsidian/mcp/node_modules ./node_modules
COPY --from=build /build/apps/obsidian/mcp/dist ./dist
COPY apps/obsidian/mcp/package.json ./
ENV PORT=7002
EXPOSE 7002
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]

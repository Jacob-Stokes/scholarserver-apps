FROM node:22.22.0-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94
WORKDIR /app
ENV NODE_ENV=production OBSIDIAN_MULTI_VAULT=1
COPY apps/obsidian/api/package.json apps/obsidian/api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY apps/obsidian/api/src ./api/src
COPY apps/obsidian/vaults ./vaults
EXPOSE 3000
USER node
CMD ["node", "api/src/server.mjs"]

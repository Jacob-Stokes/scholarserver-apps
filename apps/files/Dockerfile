FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
WORKDIR /app
COPY apps/files/package.json apps/files/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY apps/files/server.mjs apps/files/upstream.mjs ./
COPY apps/files/UPSTREAM-LICENSE /app/notices/filesystem-LICENSE
USER node
EXPOSE 7014
CMD ["node", "server.mjs"]

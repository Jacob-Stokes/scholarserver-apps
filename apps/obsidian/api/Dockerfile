FROM node:22.22.0-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY src/server.mjs ./server.mjs
COPY src/frontmatter.mjs ./frontmatter.mjs
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]

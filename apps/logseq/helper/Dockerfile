FROM node:22.22.0-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS download
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /download
RUN case "$TARGETARCH" in \
      amd64) artifact=x86_64; checksum=981bf1f37403685ef83223193795d29bb0729b50929d543c2c4bce771e307a17 ;; \
      arm64) artifact=arm64; checksum=6208f9ccc6de22f485b1c63dc076251262fbe4eebd7353bf53a21b45627a3af2 ;; \
      *) exit 1 ;; \
    esac && \
    curl --fail --location --retry 3 -o logseq.zip "https://github.com/logseq/logseq/releases/download/2.0.1/Logseq-linux-${artifact}-2.0.1.zip" && \
    echo "$checksum  logseq.zip" | sha256sum --check --strict && \
    unzip -q logseq.zip -d /opt/logseq

FROM node:22.22.0-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tini libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdbus-1-3 libgtk-3-0 libgbm1 libasound2 libsecret-1-0 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=download /opt/logseq /opt/logseq
WORKDIR /app
COPY apps/logseq/helper/package.json apps/logseq/helper/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY apps/logseq/helper/server.mjs apps/logseq/helper/operations.mjs apps/logseq/helper/runner.mjs apps/logseq/helper/cli-bridge.cjs ./
COPY apps/logseq/helper/worker-http.mjs apps/logseq/helper/http-operations.mjs apps/logseq/helper/references.mjs ./
RUN mkdir /graph /runtime && chown 1000:1000 /graph /runtime
USER 1000:1000
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.mjs"]

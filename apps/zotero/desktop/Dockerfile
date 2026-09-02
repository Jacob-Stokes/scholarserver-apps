FROM alpine:3.22 AS plugin-builder

RUN apk add --no-cache zip
COPY plugin /source
RUN cd /source && zip -q -r /setup-bridge.xpi .

FROM ubuntu:24.04

ARG TARGETARCH
ARG ZOTERO_VERSION=10.0.1
ARG ZOTERO_SHA256_AMD64=7bf57ab1e757077f2168a58cbc20b7f6db516ae7ad787bca94c6cdf0df6df200
ARG ZOTERO_SHA256_ARM64=e42e69275dafa14af0342f5dea24242a3f7c39ba7e92b4ee00a97b0f08cd387a
ARG ZOTMOOV_VERSION=1.2.32
ARG ZOTMOOV_SHA256=7770dc2c62d2aaab2662fd7402afadd058387bff69578481ac039bfc050ecc2b

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      dbus-x11 \
      fonts-dejavu-core \
      fonts-liberation \
      libasound2t64 \
      libdbus-glib-1-2 \
      libgtk-3-0 \
      libnss3 \
      libx11-xcb1 \
      libxt6t64 \
      novnc \
      openbox \
      python3-minimal \
      tini \
      tigervnc-standalone-server \
      websockify \
      xauth \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64) zotero_arch=x86_64; zotero_sha="${ZOTERO_SHA256_AMD64}" ;; \
      arm64) zotero_arch=arm64; zotero_sha="${ZOTERO_SHA256_ARM64}" ;; \
      *) echo "Unsupported native architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    archive=/tmp/zotero.tar.xz; \
    curl -fsSL "https://download.zotero.org/client/release/${ZOTERO_VERSION}/Zotero-${ZOTERO_VERSION}_linux-${zotero_arch}.tar.xz" -o "${archive}"; \
    echo "${zotero_sha}  ${archive}" | sha256sum -c -; \
    mkdir -p /opt/zotero; \
    tar -xJf "${archive}" --strip-components=1 -C /opt/zotero; \
    rm -f "${archive}"; \
    rm -f /usr/share/novnc/index.html

RUN set -eu; \
    zotmoov=/opt/zotero/distribution/extensions/zotmoov@wileyy.com.xpi; \
    mkdir -p /opt/zotero/distribution/extensions; \
    curl -fsSL "https://github.com/wileyyugioh/zotmoov/releases/download/${ZOTMOOV_VERSION}/zotmoov-${ZOTMOOV_VERSION}-fx.xpi" -o "${zotmoov}"; \
    echo "${ZOTMOOV_SHA256}  ${zotmoov}" | sha256sum -c -

RUN useradd --create-home --home-dir /home/zotero --uid 10001 --shell /usr/sbin/nologin zotero \
    && mkdir -p /config /data \
    && chown -R zotero:zotero /config /data /home/zotero

COPY --chown=root:root start-zotero.sh /usr/local/bin/start-zotero
COPY --chown=root:root novnc-index.html /usr/share/novnc/index.html
COPY --chown=root:root scholarserver-launch.mjs /usr/share/novnc/scholarserver-launch.mjs
COPY --from=plugin-builder --chown=root:root /setup-bridge.xpi /opt/zotero/distribution/extensions/setup-bridge@scholarserver.com.xpi
RUN chmod 0755 /usr/local/bin/start-zotero

USER 10001:10001
ENV HOME=/config/home \
    DISPLAY=:1 \
    NO_AT_BRIDGE=1

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-zotero"]

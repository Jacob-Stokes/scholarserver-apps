FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

ARG BUILDARCH
ARG TARGETARCH
ARG ZOTERO_VERSION=10.0.1
ARG ZOTERO_SHA256_ARM64=e42e69275dafa14af0342f5dea24242a3f7c39ba7e92b4ee00a97b0f08cd387a

# This local test client deliberately has no emulated or non-ARM64 build path.
RUN test "${BUILDARCH}" = arm64 && test "${TARGETARCH}" = arm64 \
    && test "$(dpkg --print-architecture)" = arm64

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates curl dbus-x11 fonts-dejavu-core fonts-liberation \
      libasound2t64 libdbus-glib-1-2 libegl1 libgtk-3-0 libnss3 libpci3 libx11-xcb1 libxt6t64 \
      novnc openbox python3-minimal tini tigervnc-standalone-server \
      websockify x11-utils xauth xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    archive=/tmp/zotero.tar.xz; \
    curl --fail --location --show-error --retry 3 --connect-timeout 30 --max-time 600 \
      "https://download.zotero.org/client/release/${ZOTERO_VERSION}/Zotero-${ZOTERO_VERSION}_linux-arm64.tar.xz" \
      --output "${archive}"; \
    echo "${ZOTERO_SHA256_ARM64}  ${archive}" | sha256sum -c -; \
    mkdir -p /opt/zotero; \
    tar -xJf "${archive}" --strip-components=1 -C /opt/zotero; \
    rm -f "${archive}"; \
    ln -sf vnc.html /usr/share/novnc/index.html

RUN groupadd --gid 10001 zotero \
    && useradd --uid 10001 --gid 10001 --home-dir /config --create-home \
      --shell /usr/sbin/nologin zotero \
    && mkdir -p /tmp/.X11-unix \
    && chmod 1777 /tmp/.X11-unix

COPY --chown=root:root start-zotero.py healthcheck.py /usr/local/lib/zotero-test/

USER 10001:10001
ENV HOME=/config DISPLAY=:1 NO_AT_BRIDGE=1
EXPOSE 6080

HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
    CMD ["python3", "/usr/local/lib/zotero-test/healthcheck.py"]
ENTRYPOINT ["/usr/bin/tini", "--", "python3", "/usr/local/lib/zotero-test/start-zotero.py"]

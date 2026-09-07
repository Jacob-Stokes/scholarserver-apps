FROM ghcr.io/freshrss/freshrss@sha256:e1c956e586ae20ba7f9a0c6582043172ee084af43f17ff48b8de22ade026b6c4
LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps" org.opencontainers.image.title="ScholarServer FreshRSS startup adapter" org.opencontainers.image.licenses="AGPL-3.0 AND MIT"
COPY apps/freshrss/integration/bootstrap /opt/scholarserver
COPY LICENSE apps/freshrss/DISTRIBUTION.md /usr/share/doc/scholarserver-freshrss/
USER 1000:1000
ENTRYPOINT ["/bin/sh", "/opt/scholarserver/launch.sh"]

FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS appearance
WORKDIR /source
COPY vendor/scholarserver-ui ./vendor/scholarserver-ui
WORKDIR /source/apps/freshrss/ui
COPY apps/freshrss/ui/package.json apps/freshrss/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/freshrss/ui ./
RUN npx vite build --config reader-theme.config.ts

FROM ghcr.io/freshrss/freshrss@sha256:e1c956e586ae20ba7f9a0c6582043172ee084af43f17ff48b8de22ade026b6c4
LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps" org.opencontainers.image.title="ScholarServer FreshRSS startup adapter" org.opencontainers.image.licenses="AGPL-3.0 AND MIT"
COPY apps/freshrss/integration/bootstrap /opt/scholarserver
COPY apps/freshrss/reader/extension /var/www/FreshRSS/extensions/ScholarServerAppearance
COPY --from=appearance /source/apps/freshrss/ui/reader-dist /var/www/FreshRSS/p/themes/ScholarServer
COPY vendor/scholarserver-ui/source.css vendor/scholarserver-ui/typography.css vendor/scholarserver-ui/nebula.css /usr/share/doc/scholarserver-freshrss/fonts/
COPY LICENSE apps/freshrss/DISTRIBUTION.md /usr/share/doc/scholarserver-freshrss/
USER 1000:1000
ENTRYPOINT ["/bin/sh", "/opt/scholarserver/launch.sh"]

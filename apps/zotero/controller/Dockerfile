FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini
COPY controller.mjs ./controller.mjs
RUN mkdir -p /runtime /data /linked \
    && chown -R 10001:10001 /runtime /data /linked
USER 10001:10001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "controller.mjs"]

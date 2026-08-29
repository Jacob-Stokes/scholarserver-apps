FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS ui-build

WORKDIR /source/apps/docling/ui
COPY vendor/scholarserver-ui /source/vendor/scholarserver-ui
COPY apps/docling/ui/package.json apps/docling/ui/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/docling/ui/ ./
RUN npm run build

FROM python:3.12-alpine@sha256:d09d15e60962ca365d1cd544a48773bac9d33f2fb1b00f2aa0deec78ade7dc31

RUN addgroup -g 10001 scholarserver \
    && adduser -D -H -u 10001 -G scholarserver scholarserver

COPY --chmod=0555 apps/docling/controller/controller.py /app/controller.py
COPY --from=ui-build --chown=10001:10001 /source/apps/docling/ui/dist /app/ui

USER 10001:10001
ENTRYPOINT ["python3", "/app/controller.py"]

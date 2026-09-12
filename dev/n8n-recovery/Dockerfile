# Operator-only helper; not an application runtime or release image.
# Build context contains an executor compiled from the recorded core commit.
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
RUN apk add --no-cache docker-cli docker-cli-compose restic
COPY executor /usr/local/bin/scholarserver-executor
ENTRYPOINT ["/usr/local/bin/scholarserver-executor"]

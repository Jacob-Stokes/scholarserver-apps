FROM couchdb:3.5.0@sha256:1c0a30a54535377bc9ae23f42efb1ca4e92abe796f78ec98b768ac1d5874cc1b

LABEL org.opencontainers.image.source="https://github.com/Jacob-Stokes/scholarserver-apps"

COPY --chmod=755 apps/obsidian/livesync-couchdb/entrypoint.sh /usr/local/bin/scholarserver-couchdb
COPY --chmod=755 apps/obsidian/livesync-couchdb/healthcheck.sh /usr/local/bin/scholarserver-couchdb-healthcheck
USER 5984:5984
ENTRYPOINT ["/usr/local/bin/scholarserver-couchdb"]

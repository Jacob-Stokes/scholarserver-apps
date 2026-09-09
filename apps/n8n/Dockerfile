FROM docker.n8n.io/n8nio/n8n@sha256:9f21fbf422982bbdddc31085c180bef82d59cc608ba16dfec4fc48611d0b51b8
# Reviewed deployment defaults belong in the immutable image, not arbitrary
# catalog environment settings. Upstream owns the application and its entrypoint.
ENV N8N_DIAGNOSTICS_ENABLED=false \
    N8N_PERSONALIZATION_ENABLED=false \
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true \
    N8N_BLOCK_ENV_ACCESS_IN_NODE=true \
    N8N_COMMUNITY_PACKAGES_ENABLED=false \
    NODES_EXCLUDE='["n8n-nodes-base.executeCommand","n8n-nodes-base.readWriteFile"]' \
    N8N_PROXY_HOPS=1 \
    EXECUTIONS_DATA_PRUNE=true \
    EXECUTIONS_DATA_MAX_AGE=168 \
    EXECUTIONS_DATA_PRUNE_MAX_COUNT=1000

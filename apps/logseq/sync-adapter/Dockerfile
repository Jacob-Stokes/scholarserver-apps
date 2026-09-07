# Keep upstream runtime bytes unchanged; only add ScholarServer startup/config.
FROM ghcr.io/yshalsager/logseq-selfhost-sync@sha256:354c0913eefbee78a6f6a8b122ef257226b625e9c29708e41518dec61943aef5
COPY LICENSE apps/logseq/DISTRIBUTION.md /usr/share/doc/scholarserver-logseq/
COPY --chown=65532:65532 apps/logseq/helper/sync-launcher.mjs /app/scholarserver-launcher.mjs
# Public upstream verification identifiers, not account credentials.
ENV COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8
ENV COGNITO_CLIENT_ID=69cs1lgme7p8kbgld8n5kseii6
ENV COGNITO_JWKS_URL=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_dtagLnju8/.well-known/jwks.json
CMD ["/app/scholarserver-launcher.mjs"]

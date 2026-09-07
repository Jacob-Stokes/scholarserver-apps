# Anki release blocked

Draft only. Nothing here is installable or approved for publication.

Candidate package files are under `development/`, outside the release builder's
`apps/*/package/scholarserver-app.yaml` discovery glob. Keep this marker if a
candidate is ever promoted to `package/`: `scripts/build-release.sh` refuses it.
No catalog/index, release workflow or image build list was changed.

Required before removal: approved immutable application image/runtime inputs,
controller/onboarding credential provisioning, package schema validation, native
container hardening/startup, actual desktop/mobile sync and backup/restore,
Gateway/authentication acceptance and all items in DEVELOPMENT_NOTES.md.

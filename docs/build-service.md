# Build service

GitHub remains the source repository. Resolution copies `main` and
`codex/beginner-acceptance` into the private Gitea repository
`https://gitea.jacob.st/scholarserver-builds/scholarserver-apps` every two minutes.
The **Actions** page shows the locked source checks and application builds.
`.gitea/workflows/check.yml` calls `scripts/check-source.sh`; app dependency setup
and the explicit app build/test list remain owned here, not by Manager.

The runner is shared with core and executes one amd64 job at a time. It has no
production data mounts or Docker socket. No images or catalog versions are
published by these jobs. GitHub's automatic Check and image workflows are disabled
and their source triggers are manual-only to preserve the account's $0 limit.

Native image publication and ARM64 acceptance remain separate release work.
Do not equate a source build with a container test or a signed installation.
See core `docs/resolution-ci.md` for limits, credentials, maintenance and the
remaining fresh-host acceptance boundary.

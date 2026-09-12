# Build service

GitHub remains the source repository. Resolution copies `main` and
`codex/beginner-acceptance` into the private Gitea repository
`https://gitea.jacob.st/scholarserver-builds/scholarserver-apps` every two minutes.
The **Actions** page shows the locked source checks and application builds.
`.gitea/workflows/check.yml` calls `scripts/check-source.sh`. The script installs
the root lockfile and the independently locked Obsidian sync controller, then runs
repository lint, source tests, packaging-source tests and the root production build.
The packaging-source suite includes Files and FreshRSS tests; it does not launch
the final containers. The root build names
every declared workspace that provides a build script; `tests/source-check.test.mjs`
rejects a workspace that is missing from that explicit list. App dependency setup
and source build/test coverage remain owned here, not by Manager.

The runner is shared with core and executes one amd64 job at a time. It has no
production data mounts or Docker socket. No images or catalog versions are
published by these jobs. GitHub's automatic Check and image workflows are disabled
and their source triggers are manual-only to preserve the account's $0 limit.

These production builds compile the application source with locked dependencies.
Native image publication and ARM64 acceptance remain separate release work.
Do not equate a source production build with a container test, image-content
qualification, package publication, a signed installation or live acceptance.
See core `docs/resolution-ci.md` for limits, credentials, maintenance and the
remaining fresh-host acceptance boundary.

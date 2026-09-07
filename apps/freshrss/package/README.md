# FreshRSS

A private reading list for journal feeds, researchers and websites. No paid
FreshRSS subscription or external account is needed.

Beta requirement: use a current ScholarServer Manager build with native
application-form support (core commit `d005b98` or later). Older development
builds may display the reader but reject its sign-in form.

After installation, choose a username and password, save a reader address, then
open FreshRSS. Add subscriptions there or import an OPML file from another reader.
The server checks feeds every 30 minutes. FreshRSS's own interface also refreshes
feeds on demand.

The AI connection can list feeds and categories, count unread articles, read
articles, and change read/starred state. Subscription changes and full-text search
remain in the FreshRSS interface in this first beta. It does not fetch paywalled
articles or grant access to journal subscriptions.

FreshRSS and private integration state are backed up together. Treat backups as
sensitive. Reader updates are explicit catalog updates; the built-in updater is
disabled. Restore a backup before reverting a database-changing upstream upgrade.

Packaging uses the official FreshRSS image with a small startup wrapper, plus a
separate ScholarServer integration image. See the repository's
`apps/freshrss/DISTRIBUTION.md` for ownership and licence details.

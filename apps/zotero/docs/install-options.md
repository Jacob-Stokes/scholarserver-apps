# Choose a Zotero installation

ScholarServer offers two ways to connect Zotero. Both include the Zotero MCP
service: it translates requests from approved AI tools into Zotero API calls.
Neither option replaces the ScholarServer Gateway or requires changing the
Zotero installation on your computer.

| | Complete Zotero workspace | Online library only |
| --- | --- | --- |
| Best for | A server-side Zotero library, desktop plugins and local attachment processing | AI access to your existing zotero.org library with fewer server resources |
| Zotero Desktop on the server | Yes, with a browser-accessible desktop | No |
| Zotero MCP service | Yes | Yes |
| Library authority used by tools | The server's Zotero Desktop, synchronized by Zotero | Zotero's Web API |
| References, collections, tags and notes | Through the local API | Through the Web API, subject to the key's permissions |
| Account setup | Sign in on Zotero's website, then approve local access in Zotero | Create a dedicated Zotero Web API key and connect it |
| Attachments | Zotero Storage, personal-library WebDAV, or a separately shared linked folder | Optional on-demand fetch from Zotero Storage; not WebDAV or linked-file contents |
| Packaged Zotero automation worker | Included, configured separately | Not installed |
| Declared minimum memory | 2 GiB | 256 MiB |
| Declared recommended memory | 4 GiB | 512 MiB |

Memory figures are package planning requirements, not measured consumption or a
budget for the whole server. Large libraries, other apps and conversion work
need additional resources. Installing Docling or n8n is separate from installing
Zotero. A complete workspace does not mean every automation is configured or
verified, and the online option does not currently offer the complete workspace's
automation worker merely because a PDF is available in Zotero Storage.

## How the complete workspace works

```text
ScholarServer setup UI → package controller → small plugin inside Zotero

ScholarServer Gateway → Zotero MCP → protected API relay → Zotero Desktop
                                                               ↕
                                                        Zotero sync service
                                                               ↕
                                                Zotero on your other devices
```

Zotero owns the library and sync. ScholarServer installs its supporting services,
guides account and storage setup, and reports what it can verify. The controller
does not proxy ordinary MCP library requests or directly edit Zotero's database.
The relay authenticates access to Zotero's loopback-only API inside the stack;
that raw API is not exposed to the internet.

Select **Connect Zotero account** to sign in on Zotero's website. ScholarServer
does not ask for your Zotero password. Account setup is observed on the server,
so closing the ScholarServer page does not create another login request when you
return. If setup was interrupted before the login session could be saved, inspect
the account in Zotero using the recovery view instead of repeatedly starting login.

Select attachment storage, then request access. Choose **Always Allow** in
Zotero's own permission dialog for ongoing use; **Allow** grants only one write.
The setup panel can show Zotero when the protected desktop uses the same origin.
Other addresses, blocked frames and account-recovery situations use the
separate-tab link. Account login and local write permission are separate grants.
Local permission covers every library that account can edit, not a single tool
or collection. Gateway access must still be granted to the intended AI client.

Once connection settings are saved, run an initial sync and check an attachment
and the Gateway connection separately. Saved authorization is not proof that a
PDF reached another device. Revoke remembered local access in Zotero's Advanced
settings when it is no longer wanted; subsequent writes may require authorization
again.

## Attachment choices are not separate Zotero editions

- **Zotero Storage:** Zotero synchronizes attachment files. Storage allowances
  and paid plans belong to Zotero. Download-on-sync makes files available locally
  earlier but uses more server disk space than download-on-demand.
- **WebDAV:** Zotero synchronizes personal-library files through your WebDAV
  account. References still use Zotero sync. Group-library files use Zotero
  Storage when enabled. ScholarServer must pass WebDAV credentials to Zotero for
  configuration; this is distinct from collecting your Zotero password.
- **Shared folder with ZotMoov:** an advanced linked-file setup. You must arrange
  access to the same files on each device. ZotMoov can move files, so select this
  deliberately; Zotero does not synchronize those linked file bytes. The package
  does not turn a server path into a folder on your computer.
- **References only:** disables file sync on this server. It does not delete
  existing attachment files or prevent local files from occupying space.

The online option instead offers citation data only or permission to fetch
Zotero Storage files into a private server cache. It does not need a server
desktop, a local authorization dialog or a second desktop sync loop.

## Versions and availability

An **install variant** is Complete workspace or Online library only. The
**upstream version** identifies Zotero itself. The **ScholarServer package
version** identifies the tested combination of Zotero, setup, MCP and supporting
services. These numbers are not interchangeable.

The source manifest currently identifies upstream Zotero `10.0.1` and package
candidate `0.5.10-beta.3`. This guide describes the current source design; it is
not proof that the candidate or this setup revision is available in your server's
official catalog. Existing installations change only through a separately
published and installed package update. See the development notes for acceptance
and release gates.

The online mode currently uses a manually created API key. Zotero documents an
[OAuth key exchange](https://www.zotero.org/support/dev/web_api/v3/oauth), but a
registered ScholarServer OAuth integration is not implemented here. It should
not be confused with signing Zotero Desktop into its sync account. Details of
local permission are in [Zotero's local API documentation](https://www.zotero.org/support/dev/web_api/v3/local_api).

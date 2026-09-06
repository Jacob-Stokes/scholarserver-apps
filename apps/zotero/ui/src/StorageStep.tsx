import { SetupPanel } from "@scholarserver/ui/setup-pipeline";
import {
  onlineStorageOptions,
  type Status,
  type StorageMode,
  type StorageSettings,
  storageOptions
} from "./setup-model";

type Props = {
  online: boolean;
  status: Pick<Status, "accountConnected" | "storageMode" | "linkedFolderAutomation" | "linkedFolder">;
  busy: boolean;
  settings: StorageSettings;
  onChange: (settings: StorageSettings) => void;
  onBack: () => void;
  onSave: () => void;
};
export function StorageStep({ online, status, busy, settings, onChange, onBack, onSave }: Props) {
  const { storageMode, downloadMode, groupFileSync, webdavUrl, webdavUsername, webdavPassword } = settings;
  return (
    <SetupPanel
      stage={2}
      total={online ? 3 : 5}
      title={online ? "Choose attachment access" : "Choose where attachments live"}
      description={
        online
          ? "Choose whether this server should access only citation data or fetch files from Zotero Storage when needed."
          : "Your references always synchronize through Zotero. Choose separately how this server obtains PDFs and other files."
      }
      back={onBack}
      next={onSave}
      nextLabel="Save and continue"
      nextDisabled={
        !status.accountConnected || (storageMode === "webdav" && (!webdavUrl || !webdavUsername || !webdavPassword))
      }
      busy={busy}
    >
      <label className="ss-field">
        {online ? "Attachment access" : "Storage option"}
        <select
          className="ss-input"
          value={storageMode}
          onChange={(event) => {
            const next = event.target.value as StorageMode;
            onChange({ ...settings, storageMode: next, groupFileSync: next === "zotero-storage" });
          }}
        >
          {(online ? onlineStorageOptions : storageOptions).map((option) => (
            <option key={option.value} value={option.value}>
              {option.title}
            </option>
          ))}
        </select>
        <span className="ss-field-help ss-storage-description">
          {(online ? onlineStorageOptions : storageOptions).find((option) => option.value === storageMode)?.detail}
        </span>
      </label>
      {storageMode === "webdav" ? (
        <>
          <label className="ss-field">
            WebDAV URL
            <input
              className="ss-input"
              type="url"
              placeholder="https://dav.example.org/zotero"
              value={webdavUrl}
              onChange={(event) => onChange({ ...settings, webdavUrl: event.target.value })}
            />
          </label>
          <label className="ss-field">
            WebDAV username
            <input
              className="ss-input"
              autoComplete="username"
              value={webdavUsername}
              onChange={(event) => onChange({ ...settings, webdavUsername: event.target.value })}
            />
          </label>
          <label className="ss-field">
            WebDAV password{" "}
            <span className="ss-field-help">
              Sent directly to Zotero's credential store and discarded after configuration.
            </span>
            <input
              className="ss-input"
              type="password"
              autoComplete="current-password"
              value={webdavPassword}
              onChange={(event) => onChange({ ...settings, webdavPassword: event.target.value })}
            />
          </label>
        </>
      ) : null}
      {!online && storageMode !== "server-only" && storageMode !== "linked-folder" ? (
        <label className="ss-field">
          Download attachments
          <select
            className="ss-input"
            value={downloadMode}
            onChange={(event) => onChange({ ...settings, downloadMode: event.target.value })}
          >
            <option value="on-demand">When opened — saves server disk space</option>
            <option value="on-sync">During every sync — keeps a complete local copy</option>
          </select>
        </label>
      ) : null}
      {!online && (storageMode === "zotero-storage" || storageMode === "webdav") ? (
        <label className="ss-check">
          <input
            type="checkbox"
            checked={groupFileSync}
            onChange={(event) => onChange({ ...settings, groupFileSync: event.target.checked })}
          />
          <span>
            <strong>Synchronize group-library files with Zotero Storage</strong>
            <small>WebDAV applies only to personal libraries; group files always use Zotero Storage.</small>
          </span>
        </label>
      ) : null}
      {storageMode === "linked-folder" ? (
        status.storageMode === "linked-folder" && status.linkedFolderAutomation ? (
          <div className="ss-callout">
            <strong>Shared storage is active.</strong> ZotMoov moves server-added PDFs into{" "}
            <code>{status.linkedFolder ?? "/linked"}</code>. Desktop computers that add PDFs need ZotMoov pointed at the
            same shared folder.
          </div>
        ) : (
          <div className="ss-callout ss-callout-warning">
            <strong>Attach External Storage first.</strong> Connect the same folder under ScholarServer Storage, install
            ZotMoov on each desktop that adds PDFs, and use matching relative paths. Linked files do not work in group
            libraries, Zotero Web Library, or Zotero mobile.
          </div>
        )
      ) : null}
    </SetupPanel>
  );
}

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, Folder, FolderOpen, HardDrive, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface FolderListing {
  path: string;
  parent: string | null;
  folders: Array<{ name: string; path: string }>;
}

export function FolderPicker({ label, help, value, disabled = false, onChange, browse }: {
  label: string;
  help: string;
  value: string;
  disabled?: boolean;
  onChange: (path: string) => void;
  browse: (path: string) => Promise<FolderListing>;
}) {
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (folder: string) => {
    setLoading(true);
    setError(null);
    try { setListing(await browse(folder)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The folder could not be opened"); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(value); }, [open]);
  const breadcrumbs = useMemo(() => {
    const parts = listing?.path.split("/").filter(Boolean) ?? [];
    return [{ name: "Shared storage", path: "" }, ...parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join("/") }))];
  }, [listing?.path]);

  return <div className="ss-field">
    <span>{label}</span>
    <div className="ss-input-group">
      <input className="ss-input" value={value} disabled={disabled} placeholder="Whole shared folder" onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="ss-button ss-button-secondary" disabled={disabled} onClick={() => setOpen(true)}><FolderOpen size={16} />Browse</button>
    </div>
    <span className="ss-field-help">{help}</span>

    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="ss-dialog-overlay" />
        <Dialog.Content className="ss-dialog-content" aria-describedby="folder-picker-description">
          <div className="ss-dialog-header">
            <div><Dialog.Title className="ss-dialog-title">Choose a folder</Dialog.Title><Dialog.Description id="folder-picker-description" className="ss-dialog-description">Select a folder inside the shared storage attached to this application. ScholarServer cannot browse anywhere else.</Dialog.Description></div>
            <Dialog.Close className="ss-icon-button" aria-label="Close"><X size={18} /></Dialog.Close>
          </div>
          <div className="ss-dialog-body">
            <nav aria-label="Folder path" className="ss-breadcrumbs">{breadcrumbs.map((crumb, index) => <span key={crumb.path || "root"} className="ss-breadcrumb-part">{index ? <ChevronRight size={14} /> : null}<button type="button" disabled={loading} onClick={() => void load(crumb.path)}>{index === 0 ? <><HardDrive size={14} />{crumb.name}</> : crumb.name}</button></span>)}</nav>
            <div className="ss-folder-list">
              {loading ? <div className="ss-folder-message"><LoaderCircle className="ss-spin-icon" size={18} />Loading folders…</div> : null}
              {!loading && error ? <div className="ss-folder-message ss-folder-error"><p>{error}</p><button type="button" className="ss-button ss-button-secondary" onClick={() => void load("")}>Return to shared storage</button></div> : null}
              {!loading && !error && listing?.folders.length === 0 ? <div className="ss-folder-message"><Folder size={30} /><p>This folder has no subfolders.</p><small>You can still select it.</small></div> : null}
              {!loading && !error && listing?.folders.map((folder) => <button key={folder.path} type="button" className="ss-folder-row" onClick={() => void load(folder.path)}><span className="ss-folder-icon"><Folder size={17} /></span><strong>{folder.name}</strong><ChevronRight size={16} /></button>)}
            </div>
            <div className="ss-selected-folder">Selected: <code>{listing?.path || "/ (whole shared folder)"}</code></div>
          </div>
          <div className="ss-dialog-footer"><Dialog.Close className="ss-button ss-button-secondary">Cancel</Dialog.Close><button type="button" className="ss-button" disabled={loading || !listing} onClick={() => { onChange(listing?.path ?? ""); setOpen(false); }}><FolderOpen size={16} />Select this folder</button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}

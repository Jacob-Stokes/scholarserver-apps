import * as Dialog from "@radix-ui/react-dialog";
import React from "react";

/** Focus, dismissal and scrolling only. The caller retains form and request ownership. */
export function ApplicationConfigurationDialog({
  open,
  title,
  description,
  onDismiss,
  children
}: {
  open: boolean;
  title: string;
  description?: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const opener = React.useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="ss-dialog-overlay ss-configuration-dialog-overlay" />
        <Dialog.Content
          className="ss-dialog-content ss-configuration-dialog"
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            // The caller can restore a replaced collection control after its view settles.
            event.preventDefault();
            if (opener.current?.isConnected) {
              opener.current.focus();
            }
          }}
        >
          <Dialog.Title className="ss-visually-hidden">{title}</Dialog.Title>
          <Dialog.Description className="ss-visually-hidden">
            {description || "Configure this connection."}
          </Dialog.Description>
          <button
            type="button"
            className="ss-button ss-button-secondary ss-configuration-dialog-close"
            onClick={onDismiss}
          >
            Close
          </button>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import React from "react";
import { Toaster, toast } from "sonner";

// Feedback is presentation only. Durable operation results remain in their
// owning screen and Activity; errors and recovery instructions stay inline.
export function notifySuccess(message: string) {
  return toast.success(message);
}

export function Notifications() {
  return (
    <Toaster
      position="top-center"
      duration={5000}
      closeButton
      visibleToasts={3}
      offset={24}
      mobileOffset={16}
      className="ss-notifications"
      toastOptions={{ className: "ss-notification" }}
    />
  );
}

// Compatibility for app-owned notice props. A rerender or StrictMode effect
// replay must not announce the same completion again.
export function SuccessNotice({ message }: { message?: string | null }) {
  const previous = React.useRef<string | null | undefined>(null);
  React.useEffect(() => {
    if (message && message !== previous.current) notifySuccess(message);
    previous.current = message;
  }, [message]);
  return null;
}

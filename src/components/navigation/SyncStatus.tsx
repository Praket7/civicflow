import { useEffect, useState } from "react";
import { CloudOff, HardDrive } from "lucide-react";
import { useAuth } from "../../lib/auth/session";
import { useOrganizationWorkspace } from "../../lib/organizations/useOrganizationWorkspace";
import styles from "./SyncStatus.module.css";

export function SyncStatus() {
  const { user } = useAuth();
  const { current } = useOrganizationWorkspace(user);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!current) return null;
  const synced = current.syncMode === "synced";
  const label = synced
    ? online
      ? "Synced"
      : "Offline · saved locally"
    : online
      ? "Local only"
      : "Offline · saved locally";
  const Icon = synced && online ? HardDrive : CloudOff;

  return (
    <span
      className={styles.status}
      data-tone={synced ? (online ? "good" : "watch") : online ? "quiet" : "watch"}
      title={
        synced
          ? "Changes are shared with this organization when a connection is available."
          : "This workspace lives on this device. Nothing leaves it."
      }
    >
      <Icon size={13} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

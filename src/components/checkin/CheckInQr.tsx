import { useEffect, useState } from "react";
import styles from "./CheckInQr.module.css";

export function CheckInQr({ payload }: { payload: string | null }) {
  const [result, setResult] = useState<{ payload: string; source: string } | null>(null);
  const source = payload && result?.payload === payload ? result.source : "";

  useEffect(() => {
    let active = true;
    if (!payload) return () => undefined;
    import("qrcode")
      .then((module) =>
        module.default.toDataURL(payload, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 360,
          color: { dark: "#071b32", light: "#ffffff" },
        }),
      )
      .then((url) => {
        if (active) setResult({ payload, source: url });
      })
      .catch(() => {
        if (active) setResult(null);
      });
    return () => {
      active = false;
    };
  }, [payload]);

  if (!payload || !source) return null;

  return (
    <details className={styles.wrap}>
      <summary className={styles.summary}>Show QR code for the door scanner</summary>
      <div className={styles.body}>
        <img
          className={styles.code}
          src={source}
          alt="QR code containing this shift's check-in token"
          width={180}
          height={180}
        />
        <div className={styles.copy}>
          <p className={styles.title}>Scan at the kiosk</p>
          <p className={styles.text}>
            Hold this code up to the camera at the check-in table. The kiosk fills in the event
            token, then you choose your name. The six-digit code still works if the camera is
            unavailable.
          </p>
        </div>
      </div>
    </details>
  );
}

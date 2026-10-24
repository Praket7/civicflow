import { useState } from "react";
import styles from "./Avatar.module.css";

const tones = ["violet", "teal", "coral", "amber", "cobalt", "green", "rose", "cyan"] as const;
type AvatarTone = (typeof tones)[number] | string;

interface AvatarProps {
  initials: string;
  src?: string;
  tone?: AvatarTone;
  size?: number;
  label?: string;
  className?: string;
}

export function Avatar({
  initials,
  src,
  tone = "violet",
  size = 34,
  label,
  className,
}: AvatarProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const safeTone = (tones as readonly string[]).includes(tone) ? tone : "violet";
  const showPhoto = Boolean(src) && !photoFailed;
  return (
    <span
      className={[styles.avatar, className].filter(Boolean).join(" ")}
      data-tone={safeTone}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {showPhoto ? (
        <img
          className={styles.photo}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

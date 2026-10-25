import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { OPEN_SOURCE_CREDITS } from "../data/credits";
import styles from "./CreditsPage.module.css";

export function CreditsPage() {
  const photos = OPEN_SOURCE_CREDITS.photos;
  const pexelsCount = photos.filter((photo) => photo.license === "Pexels License").length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>About CivicFlow</p>
        <h1 className={styles.title}>Photo &amp; open-source credits</h1>
        <p className={styles.lede}>
          CivicFlow ships no AI-generated imagery. All {photos.length} bundled photographs are
          free-licensed, and each one is listed below with its source, license, and the screen it
          appears on.
        </p>
      </header>

      <section className={styles.panel} aria-labelledby="photo-credits">
        <div className={styles.sectionHead}>
          <h2 id="photo-credits" className={styles.sectionTitle}>
            Photography
          </h2>
          <p className={styles.sectionMeta}>
            {photos.length} files · {pexelsCount} Pexels · {photos.length - pexelsCount} CC BY-SA
            4.0
          </p>
        </div>
        <ul className={styles.grid}>
          {photos.map((photo) => (
            <li key={photo.file} className={styles.photo}>
              <img
                className={styles.thumb}
                src={`/media/${photo.file}`}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <div className={styles.photoBody}>
                <span className={styles.file}>{photo.file}</span>
                <span className={styles.usage}>{photo.usage}</span>
                <span className={styles.meta}>
                  {photo.creator} ·{" "}
                  <a href={photo.sourceUrl} target="_blank" rel="noreferrer">
                    source
                    <ArrowUpRight size={10} aria-hidden="true" />
                  </a>{" "}
                  ·{" "}
                  <a href={photo.licenseUrl} target="_blank" rel="noreferrer">
                    {photo.license}
                  </a>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          Pexels photographs are used under the Pexels License (attribution not required). Crops
          made for layout are adaptations; CC BY-SA 4.0 images stay under that license and are
          credited above. The portrait files are square center crops of the listed Pexels photos.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby="font-credits">
        <h2 id="font-credits" className={styles.sectionTitle}>
          Fonts &amp; software
        </h2>
        <p className={styles.note}>
          Geist, Geist Mono, and Source Serif 4 are bundled under the SIL Open Font License 1.1.
          React, React Router, TanStack Query, Recharts, date-fns, Zod, React Hook Form, Tauri,
          rusqlite, chrono, serde, uuid, and Lucide are used under their respective MIT, Apache-2.0,
          ISC, or public-domain terms. The full list lives in{" "}
          <code>docs/OPEN_SOURCE_CREDITS.md</code>.
        </p>
      </section>

      <Link className={styles.back} to="/coordinator/mission-control">
        Back to Mission Control
      </Link>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import type { DisplayImage, DisplaySettings } from "../../lib/displayCustomization.ts";
import styles from "./CompetitionDisplay.module.css";

function DisplayAsset({ image, background = false }: { image: DisplayImage; background?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className={styles.failed} role="status">{background ? "Background" : image.name} image unavailable</span>
    : <img src={image.src} alt={background ? "" : image.name} className={background ? styles.background : styles.image} onError={() => setFailed(true)} />;
}
/** Reusable visual shell for the preview and future saved public-display integration. */
export default function CompetitionDisplay({ settings, title, children, showTitle = true }: { settings: DisplaySettings; title: string; children: ReactNode; showTitle?: boolean }) {
  return <div className={styles.canvas}>
    {settings.background && <DisplayAsset key={settings.background.src} image={settings.background} background />}
    <div className={styles.content}>{(showTitle || settings.logo) && <header className={styles.header}>
      {settings.logo && <div className={styles.logo}><DisplayAsset key={settings.logo.src} image={settings.logo} /></div>}
      {showTitle && <div><p>Competition display</p><h3>{title}</h3></div>}
    </header>}{children}
    {settings.sponsors.length > 0 && <footer className={styles.footer}><p>Sponsors</p><ul>{settings.sponsors.map((image, index) => <li key={image.src + index}><DisplayAsset image={image} /></li>)}</ul></footer>}</div>
  </div>;
}

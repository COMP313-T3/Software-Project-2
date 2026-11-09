import { DISPLAY_BACKGROUNDS } from "../../lib/displayBackgrounds.ts";
import styles from "./BackgroundPicker.module.css";

const CHOICES: readonly { key: string | null; label: string; src: string | null }[] = [
  { key: null, label: "Plain white", src: null },
  ...DISPLAY_BACKGROUNDS,
];

/**
 * The competition's display background, chosen from TopSend's own pictures (US-021). Plain white
 * is the default, and nothing is uploaded.
 *
 * @param value The chosen background's key, or null for plain white.
 * @param onChange Called with the newly chosen key, or null for plain white.
 */
export default function BackgroundPicker({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  return (
    <fieldset className={styles.picker}>
      <legend>Display background</legend>
      <p className={styles.help}>Choose one of TopSend's backgrounds. Plain white is the default.</p>
      <div className={styles.choices}>
        {CHOICES.map((choice) => (
          <label key={choice.key ?? "plain"} className={styles.choice}>
            <input type="radio" name="display-background" checked={value === choice.key} onChange={() => onChange(choice.key)} />
            <span
              className={styles.swatch}
              style={choice.src ? { backgroundImage: `url("${choice.src}")` } : undefined}
              aria-hidden="true"
            />
            <span className={styles.label}>{choice.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

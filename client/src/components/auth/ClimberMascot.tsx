import { memo } from "react";
import sceneUrl from "../../assets/auth/login-scene.jpg";
import styles from "./ClimberMascot.module.css";
import { useMascotMotion } from "./useMascotMotion.ts";

interface ClimberMascotProps {
  /** Called when the eyes close for a password control or open again. */
  onEyesClosedChange?: (closed: boolean) => void;
}

/**
 * The login scene: the climbing mascot whose monitor head and eye beams follow the mouse.
 * Decorative only, so it is hidden from screen readers.
 */
function ClimberMascot({ onEyesClosedChange }: ClimberMascotProps) {
  const { stageRef, anchorRef, headRef, frontRef, eyesRef, beamsRef } =
    useMascotMotion(onEyesClosedChange);

  return (
    <>
      <div className={styles.stage} ref={stageRef} aria-hidden="true">
        <img
          className={styles.scene}
          src={sceneUrl}
          alt=""
          width={1672}
          height={941}
          draggable={false}
        />
        <div className={styles.headAnchor} ref={anchorRef}>
          <div className={styles.headPersp}>
            <div className={styles.head} ref={headRef}>
              <div className={`${styles.face} ${styles.fBack}`} />
              <div className={`${styles.face} ${styles.fBottom}`} />
              <div className={`${styles.face} ${styles.fTop}`} />
              <div className={`${styles.face} ${styles.fLeft}`} />
              <div className={`${styles.face} ${styles.fRight}`} />
              <div className={`${styles.face} ${styles.fFront}`} ref={frontRef}>
                <div className={styles.screenGlow} />
                <div className={styles.eyes} ref={eyesRef}>
                  <div className={`${styles.eye} ${styles.eyeL}`} />
                  <div className={`${styles.eye} ${styles.eyeR}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <svg
        className={styles.beams}
        ref={beamsRef}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id="mascot-beam-fade-l"
            data-part="fade-l"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0" stopColor="#ffdcb4" stopOpacity="0.13" />
            <stop offset="0.3" stopColor="#ffc58c" stopOpacity="0.05" />
            <stop offset="1" stopColor="#ffb070" stopOpacity="0.015" />
          </linearGradient>
          <linearGradient
            id="mascot-beam-fade-r"
            data-part="fade-r"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <stop offset="0" stopColor="#ffdcb4" stopOpacity="0.13" />
            <stop offset="0.3" stopColor="#ffc58c" stopOpacity="0.05" />
            <stop offset="1" stopColor="#ffb070" stopOpacity="0.015" />
          </linearGradient>
          <radialGradient id="mascot-spot-fade">
            <stop offset="0" stopColor="#ffd6a8" stopOpacity="0.14" />
            <stop offset="0.55" stopColor="#ffc58c" stopOpacity="0.04" />
            <stop offset="1" stopColor="#ffc58c" stopOpacity="0" />
          </radialGradient>
          <filter
            id="mascot-beam-soft"
            data-part="soften"
            filterUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="1"
            height="1"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
        </defs>
        <g data-part="beam-group" opacity="0" filter="url(#mascot-beam-soft)">
          <polygon data-part="beam-l0" fill="url(#mascot-beam-fade-l)" />
          <polygon data-part="beam-l1" fill="url(#mascot-beam-fade-l)" />
          <polygon data-part="beam-l2" fill="url(#mascot-beam-fade-l)" />
          <polygon data-part="beam-r0" fill="url(#mascot-beam-fade-r)" />
          <polygon data-part="beam-r1" fill="url(#mascot-beam-fade-r)" />
          <polygon data-part="beam-r2" fill="url(#mascot-beam-fade-r)" />
          <circle data-part="spot" r="64" fill="url(#mascot-spot-fade)" />
        </g>
      </svg>
    </>
  );
}

export default memo(ClimberMascot);

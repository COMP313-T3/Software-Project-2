import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import logoUrl from "../../assets/brand/topsend-logo.png";
import { useSession } from "../session/sessionContext.ts";
import { LANDING_LINKS } from "./landingContent.ts";
import { scrollToSection } from "./motion.ts";
import styles from "./LandingNav.module.css";

const SECTION_LINKS = [
  { id: "climbers", label: "For climbers" },
  { id: "gyms", label: "For gyms" },
  { id: "live", label: "Live scoring" },
];

/**
 * Whether the page has scrolled past the point where the top bar should appear. The hero marks
 * that point with data-nav-from; a page without the mark shows the bar as soon as it scrolls.
 */
function pastNavMark(): boolean {
  const mark = document.querySelector<HTMLElement>("[data-nav-from]");
  return mark ? mark.getBoundingClientRect().top <= 0 : window.scrollY > 24;
}

/**
 * The bar across the top of the landing page: the logo, which goes back to the start of the
 * page, links down to the sections, and the log-in and sign-up buttons, or a dashboard button
 * for someone already logged in.
 *
 * It stays out of the way while the opening video plays, since the hero has its own buttons,
 * and slides in once the video has handed off to the 3D sections. Scrolling back up into the
 * video hides it again. While hidden it can't be reached with the keyboard either.
 */
export default function LandingNav() {
  const { status } = useSession();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const update = () => setShown(pastNavMark());
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const jumpTo = (id: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    scrollToSection(id);
  };

  const backToStart = (event: MouseEvent<HTMLAnchorElement>) => {
    const opensElsewhere =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
    if (opensElsewhere) return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  return (
    <header className={styles.bar} data-shown={shown} inert={!shown}>
      <Link
        to="/"
        className={styles.brand}
        aria-label="TopSend home"
        onClick={backToStart}
      >
        <img src={logoUrl} alt="" width={317} height={104} />
      </Link>
      <nav className={styles.links} aria-label="Landing page sections">
        {SECTION_LINKS.map((link) => (
          <a key={link.id} href={`#${link.id}`} onClick={jumpTo(link.id)}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className={styles.account}>
        {status === "signedIn" ? (
          <Link className={styles.signUp} to={LANDING_LINKS.dashboard}>
            Dashboard
          </Link>
        ) : (
          <>
            <Link className={styles.logIn} to={LANDING_LINKS.login}>
              Log in
            </Link>
            <Link className={styles.signUp} to={LANDING_LINKS.register}>
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

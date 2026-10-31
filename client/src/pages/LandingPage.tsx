import { Link } from "react-router-dom";
import logoUrl from "../assets/brand/topsend-logo.png";
import FeatureSection from "../components/landing/FeatureSection.tsx";
import HeroOrbit from "../components/landing/HeroOrbit.tsx";
import LandingActions from "../components/landing/LandingActions.tsx";
import LandingNav from "../components/landing/LandingNav.tsx";
import LandingScene from "../components/landing/LandingScene.tsx";
import { FEATURE_SECTIONS, LANDING_LINKS } from "../components/landing/landingContent.ts";
import { revealOrder, useReveal } from "../components/landing/useReveal.ts";
import styles from "./LandingPage.module.css";

/**
 * The closing call to action. The 3D camera ends here face to face with Topo, who watches the
 * pointer, so the panel sits low on the screen under him.
 */
function ClosingCall() {
  const { ref, state } = useReveal<HTMLDivElement>(0.3);
  return (
    <section id="join" className={styles.closing} data-journey-step="4" aria-labelledby="join-title">
      <div className={styles.closingPin}>
        <div ref={ref} className={styles.closingPanel} data-state={state}>
          <p className={styles.closingEyebrow} data-line style={revealOrder(0)}>
            Join TopSend
          </p>
          <h2 id="join-title" className={styles.closingTitle} data-line style={revealOrder(1)}>
            Ready for your next send?
          </h2>
          <p className={styles.closingBody} data-line style={revealOrder(2)}>
            Create an account to find a competition near you and lock in your division.
          </p>
          <div data-line style={revealOrder(3)}>
            <LandingActions centered />
          </div>
          <p className={styles.closingGym} data-line style={revealOrder(4)}>
            Run a gym? <Link to={LANDING_LINKS.gymRequest}>Request Gym Admin access</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * The public home page at "/", for visitors who haven't signed up yet. It opens on Topo's 360
 * orbit played by scrolling, then hands off to a 3D scene that the camera travels down through,
 * one stage per section: the competition map, a climbing wall with scored routes, the gym
 * dashboard, and a podium with live scores for comp day. Every part of the page has a way to
 * sign up or log in.
 */
export default function LandingPage() {
  return (
    <div className={styles.page} data-landing="">
      <title>TopSend | Bouldering competitions in Toronto</title>
      <LandingNav />
      <LandingScene />
      <main className={styles.main}>
        <HeroOrbit />
        {FEATURE_SECTIONS.map((feature, index) => (
          <FeatureSection key={feature.id} feature={feature} number={index + 1} />
        ))}
        <ClosingCall />
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src={logoUrl} alt="TopSend" width={317} height={104} />
          <p>Local bouldering competitions in Toronto, all in one place.</p>
        </div>
        <nav className={styles.footerLinks} aria-label="More from TopSend">
          <Link to={LANDING_LINKS.gymRequest}>For gyms</Link>
          <Link to={LANDING_LINKS.terms}>Terms and Conditions</Link>
          <Link to={LANDING_LINKS.privacy}>Privacy Policy</Link>
        </nav>
      </footer>
    </div>
  );
}

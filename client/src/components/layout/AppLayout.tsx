import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, type Location } from "react-router-dom";
import logoUrl from "../../assets/brand/topsend-logo.png";
import { ROLES } from "../../constants/roles.ts";
import { ApiError } from "../../lib/apiClient.ts";
import Tooltip from "../common/Tooltip.tsx";
import { useSession } from "../session/sessionContext.ts";
import styles from "./AppLayout.module.css";
import theme from "./theme.module.css";

const LOGOUT_HINT = "Ends your session on this device. You'll need your password to log back in.";
const MENU_ID = "phone-menu";
const WIDE_SCREEN = "(min-width: 768px)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const MENU_CLOSE_MS = 180;

const ROLE_NAMES: Record<string, string> = {
  [ROLES.ADMIN]: "System Administrator",
  [ROLES.GYM_ADMIN]: "Gym Administrator",
  [ROLES.CLIMBER]: "Climber",
};

interface NavItem {
  label: string;
  to: string;
  current?: "page" | "location" | "true";
}

/**
 * The pages a role can open, and which one is showing. A page inside a section, like one gym's
 * details, marks its section. Gym Admin links keep the competition filters from the address.
 */
function navigation(role: string | undefined, { pathname, search, hash }: Location): NavItem[] {
  if (role === ROLES.ADMIN) {
    return [
      { label: "Dashboard", to: "/dashboard", current: pathname === "/dashboard" ? "page" : undefined },
      {
        label: "Gyms",
        to: "/admin/gyms",
        current: pathname === "/admin/gyms" ? "page" : pathname.startsWith("/admin/gyms/") ? "true" : undefined,
      },
    ];
  }
  if (role === ROLES.GYM_ADMIN) {
    const onDashboard = pathname === "/dashboard";
    const creating = pathname === "/gym-admin/competitions/new";
    const viewing = !creating && pathname.startsWith("/gym-admin/competitions/");
    return [
      {
        label: "Dashboard",
        to: `/dashboard${search}`,
        current: onDashboard && hash !== "#competitions" ? "page" : undefined,
      },
      {
        label: "Competitions",
        to: `/dashboard${search}#competitions`,
        current: onDashboard && hash === "#competitions" ? "location" : viewing ? "true" : undefined,
      },
      {
        label: "Create competition",
        to: `/gym-admin/competitions/new${search}`,
        current: creating ? "page" : undefined,
      },
    ];
  }
  if (role === ROLES.CLIMBER) return [
    { label: "Discover competitions", to: `/competitions${pathname.startsWith("/competitions") ? search : ""}`, current: pathname === "/competitions" ? "page" : pathname.startsWith("/competitions/") ? "true" : undefined },
  ];
  return [];
}

function prefers(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

interface AppLayoutProps {
  /** The page's name, shown at the left of the top bar as the page's only h1. */
  title: string;
  /** The page's content. */
  children: ReactNode;
}

/**
 * The frame around authenticated pages: the role's pages in a
 * sidebar, and a top bar with the page title and Log out. Phones get a menu button in the top
 * bar instead of the sidebar. A page opens scrolled to the top.
 */
export default function AppLayout({ title, children }: AppLayoutProps) {
  const { user, logOut } = useSession();
  const location = useLocation();
  const items = navigation(user?.role, location);
  const roleName = user ? ROLE_NAMES[user.role] ?? "" : "";
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  }, []);

  async function onLogOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logOut();
    } catch (error) {
      setLogoutError(error instanceof ApiError ? error.message : "Couldn't log out. Please try again.");
      setLoggingOut(false);
    }
  }

  return (
    <div className={`${theme.theme} ${styles.shell}`}>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>
      <div className={styles.sidebar}>
        <img className={styles.logo} src={logoUrl} alt="TopSend" width={159} height={52} />
        <nav aria-label="Main">
          <NavLinks items={items} className={styles.sideNav} />
        </nav>
        <Account email={user?.email} role={roleName} className={styles.sideAccount} />
      </div>
      <div className={styles.column}>
        <header className={styles.topbar}>
          <div className={styles.topbarInner}>
            <h1 className={styles.title}>{title}</h1>
            <div className={styles.topbarActions}>
              <Tooltip text={LOGOUT_HINT} placement="bottom-end">
                {(describedBy) => (
                  <button
                    type="button"
                    className={styles.logout}
                    aria-describedby={describedBy}
                    aria-busy={loggingOut}
                    disabled={loggingOut}
                    onClick={() => void onLogOut()}
                  >
                    {loggingOut ? "Logging out..." : "Log out"}
                  </button>
                )}
              </Tooltip>
              <PhoneMenu items={items} email={user?.email} role={roleName} />
            </div>
          </div>
        </header>
        <main id="main-content" className={styles.main} tabIndex={-1}>
          <LoginNotice />
          {logoutError && (
            <p role="alert" className={styles.logoutError}>
              {logoutError}
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

/** A successful fresh login gets a brief confirmation without interrupting the destination. */
function LoginNotice() {
  const { state } = useLocation();
  const timestamp = (state as { loginSucceededAt?: number } | null)?.loginSucceededAt;
  const [deadline] = useState(() => typeof timestamp === "number" && timestamp <= Date.now() ? timestamp + 5000 : 0);
  const [visible, setVisible] = useState(() => deadline > Date.now());
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [deadline]);
  return visible ? <p className={styles.loginNotice} role="status">Successfully logged in</p> : null;
}

function NavLinks({ items, className, onNavigate }: {
  items: NavItem[];
  className: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.label}>
          <Link to={item.to} aria-current={item.current} onClick={onNavigate}>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Account({ email, role, className }: { email?: string; role: string; className: string }) {
  return (
    <div className={className}>
      <p className={styles.email}>{email}</p>
      {role && <p className={styles.role}>{role}</p>}
    </div>
  );
}

function MenuLines() {
  return (
    <span className={styles.lines} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

type MenuState = "closed" | "open" | "closing";

/**
 * The phone menu: a full-screen panel with the same links as the sidebar. It keeps focus inside
 * while open, closes with Esc, the close button or a link, and gives focus back to the menu
 * button. It closes by itself when the screen gets wide enough for the sidebar.
 */
function PhoneMenu({ items, email, role }: { items: NavItem[]; email?: string; role: string }) {
  const [state, setState] = useState<MenuState>("closed");
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const previous = useRef<MenuState>("closed");
  const showing = state !== "closed";

  useEffect(() => {
    const element = dialog.current;
    if (state === "open" && element && !element.open) element.showModal();
  }, [state]);

  useEffect(() => {
    if (previous.current !== "closed" && state === "closed" && button.current?.isConnected) {
      button.current.focus();
    }
    previous.current = state;
  }, [state]);

  useEffect(() => {
    if (!showing) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = overflow;
    };
  }, [showing]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia(WIDE_SCREEN);
    function onChange() {
      if (wide.matches) shut();
    }
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function shut() {
    window.clearTimeout(timer.current);
    setState("closed");
  }

  function open() {
    window.clearTimeout(timer.current);
    setState("open");
  }

  function close() {
    if (state !== "open") return;
    if (prefers(REDUCED_MOTION)) {
      shut();
      return;
    }
    setState("closing");
    timer.current = window.setTimeout(() => setState("closed"), MENU_CLOSE_MS);
  }

  return (
    <>
      <Tooltip text="Menu" placement="bottom-end" focusVisibleOnly>
        {() => (
          <button
            ref={button}
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={showing}
            aria-controls={showing ? MENU_ID : undefined}
            onClick={open}
          >
            <MenuLines />
          </button>
        )}
      </Tooltip>
      {showing && (
        <dialog
          ref={dialog}
          id={MENU_ID}
          className={styles.menu}
          data-state={state}
          aria-label="Menu"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClose={shut}
        >
          <div className={styles.menuTop}>
            <img className={styles.menuLogo} src={logoUrl} alt="TopSend" width={159} height={52} />
            <Tooltip text="Close menu" placement="bottom-end" focusVisibleOnly>
              {() => (
                <button type="button" className={styles.closeButton} aria-label="Close menu" onClick={close}>
                  <MenuLines />
                </button>
              )}
            </Tooltip>
          </div>
          <nav aria-label="Main" className={styles.menuNav}>
            <NavLinks items={items} className={styles.menuLinks} onNavigate={close} />
          </nav>
          <Account email={email} role={role} className={styles.menuAccount} />
        </dialog>
      )}
    </>
  );
}

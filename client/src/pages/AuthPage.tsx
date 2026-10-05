import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import logoUrl from "../assets/brand/topsend-logo.png";
import AccountCreated from "../components/auth/AccountCreated.tsx";
import ClimberMascot from "../components/auth/ClimberMascot.tsx";
import ForgotPasswordForm from "../components/auth/ForgotPasswordForm.tsx";
import LoginFog from "../components/auth/LoginFog.tsx";
import LoginForm from "../components/auth/LoginForm.tsx";
import RegisterForm from "../components/auth/RegisterForm.tsx";
import ResetPasswordForm from "../components/auth/ResetPasswordForm.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { safeReturnTo } from "../lib/returnTo.ts";
import styles from "./AuthPage.module.css";

type AuthTab = "login" | "register";
type AuthView = AuthTab | "forgot" | "reset";
type Panel = AuthView | "created";

/** What links and redirects inside the card pass along with the address. */
interface AuthLocationState {
  /** Set by links in the card, so the view they open moves focus into its form. */
  focusForm?: boolean;
  /** The email typed in the log in form, carried over to the forgot password form. */
  email?: string;
  /** The token of a reset link, moved here from the address bar. */
  resetToken?: string;
  /** Set when the user just logged out, so Log in says so. */
  loggedOut?: boolean;
}

const VIEWS: Record<
  AuthView,
  { path: string; documentTitle: string; tab: AuthTab; panel: string }
> = {
  login: {
    path: "/login",
    documentTitle: "Log in | TopSend",
    tab: "login",
    panel: "loginForm",
  },
  register: {
    path: "/register",
    documentTitle: "Create account | TopSend",
    tab: "register",
    panel: "registerForm",
  },
  forgot: {
    path: "/forgot-password",
    documentTitle: "Forgot password | TopSend",
    tab: "login",
    panel: "forgotForm",
  },
  reset: {
    path: "/reset-password",
    documentTitle: "New password | TopSend",
    tab: "login",
    panel: "resetForm",
  },
};

const AUTH_VIEWS = Object.keys(VIEWS) as AuthView[];
const SWITCH_KEYS = new Set(["ArrowRight", "ArrowLeft", "Home", "End"]);
const PASSWORD_CHANGED = "Password changed. Log in with your new password.";
const SESSION_EXPIRED = "Your session expired. Log in again to continue.";
const LOGGED_OUT = "You're logged out.";

/**
 * Log in and create account page, with the climbing mascot and fog drifting along the bottom of
 * the scene. The Log in tab also covers the
 * forgot password and reset password views, opened from the Log in form and from the link in
 * the reset email. Once an account is created, the Create account tab says so and leads to Log in.
 * Every view sits in the same spot in the card, which takes the height of the tallest one, so the
 * card keeps its size when switching between them. Tab reaches both switch
 * buttons, and the arrow keys move between them too. The forgot password and reset password views
 * disable both, since their own Back to log in link leads out. Someone logged in skips Log in and
 * Create account, going back to the page they came from, or to the dashboard.
 */
export default function AuthPage() {
  const { pathname, search, state, key } = useLocation();
  const navigate = useNavigate();
  const { status, logIn } = useSession();
  const view =
    AUTH_VIEWS.find((name) => VIEWS[name].path === pathname) ?? "login";
  const tab = VIEWS[view].tab;
  const tabsLocked = view === "forgot" || view === "reset";
  const passed = (state ?? {}) as AuthLocationState;
  const focusRequest = passed.focusForm ? key : null;
  const query = new URLSearchParams(search);
  const tokenInAddress = view === "reset" ? query.get("token") : null;
  const returnTo = safeReturnTo(query.get("returnTo"));
  const sessionNotice =
    query.get("reason") === "expired"
      ? SESSION_EXPIRED
      : passed.loggedOut
        ? LOGGED_OUT
        : "";
  const resetToken = tokenInAddress ?? passed.resetToken ?? "";
  const [eyesClosed, setEyesClosed] = useState(false);
  const [loginNotice, setLoginNotice] = useState({
    count: 0,
    email: "",
    message: "",
  });
  const [created, setCreated] = useState({ email: "", at: "" });
  const showCreated = view === "register" && created.at === key;
  const panel: Panel = showCreated ? "created" : view;
  const tabs = useRef<Record<AuthTab, HTMLButtonElement | null>>({
    login: null,
    register: null,
  });

  // The token leaves the address bar once it's read, so it isn't left on screen or copied
  // along with the address. Reloading still works, since the browser keeps the state.
  useEffect(() => {
    if (tokenInAddress === null) return;
    navigate(VIEWS.reset.path, {
      replace: true,
      state: { resetToken: tokenInAddress },
    });
  }, [tokenInAddress, navigate]);

  if (status === "signedIn" && (view === "login" || view === "register")) {
    return <Navigate to={returnTo ?? "/dashboard"} replace />;
  }

  function show(next: AuthTab, focusTab = false) {
    if (next !== view) navigate(VIEWS[next].path);
    if (focusTab) tabs.current[next]?.focus();
  }

  function showLogin(email: string, message: string, replace = false) {
    setLoginNotice((current) => ({ count: current.count + 1, email, message }));
    navigate(VIEWS.login.path, { replace });
  }

  function onSwitchKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!SWITCH_KEYS.has(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") show("login", true);
    else if (event.key === "End") show("register", true);
    else show(tab === "login" ? "register" : "login", true);
  }

  function viewProps(name: Panel) {
    const active = panel === name;
    return {
      className:
        name === "register"
          ? styles.view
          : `${styles.view} ${styles.loginView}`,
      "data-active": active,
      inert: !active,
      "aria-hidden": active ? undefined : true,
    };
  }

  return (
    <div className={styles.root}>
      <title>
        {showCreated ? "Account created | TopSend" : VIEWS[view].documentTitle}
      </title>
      <ClimberMascot onEyesClosedChange={setEyesClosed} />
      <LoginFog />

      <div className={styles.page}>
        <header className={styles.brand}>
          <img src={logoUrl} alt="TopSend" width={159} height={52} />
        </header>

        <main className={styles.panel}>
          <section className={styles.card} aria-labelledby={`${panel}Title`}>
            <div
              className={styles.switch}
              role="tablist"
              aria-label="Log in or create an account"
              data-view={tab}
              data-locked={tabsLocked}
              onKeyDown={onSwitchKeyDown}
            >
              <span className={styles.switchThumb} aria-hidden="true" />
              <button
                ref={(el) => {
                  tabs.current.login = el;
                }}
                type="button"
                role="tab"
                id="tabLogin"
                aria-selected={tab === "login"}
                aria-controls={
                  tab === "login" ? VIEWS[view].panel : "loginForm"
                }
                disabled={tabsLocked}
                onClick={() => show("login")}
              >
                Log in
              </button>
              <button
                ref={(el) => {
                  tabs.current.register = el;
                }}
                type="button"
                role="tab"
                id="tabRegister"
                aria-selected={tab === "register"}
                aria-controls={showCreated ? "createdPanel" : "registerForm"}
                disabled={tabsLocked}
                onClick={() => show("register")}
              >
                Create account
              </button>
            </div>

            <div className={styles.views}>
              <div {...viewProps("login")}>
                <div className={styles.intro}>
                  <h1 id="loginTitle">Welcome back</h1>
                  <p>
                    Log in to see your events, scorecards and live leaderboards.
                  </p>
                </div>
                <LoginForm
                  key={loginNotice.count}
                  active={view === "login"}
                  eyesClosed={eyesClosed}
                  initialEmail={loginNotice.email}
                  status={loginNotice.message || sessionNotice}
                  onSubmit={({ email, password }) =>
                    logIn(email.trim(), password)
                  }
                  focusRequest={view === "login" ? focusRequest : null}
                />
              </div>
              <div {...viewProps("forgot")}>
                <ForgotPasswordForm
                  key={view === "forgot" ? key : "forgot"}
                  introClassName={styles.intro}
                  initialEmail={view === "forgot" ? passed.email : ""}
                  focusRequest={view === "forgot" ? focusRequest : null}
                />
              </div>
              <div {...viewProps("reset")}>
                <ResetPasswordForm
                  key={resetToken}
                  introClassName={styles.intro}
                  token={resetToken}
                  active={view === "reset"}
                  onReset={(email) => showLogin(email, PASSWORD_CHANGED, true)}
                />
              </div>
              <div {...viewProps("register")}>
                <div className={styles.intro}>
                  <h1 id="registerTitle">Create your climber account</h1>
                  <p>
                    Sign up once, then pick your comps whenever you are ready.
                  </p>
                </div>
                <RegisterForm
                  onCreated={(email) => setCreated({ email, at: key })}
                />
              </div>
              {showCreated && (
                <div {...viewProps("created")}>
                  <AccountCreated
                    introClassName={styles.intro}
                    email={created.email}
                    onLogIn={() => showLogin(created.email, "")}
                  />
                </div>
              )}
            </div>
          </section>
        </main>

        <p className={styles.tagline}>
          Local bouldering competitions in Toronto.
        </p>
      </div>
    </div>
  );
}

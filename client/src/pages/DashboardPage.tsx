import { useState } from "react";
import logoUrl from "../assets/brand/topsend-logo.png";
import Tooltip from "../components/common/Tooltip.tsx";
import { useSession } from "../components/session/sessionContext.ts";
import { ApiError } from "../lib/apiClient.ts";

const UNEXPECTED = "Couldn't log out. Please try again.";

/**
 * Where a login lands: says it worked, with a Log out button under it.
 */
export default function DashboardPage() {
  const { user, logOut } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [problem, setProblem] = useState("");

  async function onLogOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setProblem("");
    try {
      await logOut();
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : UNEXPECTED);
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#0d0a08] font-['Archivo',sans-serif] text-[15px] leading-normal text-[#efe6d8] antialiased">
      <title>Dashboard | TopSend</title>
      <div className="flex min-h-dvh flex-col gap-[clamp(12px,2.4vh,22px)] px-[clamp(16px,5vw,88px)] py-[clamp(12px,3.2vh,28px)]">
        <header>
          <img
            src={logoUrl}
            alt="TopSend"
            width={159}
            height={52}
            className="block h-[clamp(44px,7vh,52px)] w-auto"
          />
        </header>
        <main className="flex flex-1 items-center">
          <section
            aria-labelledby="dashboardTitle"
            className="flex w-full max-w-[460px] flex-col gap-6 rounded-[22px] border border-[rgba(239,230,216,0.16)] bg-[#17110d] px-[clamp(20px,2vw,30px)] py-[clamp(20px,2.8vh,26px)] shadow-[0_30px_70px_-24px_rgba(0,0,0,0.7)]"
          >
            <div className="flex flex-col gap-1.5">
              <h1
                id="dashboardTitle"
                className="m-0 text-[clamp(24px,min(2.2vw,3.6vh),29px)] leading-[1.12] font-bold tracking-[-0.015em]"
              >
                Successfully logged in
              </h1>
              {user && (
                <p className="m-0 text-[#b8a998]">
                  You're logged in as{" "}
                  <strong className="font-semibold [overflow-wrap:anywhere] text-[#efe6d8]">
                    {user.email}
                  </strong>
                  .
                </p>
              )}
            </div>
            <div>
              <Tooltip text="Ends your session on this device. You'll need your password to log back in.">
                {(describedBy) => (
                  <button
                    type="button"
                    aria-describedby={describedBy}
                    aria-busy={loggingOut}
                    className="min-h-12 w-full cursor-pointer rounded-xl border-0 bg-[#fdc914] text-[15.5px] leading-none font-semibold text-[#17120b] hover:bg-[#ffd84d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fdc914] active:translate-y-px"
                    onClick={onLogOut}
                  >
                    {loggingOut ? "Logging out..." : "Log out"}
                  </button>
                )}
              </Tooltip>
              <p
                role="status"
                className="m-0 text-[13px] text-[#ffd6a8] [&:not(:empty)]:mt-2"
              >
                {problem}
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

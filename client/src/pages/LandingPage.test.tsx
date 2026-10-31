import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURE_SECTIONS, HERO_CAPTIONS } from "../components/landing/landingContent.ts";
import LandingPage from "./LandingPage.tsx";

let status = "signedOut";
vi.mock("../components/session/sessionContext.ts", () => ({
  useSession: () => ({ status, user: status === "signedIn" ? { userId: "account-id", role: "CLIMBER" } : null }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

function hrefsOf(name: string) {
  return screen.getAllByRole("link", { name }).map((link) => link.getAttribute("href"));
}

/** Reports whether the visitor asked for reduced motion, the only media query the page reads in tests. */
function prefersReducedMotion(reduce: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  status = "signedOut";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Lets the orbit video play in jsdom, which has no media playback, and reports how it was loaded. */
function allowVideo(download: () => Promise<Response>) {
  prefersReducedMotion(false);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  const fetchVideo = vi.fn(download);
  vi.stubGlobal("fetch", fetchVideo);
  const createObjectURL = vi.fn(() => "blob:orbit");
  const revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  return { fetchVideo, createObjectURL, revokeObjectURL };
}

describe("the landing page", () => {
  it("opens with TopSend as the only top heading, and ways to sign up or log in", () => {
    renderPage();

    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.getAttribute("aria-label"))).toEqual([
      "TopSend",
    ]);
    expect(new Set(hrefsOf("Create your account"))).toEqual(new Set(["/register"]));
    expect(new Set(hrefsOf("Log in"))).toEqual(new Set(["/login"]));
    expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/register");
    expect(document.title).toBe("TopSend | Bouldering competitions in Toronto");
  });

  it("walks through what TopSend offers, one section at a time", () => {
    renderPage();

    const titles = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(titles).toEqual([...FEATURE_SECTIONS.map((feature) => feature.title), "Ready for your next send?"]);
    const live = screen.getByRole("region", { name: "Live scorecards and leaderboards" });
    expect(within(live).getByText("On comp day")).toBeTruthy();
    expect(within(live).getByText("AI Route Assistant")).toBeTruthy();
    expect(screen.queryByText(/coming (soon|next)/i)).toBeNull();
    const gyms = screen.getByRole("region", { name: "Run your comp from one dashboard" });
    expect(within(gyms).getByRole("link", { name: "Request Gym Admin access" }).getAttribute("href")).toBe(
      "/gym-request",
    );
  });

  it("anchors each section to a step of the 3D journey, in scroll order", () => {
    const { container } = renderPage();

    const steps = Array.from(container.querySelectorAll<HTMLElement>("[data-journey-step]")).map((element) =>
      Number(element.dataset.journeyStep),
    );
    expect(steps).toEqual([-1, 0, 1, 2, 3, 4]);
  });

  it("keeps the top bar off the opening video and brings it in once the video hands off", () => {
    const { container } = renderPage();
    const bar = screen.getByRole("banner");
    const mark = container.querySelector<HTMLElement>("[data-nav-from]");
    let markTop = 1200;
    mark!.getBoundingClientRect = () => new DOMRect(0, markTop, 1, 1);

    fireEvent.scroll(window);
    expect(bar.dataset.shown).toBe("false");
    expect(bar.hasAttribute("inert")).toBe(true);

    markTop = -10;
    fireEvent.scroll(window);
    expect(bar.dataset.shown).toBe("true");
    expect(bar.hasAttribute("inert")).toBe(false);

    markTop = 300;
    fireEvent.scroll(window);
    expect(bar.dataset.shown).toBe("false");
  });

  it("jumps to a section from the top bar", () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    try {
      renderPage();

      const sections = screen.getByRole("navigation", { name: "Landing page sections" });
      fireEvent.click(within(sections).getByRole("link", { name: "For gyms" }));

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
      expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("gyms"));
    } finally {
      if (original) Object.defineProperty(Element.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("goes back to the start of the page from the logo in the top bar", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    renderPage();
    const logo = within(screen.getByRole("banner")).getByRole("link", { name: "TopSend home" });
    expect(logo.getAttribute("href")).toBe("/");

    fireEvent.click(logo);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });

    fireEvent.click(logo, { ctrlKey: true });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("links to the Terms and Conditions and the Privacy Policy at the bottom", () => {
    renderPage();

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Terms and Conditions" }).getAttribute("href")).toBe("/terms");
    expect(within(footer).getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });

  it("offers a way back to the dashboard instead of signing up when someone is already logged in", () => {
    status = "signedIn";
    renderPage();

    expect(new Set(hrefsOf("Go to your dashboard"))).toEqual(new Set(["/dashboard"]));
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("link", { name: "Create your account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });

  it("shows a still poster without the video or captions when the visitor prefers reduced motion", () => {
    prefersReducedMotion(true);
    const { container } = renderPage();

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector('img[src="/landing/topo-orbit-poster.jpg"]')).toBeTruthy();
    expect(container.querySelectorAll("[data-caption]")).toHaveLength(0);
  });

  it("plays the orbit video by scrolling, with every caption waiting off screen until its moment", async () => {
    const { fetchVideo, createObjectURL, revokeObjectURL } = allowVideo(async () => new Response("orbit"));
    const { container, unmount } = renderPage();

    const video = container.querySelector("video");
    expect(video?.muted).toBe(true);
    expect(video?.getAttribute("poster")).toBe("/landing/topo-orbit-poster.jpg");
    expect(fetchVideo).toHaveBeenCalledWith("/landing/topo-orbit-1080.mp4", expect.anything());
    await waitFor(() => expect(video?.getAttribute("src")).toBe("blob:orbit"));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const captions = Array.from(container.querySelectorAll<HTMLElement>("[data-caption]"));
    expect(captions.map((caption) => caption.dataset.caption)).toEqual(HERO_CAPTIONS.map((caption) => caption.id));
    expect(captions.every((caption) => caption.inert)).toBe(true);
    expect(within(captions[captions.length - 1]).getByRole("link", { name: "Create your account" })).toBeTruthy();

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:orbit");
  });

  it("streams the orbit video from its address when it can't be downloaded first", async () => {
    allowVideo(async () => new Response(null, { status: 503 }));
    const { container } = renderPage();

    const video = container.querySelector("video");
    await waitFor(() => expect(video?.getAttribute("src")).toBe("/landing/topo-orbit-1080.mp4"));
  });

  it("leaves the 3D scene out in a browser without WebGL 2", () => {
    const { container } = renderPage();

    expect(container.querySelector("canvas")).toBeNull();
  });
});

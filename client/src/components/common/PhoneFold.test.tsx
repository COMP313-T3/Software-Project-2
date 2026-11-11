import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAppStorage } from "../../lib/appStorage.ts";
import { readFoldOpen } from "../../lib/phoneFolds.ts";
import PhoneFold from "./PhoneFold.tsx";

function renderFold({ startsOpen = false, summary = "1260 points" as string | null } = {}) {
  return render(
    <PhoneFold
      name="scorecard-overview"
      about="Competition details and your totals"
      label="Fall Boulder Bash"
      summary={summary}
      startsOpen={startsOpen}
    >
      <p>Location: 123 Wall St</p>
    </PhoneFold>,
  );
}

const bar = () => screen.getByRole("button", { name: /^Competition details and your totals:/ });
const section = () => screen.getByText("Location: 123 Wall St").parentElement!;

beforeEach(() => {
  window.localStorage.clear();
  readFoldOpen("scorecard-overview");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NR-005 a section that folds into a bar on a phone", () => {
  it("starts folded, with a bar that names the section and keeps its key facts in view", () => {
    renderFold();

    expect(bar().getAttribute("aria-expanded")).toBe("false");
    expect(bar().textContent).toBe("Competition details and your totals: Fall Boulder Bash 1260 points");
    expect(section().parentElement?.hasAttribute("data-open")).toBe(false);
  });

  it("keeps the section in the page while folded, since a larger screen always shows it", () => {
    renderFold();

    expect(screen.getByText("Location: 123 Wall St")).toBeTruthy();
    expect(bar().getAttribute("aria-controls")).toBe(section().id);
  });

  it("opens and folds again when the bar is chosen", () => {
    renderFold();

    fireEvent.click(bar());
    expect(bar().getAttribute("aria-expanded")).toBe("true");
    expect(section().parentElement?.dataset.open).toBe("true");

    fireEvent.click(bar());
    expect(bar().getAttribute("aria-expanded")).toBe("false");
    expect(section().parentElement?.hasAttribute("data-open")).toBe(false);
  });

  it("opens the same way on the next visit", () => {
    renderFold();
    fireEvent.click(bar());
    cleanup();

    renderFold();

    expect(bar().getAttribute("aria-expanded")).toBe("true");
  });

  it("starts open when it holds something the user has to read, until they fold it", () => {
    renderFold({ startsOpen: true });
    expect(bar().getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(bar());
    cleanup();
    renderFold({ startsOpen: true });

    expect(bar().getAttribute("aria-expanded")).toBe("false");
  });

  it("starts folded again after logging out clears the browser", () => {
    renderFold();
    fireEvent.click(bar());
    cleanup();

    clearAppStorage();
    renderFold();

    expect(bar().getAttribute("aria-expanded")).toBe("false");
  });

  it("still opens and folds when the browser's storage can't be used", () => {
    for (const method of ["getItem", "setItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("blocked");
      });
    }
    renderFold();

    fireEvent.click(bar());

    expect(bar().getAttribute("aria-expanded")).toBe("true");
  });

  it("works without a second line", () => {
    renderFold({ summary: null });

    expect(bar().textContent?.trim()).toBe("Competition details and your totals: Fall Boulder Bash");
  });

  it("can be a row of a sheet instead of a card of its own", () => {
    render(
      <PhoneFold name="sheet-details" about="Scorecard details" label="Sam Rivera" flush>
        <p>Point system</p>
      </PhoneFold>,
    );

    expect(screen.getByRole("button", { name: /^Scorecard details:/ }).parentElement?.dataset.flush).toBe("true");
  });

  it("is the control the onboarding tutorial points at", () => {
    renderFold();

    expect(bar().dataset.tour).toBe("fold");
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DateOfBirthField from "./DateOfBirthField.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("US-002 date of birth picker", () => {
  it("stops at today in Toronto, even when the device's clock is already on the next day", () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T03:00:00Z"), toFake: ["Date"] });
    render(<DateOfBirthField id="dateOfBirth" labelId="dateOfBirthLabel" value="" onChange={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: /Select a date/ }));

    const day = (iso: string) => document.querySelector(`[data-day="${iso}"]`);
    expect(day("2026-11-14")?.hasAttribute("data-disabled")).toBe(false);
    expect(day("2026-11-15")?.getAttribute("data-disabled")).toBe("true");
  });
});

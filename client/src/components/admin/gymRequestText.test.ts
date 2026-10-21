import { describe, expect, it } from "vitest";
import { applicantName, requestDateTime } from "./gymRequestText.ts";

describe("gym request text", () => {
  it("names the applicant, falling back to the email, then to a placeholder", () => {
    expect(
      applicantName({
        firstName: "Nora",
        lastName: "Patel",
        email: "nora@example.test",
      }),
    ).toBe("Nora Patel");
    expect(
      applicantName({
        firstName: " Nora ",
        lastName: "",
        email: "nora@example.test",
      }),
    ).toBe("Nora");
    expect(
      applicantName({
        firstName: "",
        lastName: "",
        email: "nora@example.test",
      }),
    ).toBe("nora@example.test");
    expect(applicantName({ firstName: "", lastName: "", email: "" })).toBe(
      "Name not given",
    );
  });

  it("shows Toronto time and only wraps between the date and the time", () => {
    const text = requestDateTime("2026-10-20T13:15:00.000Z");

    expect(text.replace(/\s/g, " ")).toBe("Oct 20, 2026, 9:15 a.m.");
    expect(text.split(" ")).toEqual(["Oct 20, 2026,", "9:15 a.m."]);
  });

  it("says when a value isn't a date", () => {
    expect(requestDateTime("not a date")).toBe("Unavailable");
  });
});

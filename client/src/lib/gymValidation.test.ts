import { describe, expect, it } from "vitest";
import { gymLettersError } from "./gymValidation.ts";

describe("gym name and location letters", () => {
  it.each(["12345", "!?--", "#1 / 24-7"])("asks for letters in %s, with the API's messages", value => {
    expect(gymLettersError(value, "name")).toBe("Gym name must include letters, not only numbers or symbols.");
    expect(gymLettersError(value, "location")).toBe("Location must include letters, not only numbers or symbols.");
  });
  it.each(["Gym 9", "123 Main Street", "攀岩馆", "北京市朝阳路123号", "Évasion"])("accepts %s", value => {
    expect(gymLettersError(value, "name")).toBe("");
    expect(gymLettersError(value, "location")).toBe("");
  });
});

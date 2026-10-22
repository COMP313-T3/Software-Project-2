import { describe, expect, it } from "vitest";
import { validateGymRequest, type GymRequestValues } from "./gymRequestValidation.ts";

const valid: GymRequestValues = { requestType: "NEW_GYM", firstName: "Alex", lastName: "River", email: "alex@example.com", phone: "+1 (416) 555-0100", jobTitle: "", details: "", gymName: "Boulder Gym", gymLocation: "Toronto", gymId: "" };
describe("US034 form validation", () => {
  it("allows valid contact and new gym information without optional fields", () => expect(validateGymRequest(valid, "captcha")).toEqual({}));
  it("requires a selected existing gym but not the new-gym fields", () => {
    expect(validateGymRequest({ ...valid, requestType: "EXISTING_GYM", gymName: "", gymLocation: "", gymId: "507f1f77bcf86cd799439011" }, "captcha")).toEqual({});
    expect(validateGymRequest({ ...valid, requestType: "EXISTING_GYM" }, "captcha")).toHaveProperty("gymId");
  });
  it("rejects malformed contact details, long notes and missing captcha", () => {
    const errors = validateGymRequest({ ...valid, email: "wrong", phone: "letters", details: "a".repeat(1001), firstName: " " }, "");
    expect(Object.keys(errors).sort()).toEqual(["details", "email", "firstName", "phone", "recaptchaToken"]);
  });
  it("asks for letters in a new gym's name and address, as the API does", () => {
    expect(validateGymRequest({ ...valid, gymName: "12345", gymLocation: "#100 - 200" }, "captcha")).toEqual({
      gymName: "Gym name must include letters, not only numbers or symbols.",
      gymLocation: "Gym address must include letters, not only numbers or symbols.",
    });
    expect(validateGymRequest({ ...valid, gymName: "Gym 5", gymLocation: "1 Sterling Rd, Toronto" }, "captcha")).toEqual({});
    expect(validateGymRequest({ ...valid, requestType: "EXISTING_GYM", gymName: "123", gymLocation: "456", gymId: "507f1f77bcf86cd799439011" }, "captcha")).toEqual({});
  });
});

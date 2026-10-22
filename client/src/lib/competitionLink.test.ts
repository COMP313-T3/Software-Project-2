import { describe, expect, it } from "vitest";
import { ApiError } from "./apiClient.ts";
import { isInvalidCompetitionLink } from "./competitionLink.ts";

const CHECK_THE_FIELDS = "Check the fields and try again.";

describe("isInvalidCompetitionLink", () => {
  it("recognizes the server refusing the competition ID in the address", () => {
    expect(isInvalidCompetitionLink(new ApiError(400, "VALIDATION_ERROR", CHECK_THE_FIELDS, { competitionId: "Invalid competition id." }))).toBe(true);
  });

  it("leaves other failures to the page's own message and retry", () => {
    for (const error of [
      new ApiError(400, "VALIDATION_ERROR", CHECK_THE_FIELDS, { divisionId: "Invalid division id." }),
      new ApiError(400, "VALIDATION_ERROR", CHECK_THE_FIELDS),
      new ApiError(404, "COMPETITION_NOT_FOUND", "Competition not found.", { competitionId: "Not found." }),
      new ApiError(0, "NETWORK_ERROR", "Couldn't reach the server."),
      new Error("offline"),
      null,
    ]) {
      expect(isInvalidCompetitionLink(error)).toBe(false);
    }
  });
});

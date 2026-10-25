import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { Gym } from "../src/models/Gym.js";
import { GymAdminRequest } from "../src/models/GymAdminRequest.js";
import { User } from "../src/models/User.js";
import { createAdminRoutes } from "../src/routes/adminRoutes.js";
import { createGym } from "../src/services/gymService.js";
import { AppError } from "../src/utils/AppError.js";
import { backgroundTasksDone } from "../src/utils/backgroundTasks.js";
import { logger } from "../src/utils/logger.js";
import "../src/config/database.js";

vi.mock("../src/services/gymService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  createGym: vi.fn(),
}));

const REQUEST_ID = "6a0b1c2d3e4f5a6b7c8d9e01";
const GYM_ID = "6a0b1c2d3e4f5a6b7c8d9e02";
const ADMIN_ID = "6a0b1c2d3e4f5a6b7c8d9e03";
const AUTHORIZATION = "Bearer a.b.c";
const SUBMITTED_AT = new Date("2026-10-20T14:00:00.000Z");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const CONTACT = {
  firstName: "Avery",
  lastName: "Chen",
  email: "avery@example.com",
  phone: "416 555 0101",
};
const GYM = {
  _id: GYM_ID,
  name: "Hogtown Boulders",
  location: "640 Queen St W, Toronto",
  status: "ACTIVE",
};

function pendingNewGym(overrides = {}) {
  return {
    _id: REQUEST_ID,
    requestType: "NEW_GYM",
    status: "PENDING",
    submittedAt: SUBMITTED_AT,
    contact: CONTACT,
    proposedGym: { name: "Junction Rock West", location: "1 Sterling Rd, Toronto" },
    ...overrides,
  };
}

function pendingExistingGym(overrides = {}) {
  return {
    _id: REQUEST_ID,
    requestType: "EXISTING_GYM",
    status: "PENDING",
    submittedAt: SUBMITTED_AT,
    contact: CONTACT,
    gymId: GYM_ID,
    ...overrides,
  };
}

/** A request saved before contact details were collected. */
function withoutContact(overrides = {}) {
  const { contact: _contact, ...rest } = pendingExistingGym(overrides);
  return rest;
}

function rejected(overrides = {}) {
  return pendingExistingGym({
    status: "REJECTED",
    reviewedBy: ADMIN_ID,
    reviewedAt: new Date("2026-10-21T15:00:00.000Z"),
    ...overrides,
  });
}

function approved(overrides = {}) {
  return pendingExistingGym({
    status: "APPROVED",
    reviewedBy: ADMIN_ID,
    reviewedAt: new Date("2026-10-21T15:00:00.000Z"),
    setupLinkExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

function lean(value) {
  const query = {
    collation: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn(async () => value),
  };
  return query;
}

/** Gym.exists(...).collation(...) resolves to the found ID or null. */
function existsQuery(value) {
  return { collation: vi.fn(async () => value) };
}

function makeApp({ mailer = null } = {}) {
  const auth = {
    accessTokens: {
      verify: vi.fn(async () => ({
        userId: ADMIN_ID,
        role: "ADMIN",
        sessionId: "session-id",
      })),
    },
    sessions: {
      findActive: vi.fn(async () => ({})),
      recordRequest: vi.fn(async () => ({})),
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin",
    createAdminRoutes({ auth, mailer, appUrl: "http://localhost:5173" }),
  );
  app.use(errorHandler);
  return app;
}

function requestsInStore(...documents) {
  const findById = vi.spyOn(GymAdminRequest, "findById");
  for (const document of documents) findById.mockReturnValueOnce(lean(document));
  return findById;
}

beforeEach(() => {
  vi.spyOn(logger, "info").mockImplementation(() => {});
  vi.spyOn(logger, "warn").mockImplementation(() => {});
  vi.spyOn(logger, "error").mockImplementation(() => {});
  vi.spyOn(Gym, "findById").mockReturnValue(lean(GYM));
  vi.spyOn(User, "findById").mockReturnValue(
    lean({ _id: ADMIN_ID, firstName: "Sam", lastName: "Admin", email: "sam@example.com" }),
  );
  vi.spyOn(User, "exists").mockResolvedValue(null);
  vi.spyOn(Gym, "exists").mockReturnValue(existsQuery(null));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(createGym).mockReset();
});

describe("GET /api/admin/gym-requests/:requestId", () => {
  it("flags a pending request without contact details and lets it be deleted", async () => {
    requestsInStore(withoutContact());

    const response = await request(makeApp())
      .get(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(response.body.checks).toMatchObject({
      contactMissing: true,
      emailHasAccount: false,
    });
    expect(response.body.deletable).toBe(true);
    expect(User.exists).not.toHaveBeenCalled();
  });

  it("says when a pending request is deleted automatically, 30 days after it was sent", async () => {
    requestsInStore(pendingNewGym());

    const response = await request(makeApp())
      .get(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(response.body.checks.contactMissing).toBe(false);
    expect(response.body.deletable).toBe(false);
    expect(response.body.expiresAt).toBe(
      new Date(SUBMITTED_AT.getTime() + THIRTY_DAYS_MS).toISOString(),
    );
  });

  it("lets a rejected request be deleted, but never an approved one", async () => {
    requestsInStore(rejected(), approved());
    const app = makeApp();

    const rejectedResponse = await request(app)
      .get(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);
    const approvedResponse = await request(app)
      .get(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(rejectedResponse.body).toMatchObject({ deletable: true, expiresAt: null });
    expect(approvedResponse.body).toMatchObject({ deletable: false, expiresAt: null });
  });
});

describe("PATCH /api/admin/gym-requests/:requestId/review", () => {
  it.each([
    ["APPROVE", "approved"],
    ["REJECT", "rejected"],
  ])("refuses to %s a request without contact details before saving anything", async (decision, word) => {
    requestsInStore(withoutContact());
    const claim = vi.spyOn(GymAdminRequest, "findOneAndUpdate");

    const response = await request(makeApp())
      .patch(`/api/admin/gym-requests/${REQUEST_ID}/review`)
      .set("Authorization", AUTHORIZATION)
      .send({ decision });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "GYM_REQUEST_INCOMPLETE",
      message: `This request has no contact details, so it can't be ${word}. Delete it instead.`,
    });
    expect(claim).not.toHaveBeenCalled();
    expect(createGym).not.toHaveBeenCalled();
  });

  it("approves a new-gym request, registers the gym as active and makes a 7-day setup link", async () => {
    const submitted = pendingNewGym();
    requestsInStore(submitted, approved({ requestType: "NEW_GYM", proposedGym: submitted.proposedGym }));
    const claim = vi
      .spyOn(GymAdminRequest, "findOneAndUpdate")
      .mockReturnValue(lean(approved()));
    const updateOne = vi.spyOn(GymAdminRequest, "updateOne");
    vi.mocked(createGym).mockResolvedValue(GYM);

    const response = await request(makeApp())
      .patch(`/api/admin/gym-requests/${REQUEST_ID}/review`)
      .set("Authorization", AUTHORIZATION)
      .send({ decision: "APPROVE" });

    expect(response.status).toBe(200);
    expect(response.body.emailSent).toBe(false);
    const [filter, update] = claim.mock.calls[0];
    expect(filter).toEqual({ _id: REQUEST_ID, status: "PENDING" });
    expect(update.$set).toMatchObject({ status: "APPROVED", reviewedBy: ADMIN_ID });
    expect(update.$set.setupTokenHash).toMatch(/^[0-9a-f]{64}$/);
    const linkLifetime = update.$set.setupLinkExpiresAt - update.$set.reviewedAt;
    expect(Math.abs(linkLifetime - 7 * 24 * 60 * 60 * 1000)).toBeLessThan(1000);
    const [details, options] = vi.mocked(createGym).mock.calls[0];
    expect(details).toEqual({
      name: "Junction Rock West",
      location: "1 Sterling Rd, Toronto",
      status: "ACTIVE",
    });
    expect(String(options.gymId)).toMatch(/^[0-9a-f]{24}$/);
    expect(String(update.$set.gymId)).toBe(String(options.gymId));
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("keeps the gym's ID off an existing-gym approval, which already has its gym", async () => {
    requestsInStore(pendingExistingGym(), approved());
    const claim = vi
      .spyOn(GymAdminRequest, "findOneAndUpdate")
      .mockReturnValue(lean(approved()));

    const response = await request(makeApp())
      .patch(`/api/admin/gym-requests/${REQUEST_ID}/review`)
      .set("Authorization", AUTHORIZATION)
      .send({ decision: "APPROVE" });

    expect(response.status).toBe(200);
    expect(claim.mock.calls[0][1].$set).not.toHaveProperty("gymId");
    expect(createGym).not.toHaveBeenCalled();
  });

  it.each([
    ["the same gym was registered at the same moment", "GYM_EXISTS"],
    ["the database fails", null],
  ])("puts a new-gym request back to pending, without a gym, when %s", async (_label, code) => {
    requestsInStore(pendingNewGym());
    const writes = vi
      .spyOn(GymAdminRequest, "findOneAndUpdate")
      .mockReturnValue(lean(approved({ requestType: "NEW_GYM" })));
    vi.mocked(createGym).mockRejectedValue(
      code ? new AppError(409, code, "Gym exists.") : new Error("connection reset"),
    );

    const response = await request(makeApp())
      .patch(`/api/admin/gym-requests/${REQUEST_ID}/review`)
      .set("Authorization", AUTHORIZATION)
      .send({ decision: "APPROVE" });

    expect(response.status).toBe(code ? 409 : 500);
    if (code) expect(response.body.error).toBe("GYM_EXISTS");
    expect(writes).toHaveBeenCalledTimes(2);
    const [, approval] = writes.mock.calls[0];
    const [undoFilter, undo] = writes.mock.calls[1];
    expect(undoFilter).toEqual({
      _id: REQUEST_ID,
      status: "APPROVED",
      reviewedAt: approval.$set.reviewedAt,
    });
    expect(undo).toEqual({
      $set: { status: "PENDING" },
      $unset: { reviewedBy: 1, reviewedAt: 1, setupTokenHash: 1, setupLinkExpiresAt: 1, gymId: 1 },
    });
  });

  it("rejects a request and names it in the log when its email fails", async () => {
    requestsInStore(pendingExistingGym(), rejected());
    vi.spyOn(GymAdminRequest, "findOneAndUpdate").mockReturnValue(lean(rejected()));
    const mailer = { send: vi.fn(async () => { throw new Error("SMTP refused"); }) };

    const response = await request(makeApp({ mailer }))
      .patch(`/api/admin/gym-requests/${REQUEST_ID}/review`)
      .set("Authorization", AUTHORIZATION)
      .send({ decision: "REJECT", reason: "We couldn't confirm your role at the gym." });
    await backgroundTasksDone();

    expect(response.status).toBe(200);
    expect(response.body.emailSent).toBe(true);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "avery@example.com" }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Gym request email failed",
      expect.objectContaining({ gymRequestId: REQUEST_ID, error: "SMTP refused" }),
    );
  });

  it("names the request in the log when email is off", async () => {
    requestsInStore(pendingExistingGym(), rejected());
    vi.spyOn(GymAdminRequest, "findOneAndUpdate").mockReturnValue(lean(rejected()));

    const response = await request(makeApp())
      .patch(`/api/admin/gym-requests/${REQUEST_ID}/review`)
      .set("Authorization", AUTHORIZATION)
      .send({ decision: "REJECT" });

    expect(response.body.message).toBe(
      "Request rejected. Email is off, so the applicant wasn't told.",
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Gym request email not sent: email is off",
      expect.objectContaining({ gymRequestId: REQUEST_ID }),
    );
  });
});

describe("POST /api/admin/gym-requests/:requestId/setup-link", () => {
  it("refuses an approved request without contact details, since there's no one to email", async () => {
    requestsInStore(withoutContact({ status: "APPROVED" }));
    const renew = vi.spyOn(GymAdminRequest, "findOneAndUpdate");

    const response = await request(makeApp())
      .post(`/api/admin/gym-requests/${REQUEST_ID}/setup-link`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "GYM_REQUEST_INCOMPLETE",
      message: "This request has no contact details, so there's no email to send a setup link to.",
    });
    expect(renew).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/gym-requests/:requestId", () => {
  it("deletes a rejected request", async () => {
    requestsInStore(rejected());
    const remove = vi
      .spyOn(GymAdminRequest, "deleteOne")
      .mockResolvedValue({ deletedCount: 1 });

    const response = await request(makeApp())
      .delete(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Request deleted." });
    expect(remove).toHaveBeenCalledWith({ _id: REQUEST_ID, status: "REJECTED" });
    expect(logger.info).toHaveBeenCalledWith(
      "Gym request deleted",
      { gymRequestId: REQUEST_ID, status: "REJECTED", deletedBy: ADMIN_ID },
    );
  });

  it("deletes a pending request without contact details", async () => {
    requestsInStore(withoutContact());
    const remove = vi
      .spyOn(GymAdminRequest, "deleteOne")
      .mockResolvedValue({ deletedCount: 1 });

    const response = await request(makeApp())
      .delete(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith({ _id: REQUEST_ID, status: "PENDING" });
  });

  it.each([
    ["a pending request that can still be reviewed", pendingNewGym()],
    ["an approved request", approved()],
  ])("keeps %s", async (_label, document) => {
    requestsInStore(document);
    const remove = vi.spyOn(GymAdminRequest, "deleteOne");

    const response = await request(makeApp())
      .delete(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "GYM_REQUEST_NOT_DELETABLE",
      message: "Only rejected requests, and pending requests without contact details, can be deleted.",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("answers 404 for a request that doesn't exist", async () => {
    requestsInStore(null);

    const response = await request(makeApp())
      .delete(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("GYM_REQUEST_NOT_FOUND");
  });

  it("answers 404 when the request was deleted at the same moment", async () => {
    requestsInStore(rejected(), null);
    vi.spyOn(GymAdminRequest, "deleteOne").mockResolvedValue({ deletedCount: 0 });

    const response = await request(makeApp())
      .delete(`/api/admin/gym-requests/${REQUEST_ID}`)
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(404);
  });

  it("refuses an ID that isn't valid", async () => {
    const response = await request(makeApp())
      .delete("/api/admin/gym-requests/not-an-id")
      .set("Authorization", AUTHORIZATION);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });
});

describe("Pending gym requests", () => {
  it("are deleted automatically 30 days after they were sent, while reviewed ones stay", () => {
    const expiry = GymAdminRequest.schema
      .indexes()
      .find(([keys, options]) => keys.submittedAt === 1 && options.expireAfterSeconds);

    expect(expiry).toEqual([
      { submittedAt: 1 },
      expect.objectContaining({
        expireAfterSeconds: THIRTY_DAYS_MS / 1000,
        partialFilterExpression: { status: "PENDING" },
      }),
    ]);
  });
});

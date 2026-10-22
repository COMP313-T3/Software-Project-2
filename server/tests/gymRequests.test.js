import { createHash } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { Gym } from "../src/models/Gym.js";
import { GymAdminRequest } from "../src/models/GymAdminRequest.js";
import { User } from "../src/models/User.js";
import { assignGymAdmin } from "../src/services/gymAdminService.js";
import { verifyPassword } from "../src/services/passwordService.js";
import { logger } from "../src/utils/logger.js";

vi.mock("../src/services/gymAdminService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  assignGymAdmin: vi.fn(),
}));

const SECRET_KEY = "secret-key-for-tests";
const ORIGIN = "http://localhost:5173";
const REQUEST_ID = "6a0b1c2d3e4f5a6b7c8d9e11";
const GYM_ID = "6a0b1c2d3e4f5a6b7c8d9e12";
const USER_ID = "6a0b1c2d3e4f5a6b7c8d9e13";
const TOKEN = "token-from-the-approval-email";
const PASSWORD = "Crimp hard 2 the top";
const CONTACT = {
  firstName: "Avery",
  lastName: "Chen",
  email: "avery@example.com",
  phone: "416 555 0101",
};
const GYM = { _id: GYM_ID, name: "Hogtown Boulders", location: "640 Queen St W, Toronto", status: "ACTIVE" };

function lean(value) {
  const query = {
    collation: vi.fn(() => query),
    select: vi.fn(() => query),
    lean: vi.fn(async () => value),
  };
  return query;
}

function makeApp() {
  return createApp({ clientOrigins: [ORIGIN], recaptchaSecretKey: SECRET_KEY });
}

function googleAnswers(verdict) {
  const fetchMock = vi.fn(async () => Response.json(verdict));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function approvedRequest(overrides = {}) {
  return {
    _id: REQUEST_ID,
    requestType: "EXISTING_GYM",
    status: "APPROVED",
    contact: CONTACT,
    gymId: GYM_ID,
    setupLinkExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function newGymBody(overrides = {}) {
  return {
    requestType: "NEW_GYM",
    firstName: "Avery",
    lastName: "Chen",
    email: "Avery@Example.com",
    phone: "416 555 0101",
    gymName: "Junction Rock West",
    gymLocation: "1 Sterling Rd, Toronto",
    recaptchaToken: "token-from-the-browser",
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(logger, "info").mockImplementation(() => {});
  vi.spyOn(logger, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(assignGymAdmin).mockReset();
});

describe("POST /api/gym-requests", () => {
  it("saves a new-gym request as pending with the applicant's contact details", async () => {
    googleAnswers({ success: true });
    vi.spyOn(User, "exists").mockResolvedValue(null);
    vi.spyOn(GymAdminRequest, "exists").mockResolvedValue(null);
    vi.spyOn(Gym, "exists").mockReturnValue({ collation: vi.fn(async () => null) });
    const create = vi.spyOn(GymAdminRequest, "create").mockImplementation(async (details) => {
      const saved = new GymAdminRequest(details);
      await saved.validate();
      return saved;
    });

    const response = await request(makeApp())
      .post("/api/gym-requests")
      .set("Origin", ORIGIN)
      .send(newGymBody());

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      requestType: "NEW_GYM",
      status: "PENDING",
      contact: { firstName: "Avery", lastName: "Chen", email: "avery@example.com" },
      gym: { name: "Junction Rock West", location: "1 Sterling Rd, Toronto" },
    });
    const saved = create.mock.calls[0][0];
    expect(saved.status).toBe("PENDING");
    expect(saved.proposedGym).toEqual({ name: "Junction Rock West", location: "1 Sterling Rd, Toronto" });
    expect(saved.contact.email).toBe("avery@example.com");
  });

  it("refuses an email that already has a request waiting for review", async () => {
    googleAnswers({ success: true });
    vi.spyOn(User, "exists").mockResolvedValue(null);
    vi.spyOn(GymAdminRequest, "exists")
      .mockResolvedValueOnce({ _id: REQUEST_ID })
      .mockResolvedValueOnce(null);
    const create = vi.spyOn(GymAdminRequest, "create");

    const response = await request(makeApp())
      .post("/api/gym-requests")
      .set("Origin", ORIGIN)
      .send(newGymBody());

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("REQUEST_PENDING");
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses an email that already has a TopSend account", async () => {
    googleAnswers({ success: true });
    vi.spyOn(User, "exists").mockResolvedValue({ _id: USER_ID });
    vi.spyOn(GymAdminRequest, "exists").mockResolvedValue(null);

    const response = await request(makeApp())
      .post("/api/gym-requests")
      .set("Origin", ORIGIN)
      .send(newGymBody());

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("EMAIL_TAKEN");
  });

  it("blocks a request that filled in the hidden website field, with a message about the request", async () => {
    const fetchMock = googleAnswers({ success: true });
    const create = vi.spyOn(GymAdminRequest, "create");

    const response = await request(makeApp())
      .post("/api/gym-requests")
      .set("Origin", ORIGIN)
      .send(newGymBody({ website: "https://spam.example" }));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "GYM_REQUEST_REJECTED",
      message: "We couldn't send your request. Refresh the page and try again.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "Gym request blocked by the honeypot field",
      expect.any(Object),
    );
  });
});

describe("POST /api/gym-requests/setup/check", () => {
  it("says whose account a working link sets up, and for which gym", async () => {
    const findOne = vi
      .spyOn(GymAdminRequest, "findOne")
      .mockReturnValue(lean(approvedRequest()));
    vi.spyOn(Gym, "findById").mockReturnValue(lean(GYM));

    const response = await request(makeApp())
      .post("/api/gym-requests/setup/check")
      .set("Origin", ORIGIN)
      .send({ token: TOKEN });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      firstName: "Avery",
      lastName: "Chen",
      email: "avery@example.com",
      gym: { name: "Hogtown Boulders", location: "640 Queen St W, Toronto" },
    });
    expect(findOne).toHaveBeenCalledWith({
      setupTokenHash: createHash("sha256").update(TOKEN).digest("hex"),
      status: "APPROVED",
    });
  });

  it.each([
    ["an unknown link", null],
    ["an expired link", approvedRequest({ setupLinkExpiresAt: new Date("2020-01-01T00:00:00.000Z") })],
    ["a link already used", approvedRequest({ setupCompletedAt: new Date(), userId: USER_ID })],
  ])("refuses %s", async (_label, document) => {
    vi.spyOn(GymAdminRequest, "findOne").mockReturnValue(lean(document));

    const response = await request(makeApp())
      .post("/api/gym-requests/setup/check")
      .set("Origin", ORIGIN)
      .send({ token: TOKEN });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "SETUP_LINK_INVALID",
      message: "This setup link has expired or was already used. Contact TopSend to get a new one.",
    });
  });

  it("refuses a link without a token", async () => {
    const response = await request(makeApp())
      .post("/api/gym-requests/setup/check")
      .set("Origin", ORIGIN)
      .send({ token: "" });

    expect(response.status).toBe(400);
    expect(response.body.fields.token).toBe("Open the setup link from your email again.");
  });
});

describe("POST /api/gym-requests/setup", () => {
  function linkWorks() {
    vi.spyOn(GymAdminRequest, "findOne").mockReturnValue(lean(approvedRequest()));
  }

  it("creates the Gym Administrator account, uses up the link and assigns the gym", async () => {
    linkWorks();
    vi.spyOn(User, "exists").mockResolvedValue(null);
    const create = vi.spyOn(User, "create").mockImplementation(async (details) => {
      const user = new User({ _id: USER_ID, ...details });
      await user.validate();
      return user;
    });
    const claim = vi
      .spyOn(GymAdminRequest, "findOneAndUpdate")
      .mockReturnValue(lean(approvedRequest({ userId: USER_ID, setupCompletedAt: new Date() })));
    vi.mocked(assignGymAdmin).mockResolvedValue(GYM);

    const response = await request(makeApp())
      .post("/api/gym-requests/setup")
      .set("Origin", ORIGIN)
      .send({ token: TOKEN, password: PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      status: "ACCOUNT_CREATED",
      user: { email: "avery@example.com", role: "GYM_ADMIN", isActive: true },
      gym: { name: "Hogtown Boulders" },
    });
    const details = create.mock.calls[0][0];
    expect(details).toMatchObject({ ...CONTACT, role: "GYM_ADMIN", isActive: true });
    expect(await verifyPassword(details.passwordHash, PASSWORD)).toBe(true);
    const [, update] = claim.mock.calls[0];
    expect(update.$unset).toEqual({ setupTokenHash: 1, setupLinkExpiresAt: 1 });
    expect(assignGymAdmin).toHaveBeenCalledWith(GYM_ID, USER_ID);
  });

  it("refuses an email that got a TopSend account since the approval, without creating one", async () => {
    linkWorks();
    vi.spyOn(User, "exists").mockResolvedValue({ _id: USER_ID });
    const create = vi.spyOn(User, "create");

    const response = await request(makeApp())
      .post("/api/gym-requests/setup")
      .set("Origin", ORIGIN)
      .send({ token: TOKEN, password: PASSWORD });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("EMAIL_TAKEN");
    expect(create).not.toHaveBeenCalled();
  });

  it("removes the new account again when the link was used at the same moment", async () => {
    linkWorks();
    vi.spyOn(User, "exists").mockResolvedValue(null);
    vi.spyOn(User, "create").mockImplementation(async (details) => new User({ _id: USER_ID, ...details }));
    vi.spyOn(GymAdminRequest, "findOneAndUpdate").mockReturnValue(lean(null));
    const remove = vi.spyOn(User, "deleteOne").mockResolvedValue({ deletedCount: 1 });

    const response = await request(makeApp())
      .post("/api/gym-requests/setup")
      .set("Origin", ORIGIN)
      .send({ token: TOKEN, password: PASSWORD });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("SETUP_LINK_INVALID");
    expect(remove).toHaveBeenCalledWith({ _id: expect.anything() });
    expect(assignGymAdmin).not.toHaveBeenCalled();
  });

  it("checks the password with the sign-up rules", async () => {
    const response = await request(makeApp())
      .post("/api/gym-requests/setup")
      .set("Origin", ORIGIN)
      .send({ token: TOKEN, password: "alllowercase1" });

    expect(response.status).toBe(400);
    expect(response.body.fields.password).toBe("Add an uppercase letter.");
  });
});

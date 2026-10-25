import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailer, terminalMailer } from "../src/services/mailService.js";

const transport = vi.hoisted(() => ({
  options: null,
  sendMail: vi.fn(async () => ({ messageId: "id" })),
  verify: vi.fn(async () => true),
}));

vi.mock("nodemailer", () => ({
  createTransport: (options) => {
    transport.options = options;
    return { sendMail: transport.sendMail, verify: transport.verify };
  },
}));

const SMTP = {
  host: "smtp.gmail.com",
  port: 465,
  user: "topsend@example.com",
  pass: "app-password",
};
const MESSAGE = {
  to: "jordan@example.com",
  subject: "Reset your TopSend password",
  text: "Open this link:\n\nhttp://localhost:5173/reset-password?token=abc",
};

afterEach(() => {
  vi.restoreAllMocks();
  transport.sendMail.mockClear();
});

describe("createMailer", () => {
  it("sends through SMTP over TLS from the configured address", async () => {
    const mailer = createMailer({
      smtp: SMTP,
      mailFrom: "TopSend <topsend@example.com>",
      nodeEnv: "production",
    });

    await mailer.send(MESSAGE);

    expect(transport.options).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "topsend@example.com", pass: "app-password" },
    });
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: "TopSend <topsend@example.com>",
      ...MESSAGE,
    });
  });

  it("requires STARTTLS on other ports, so the password never goes out unencrypted", () => {
    createMailer({
      smtp: { ...SMTP, port: 587 },
      mailFrom: "",
      nodeEnv: "development",
    });

    expect(transport.options).toMatchObject({
      secure: false,
      requireTLS: true,
    });
  });

  it("prints emails in the terminal during development while SMTP isn't set up", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mailer = createMailer({
      smtp: null,
      mailFrom: "",
      nodeEnv: "development",
    });

    await mailer.send(MESSAGE);

    expect(mailer).toBe(terminalMailer);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("http://localhost:5173/reset-password?token=abc"),
    );
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("turns email off outside development while SMTP isn't set up, so links never reach a host's logs", () => {
    for (const nodeEnv of ["production", "test"]) {
      expect(createMailer({ smtp: null, mailFrom: "", nodeEnv })).toBeNull();
    }
  });
});

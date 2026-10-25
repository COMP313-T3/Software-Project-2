import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "../constants/accountLimits.js";
import { emailAddress, required, tooLong } from "./accountFields.js";

const MAX_IDLE_SECONDS = 7 * 24 * 60 * 60;
const IDLE_MESSAGE = "Send the seconds since the last activity, from 0.";

/**
 * Body of POST /api/auth/login. The email is trimmed and lowercased. The password is never
 * trimmed, and isn't checked against the sign-up rules, so a failed login says nothing about them.
 */
export const loginSchema = z.object({
  email: emailAddress,
  password: z
    .string(required("password"))
    .min(1, required("password"))
    .max(PASSWORD_MAX_LENGTH, tooLong(PASSWORD_MAX_LENGTH)),
});

/** Body of POST /api/session/ping: how many seconds ago the user was last active. */
export const pingSchema = z.object({
  idleSeconds: z
    .number({ error: IDLE_MESSAGE })
    .int({ error: IDLE_MESSAGE })
    .min(0, { error: IDLE_MESSAGE })
    .max(MAX_IDLE_SECONDS, { error: IDLE_MESSAGE })
    .default(0),
});

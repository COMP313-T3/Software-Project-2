import { z } from "zod";
import { emailAddress, newPassword } from "./accountFields.js";

const LINK_MESSAGE = "Open the link from your email again.";
const TOKEN_MAX_LENGTH = 128;

const token = z
  .string({ error: LINK_MESSAGE })
  .min(1, { error: LINK_MESSAGE })
  .max(TOKEN_MAX_LENGTH, { error: LINK_MESSAGE });

/** Body of POST /api/auth/forgot-password. The email is trimmed and lowercased. */
export const forgotPasswordSchema = z.object({ email: emailAddress });

/** Body of POST /api/auth/reset-password/check. */
export const resetLinkSchema = z.object({ token });

/** Body of POST /api/auth/reset-password. The new password follows the sign-up rules. */
export const resetPasswordSchema = z.object({ token, password: newPassword });

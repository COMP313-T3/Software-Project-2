import { errors, jwtVerify, SignJWT } from "jose";
import { AppError } from "../utils/AppError.js";
import { notLoggedIn } from "./sessionService.js";

/** How long an access token works. The client asks for a new one with the refresh cookie. */
export const ACCESS_TOKEN_MINUTES = 15;

const ALGORITHM = "HS256";
const ISSUER = "topsend-api";
const AUDIENCE = "topsend-web";
const OBJECT_ID = /^[a-f\d]{24}$/;

function tokenExpired() {
  return new AppError(401, "TOKEN_EXPIRED", "Your login needs refreshing.");
}

/**
 * Builds the signer and checker for access tokens: short-lived JWTs, sent in the Authorization
 * header and kept only in the browser's memory. Each one names its user, their role, and the
 * login session it belongs to.
 *
 * @param {Uint8Array} key The HMAC key tokens are signed with.
 * @returns The functions sign and verify.
 */
export function createAccessTokens(key) {
  return {
    /**
     * Signs an access token.
     *
     * @param {{ userId: string, role: string, sessionId: string }} claims Who the token is for.
     * @returns {Promise<{ token: string, expiresAt: Date }>} The token and when it stops working.
     */
    async sign({ userId, role, sessionId }) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + ACCESS_TOKEN_MINUTES * 60;
      const token = await new SignJWT({ role, sid: sessionId })
        .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(key);
      return { token, expiresAt: new Date(expiresAt * 1000) };
    },

    /**
     * Checks an access token's signature, issuer, audience, and expiry.
     *
     * @param {string} token The token from the Authorization header.
     * @returns {Promise<{ userId: string, role: string, sessionId: string }>} Who it's for.
     * @throws {AppError} 401 TOKEN_EXPIRED when it ran out, or 401 NOT_AUTHENTICATED when it isn't
     *   a token this API signed.
     */
    async verify(token) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, key, {
          algorithms: [ALGORITHM],
          issuer: ISSUER,
          audience: AUDIENCE,
        }));
      } catch (error) {
        throw error instanceof errors.JWTExpired
          ? tokenExpired()
          : notLoggedIn();
      }
      const { sub, sid, role } = payload;
      if (
        typeof sub !== "string" ||
        typeof sid !== "string" ||
        typeof role !== "string" ||
        !OBJECT_ID.test(sub) ||
        !OBJECT_ID.test(sid)
      ) {
        throw notLoggedIn();
      }
      return { userId: sub, role, sessionId: sid };
    },
  };
}

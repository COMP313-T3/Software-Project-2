/**
 * Builds the keep-alive handler.
 *
 * @param {ReturnType<typeof import("../config/auth.js").createAuthContext>} auth The login setup.
 * @returns {{ ping: import("express").RequestHandler }} The handler.
 */
export function createSessionHandlers({ sessions }) {
  return {
    /**
     * Records the user's last activity, idleSeconds ago, and answers { expiresIn, limitReached }.
     * Reporting the real idle time means checking on the session, such as when a tab comes back
     * into view, never makes it last longer than the user's activity allows.
     */
    async ping(req, res) {
      const activeAt = new Date(Date.now() - req.body.idleSeconds * 1000);
      res.json(await sessions.recordActivity(req.auth.session, activeAt));
    },
  };
}

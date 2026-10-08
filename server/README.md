# TopSend API

Express API for TopSend, storing data in MongoDB through Mongoose. Use Node.js 24 LTS.

## Setup

1. Install packages: `npm install`
2. Copy `.env.example` to `.env`, then set `MONGODB_URI` to your connection string. Put the database name right before the `?`, for example `...mongodb.net/topsend?appName=...`.
3. Start the API: `npm run dev`

When it starts, the API logs the name of the database it connected to, so you can confirm it's the one you expect. Visit http://localhost:4000/api/health to check that it's running and connected.

## Gym management

All `/api/gyms` endpoints require an authenticated `ADMIN` account. `GET /api/gyms/:gymId` returns one gym and its assigned Gym Administrators. `PATCH /api/gyms/:gymId` accepts `name` and/or `location` and updates only that gym; a duplicate name/location pair returns `409 GYM_EXISTS`. `PATCH /api/gyms/:gymId/deactivate` sets that gym's status to `INACTIVE` while retaining the gym record and administrator assignments.

While `RECAPTCHA_SECRET_KEY` is empty, sign-up uses Google's reCAPTCHA test key, which passes every check, and the API logs a warning saying so. Production refuses to start without the real key.

`GET /api/geocode/place?id=...` and `GET /api/geocode/location?lat=...&lng=...` look up the address of a picked suggestion or a map pin for the sign-up form, with Google's Geocoding API v4. Google says to call that API from a server, so its key, `GOOGLE_MAPS_SERVER_KEY`, stays here. In development it can be the same Maps Demo Key as the client's `VITE_GOOGLE_MAPS_API_KEY`. While it's empty, the lookups answer 503 and the API logs a warning at startup.

`POST /api/auth/forgot-password`, `POST /api/auth/reset-password/check`, and `POST /api/auth/reset-password` handle Forgot password. Asking for a link always answers 202, whether or not the email has an account, and the email goes out after the answer, so the timing doesn't tell either. A link works once, within 1 hour, and only a SHA-256 hash of its token is stored, in the `passwordresettokens` collection, which MongoDB empties of expired links on its own. Using a link deletes every link of that account. Links start with `APP_URL`, never with the address the request came in on. Requests are limited to 3 per email and 30 per IP address per hour, and opening links and saving new passwords to 30 per IP address per hour.

## Logging in

`POST /api/auth/login` takes `{ email, password }` and answers `{ userId, role, token, expiresAt }`: `token` is a JWT access token that works for 15 minutes and is sent as `Authorization: Bearer <token>`. The client keeps it in memory only. Login also sets the refresh cookie, `topsend.refresh` (`__Secure-topsend.refresh` in production): HttpOnly, SameSite=Strict, sent only to `/api/auth`, holding the session's ID and a random secret. Only SHA-256 hashes are stored, of the current secret and the last five it replaced, in the `refreshtokens` collection, one document per login.

- `POST /api/auth/refresh` swaps the refresh cookie for a new one and answers a new access token. The cookie it replaced still works for 30 seconds, in case the answer never arrived (a reload can cut it off). After that, sending an old cookie ends the session, since someone else may have a copy. A cookie with a secret the session never had changes nothing, so nobody can end someone else's session by guessing its ID.
- `POST /api/auth/logout` ends the session when the cookie holds its current or a replaced secret, and always deletes the login cookies.
- `GET /api/auth/me` answers `{ userId, email, role, session: { expiresIn, limitReached } }`.
- `POST /api/session/ping` takes `{ idleSeconds }`, the seconds since the user was last active, and answers `{ expiresIn, limitReached }`. The client sends it while the user is active, at most every 5 minutes.
- `GET /api/auth/csrf` answers `{ csrfToken, sessionCookie }` and sets the CSRF cookie. Login, refresh, and log out rely on cookies, so they need that token in the `X-CSRF-Token` header (csrf-csrf's double submit cookie pattern). `sessionCookie` says whether the browser sent a refresh cookie, which the page can't see.

A login ends after `SESSION_IDLE_MINUTES` (60) without activity, and `SESSION_ABSOLUTE_HOURS` (12) after logging in. Requests made with the access token and keep-alives count as activity; refreshing doesn't. An ended session answers 401 `SESSION_EXPIRED`. To try the warning the app shows 2 minutes before the end, set `SESSION_IDLE_MINUTES=3` for a moment: it appears after 1 idle minute.

A wrong password, an email with no account, and a turned off account all answer 401 `INVALID_CREDENTIALS`, "Email or password is incorrect.", and take about as long. Each attempt is counted for its email before the password is checked, so many at once can't get past the limit. Each failed answer waits a little longer than the last, and after 10 attempts within 15 minutes the email is locked for 15 minutes (429 `LOGIN_LOCKED`, with Retry-After), whether or not it has an account. A successful login clears the count. Failed logins are also limited to 100 per IP address per 15 minutes; successful ones don't count, since a whole gym can share one address. The limits are in `DEFAULT_LOGIN_LIMITS` in `src/config/env.js`. Resetting a password ends every login of that account and lifts its lock.

Access tokens and CSRF tokens are signed with keys derived from `AUTH_SECRET`. While it's empty, development makes a random one each time the API starts; logins keep working, because the app gets a new access token with the refresh cookie, which is checked against the database. Production refuses to start without it.

Emails are sent with Nodemailer through the SMTP server in `SMTP_HOST`, signed in as `SMTP_USER` with `SMTP_PASS`. At startup the API signs in once and logs whether it worked. While `SMTP_USER` and `SMTP_PASS` are empty, development prints each email, link included, in the API's terminal instead of sending it, so the whole flow can be tested without an email account. With any other `NODE_ENV`, reset requests answer 503 instead, so links never end up in a hosted server's logs. `NODE_ENV` must be `development`, `production`, or `test`.

## Scripts

- `npm run dev`: start the API and restart it when files change
- `npm start`: start the API without watching for changes
- `npm test`: run the tests
- `npm run lint`: check the code with Oxlint

## Structure

- `src/server.js`: entry point. Loads `.env`, checks the settings, connects to MongoDB, and starts listening.
- `src/app.js`: the Express app: security headers, CORS, body size limit, routes, and error handling.
- `src/config/`: environment settings, the database connection, and `auth.js`, which builds the login setup (sessions, access tokens, CSRF protection, cookie settings) from them.
- `src/routes/`: routers. Each feature mounts its router in `src/routes/index.js`.
- `src/controllers/`: request handlers.
- `src/middleware/`: request IDs, request body and query string checks, rate limits (per IP address, or per email for reset links), sign-up protection (honeypot, reCAPTCHA), login (`requireAuth` for routes that need a login, CSRF protection, the failed login limit), the check that turns away changes sent from other sites, the 404 handler, and the error handler.
- `src/schemas/`: zod schemas for request bodies and query strings.
- `src/services/`: business logic, such as creating accounts, hashing passwords, logging in, login sessions and access tokens, resetting passwords, sending email, and looking up addresses with Google.
- `src/emails/`: the emails the API sends, each with a plain text and an HTML version.
- `src/models/`: Mongoose models.
- `src/utils/`: `AppError`, the JSON logger, and `runInBackground`, which runs work after the response is sent. The API waits for that work before it shuts down.
- `src/constants/`: shared values, such as the account roles and field limits.
- `tests/`: tests written with Vitest and Supertest. They don't need a database: tests that save data replace the model's database calls with an in-memory list.

## Errors

Every error response uses the shape from `specs/contracts/interfaces.md`:

```json
{ "error": "NOT_FOUND", "message": "The requested resource was not found." }
```

Validation errors can also include a `fields` object with a message per field. Throw `new AppError(status, code, message, fields)` from a route, and the error handler formats it. Unexpected errors return a generic message with an `errorId` that matches the server log, so internal details never reach users.

## Security defaults

- Security headers from Helmet, and no `X-Powered-By` header.
- CORS allows only the origins in `CLIENT_ORIGINS`, with cookies. Requests that change something are turned away (403 `ORIGIN_NOT_ALLOWED`) when their Origin, or their Referer without one, is another site.
- Login cookies are HttpOnly and SameSite=Strict, and Secure in production. Access tokens never touch browser storage.
- Request bodies are limited to 100 KB.
- Passwords are hashed with argon2id and never returned by the API.
- Mongoose runs with `sanitizeFilter`, which blocks NoSQL injection through query filters.
- Secrets come only from environment variables. `.env` is ignored by Git, and only `.env.example` is committed.

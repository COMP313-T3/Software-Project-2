# TopSend API

Express API for TopSend, storing data in MongoDB through Mongoose. Use Node.js 24 LTS.

## Setup

1. Install packages: `npm install`
2. Copy `.env.example` to `.env`, then set `MONGODB_URI` to your connection string. Put the database name right before the `?`, for example `...mongodb.net/topsend?appName=...`.
3. Start the API: `npm run dev`

When it starts, the API logs the name of the database it connected to, so you can confirm it's the one you expect. Visit http://localhost:4000/api/health to check that it's running and connected.

## Scripts

- `npm run dev`: start the API and restart it when files change
- `npm start`: start the API without watching for changes
- `npm test`: run the tests
- `npm run lint`: check the code with Oxlint

## Structure

- `src/server.js`: entry point. Loads `.env`, checks the settings, connects to MongoDB, and starts listening.
- `src/app.js`: the Express app: security headers, CORS, body size limit, routes, and error handling.
- `src/config/`: environment settings and the database connection.
- `src/routes/`: routers. Each feature mounts its router in `src/routes/index.js`.
- `src/controllers/`: request handlers.
- `src/middleware/`: request IDs, the 404 handler, and the error handler.
- `src/utils/`: `AppError` and the JSON logger.
- `src/constants/`: shared values, such as the account roles.
- `tests/`: tests written with Vitest and Supertest.

Add `src/models/` for Mongoose models and `src/services/` for business logic as features need them.

## Errors

Every error response uses the shape from `specs/contracts/interfaces.md`:

```json
{ "error": "NOT_FOUND", "message": "The requested resource was not found." }
```

Validation errors can also include a `fields` object with a message per field. Throw `new AppError(status, code, message, fields)` from a route, and the error handler formats it. Unexpected errors return a generic message with an `errorId` that matches the server log, so internal details never reach users.

## Security defaults

- Security headers from Helmet, and no `X-Powered-By` header.
- CORS allows only the origins in `CLIENT_ORIGINS`, with cookies.
- Request bodies are limited to 100 KB.
- Mongoose runs with `sanitizeFilter`, which blocks NoSQL injection through query filters.
- Secrets come only from environment variables. `.env` is ignored by Git, and only `.env.example` is committed.

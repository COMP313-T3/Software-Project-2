# US028 backend acceptance

Uses the existing Express, Mongoose, Zod, Vitest and Supertest dependencies. No new package or paid service is required.

## API

`POST /api/competitions/:competitionId/registrations`, authenticated `CLIMBER` only.

```json
{ "divisionId": "division ObjectId" }
```

The documented `climberId` field is also accepted when it matches the signed-in account. Identity always comes from the access token. Unknown fields cannot set a status, date or someone else's identity.

Success: `201` with `{ registrationId, status: "CONFIRMED", divisionId, competitionId }`.

Common errors:

| Status | Error | Meaning |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Invalid IDs/body, foreign or missing division, or another Climber's identity |
| 401 | NOT_AUTHENTICATED / TOKEN_EXPIRED / SESSION_EXPIRED | Login required or session/token expired |
| 403 | ROLE_FORBIDDEN | Wrong account role |
| 404 | COMPETITION_NOT_FOUND | Event missing, unpublished, cancelled, or gym inactive |
| 409 | ALREADY_REGISTERED | Any registration already exists for this Climber and event |
| 409 | REGISTRATION_CLOSED | Registration closed |
| 409 | COMPETITION_FINISHED | Calendar date is before today in Toronto |
| 409 | COMPETITION_FULL | Confirmed registrations already fill the competition |
| 503 | REGISTRATION_UNAVAILABLE | Database does not support required transactions |

The current Division model has no age/gender restrictions, per-division registration toggle or separate capacity. Eligibility checks existence and membership in the selected event. No rules are inferred from a division's name. A full competition is rejected, not automatically waitlisted. PENDING/WAITLIST records are not counted as confirmed; an existing registration is never silently upgraded.

## Concurrency and deployment

Registration requires MongoDB replica-set or sharded-cluster transactions (for example an existing Atlas cluster). A standalone MongoDB server is not sufficient. There is no read/count/insert fallback that could overbook.

The transaction first advances an internal `Competition.registrationVersion`, then checks state, division, confirmed count and inserts the registration. Actual writes to the same competition cause conflicts to be retried by Mongoose's transaction helper, including across Node processes. Failed writes roll back the version and record together. No separate seat counter or migration/backfill is needed; `$inc` also initializes the version on older competition records.

Capacity edits compare that version against the one read before counting registrations and retry a bounded number of times if a signup committed in between. Thus an administrator cannot lower capacity based on a stale count. The internal token is omitted from API presentations.

## Dedicated local MongoDB

Use a separate local port and directory. Do not point this fixture at a team database. On Windows, from the repository root:

```powershell
$demoDb = Join-Path $env:TEMP 'topsend-us028-mongo'
New-Item -ItemType Directory -Force -Path $demoDb
& 'C:\Program Files\MongoDB\Server\9.0\bin\mongod.exe' --dbpath $demoDb --port 27046 --bind_ip 127.0.0.1 --replSet topsend-us028
```

In another terminal, initialize this new replica set once, using MongoDB Shell:

```powershell
mongosh 'mongodb://127.0.0.1:27046/?directConnection=true' --eval 'rs.initiate({_id:"topsend-us028",members:[{_id:0,host:"127.0.0.1:27046"}]})'
```

If using a different MongoDB version, adapt the executable path. Wait until the replica set is PRIMARY. An existing dedicated test replica set can be used by setting the explicit `US028_DEMO_MONGODB_URI` / `REGISTRATION_TEST_MONGODB_URI` variables below to a loopback URI.

## Postman

From the repository root, start the backend demo:

```powershell
node server/scripts/us028-local-demo.js
```

It starts only on `127.0.0.1:4428`, creates a uniquely named local database, and writes an environment file under the OS temporary directory. It never reads `.env` and refuses to export credentials into the repository. Generated accounts are synthetic, mail/maps services are not used, and existing databases are not cleared.

1. Import `US028.postman_collection.json` from this directory.
2. Import the environment file whose path the script prints; select that environment.
3. Keep Postman's cookie jar enabled. Run the collection in order: CSRF, login, event details, registration, persistence, duplicate, invalid and role cases.
4. Each request has assertions in its Tests script. The bearer token is captured by Login.
5. The first registration is expected to return `201`; repeating it correctly returns `409`. For a clean collection rerun, stop/restart the demo and import its fresh environment.

The fixture includes open, closed, full, past, draft, cancelled, inactive-gym and foreign-division examples. Never commit/export generated real passwords or tokens into source control. The collection itself contains only variable placeholders.

## Automated real-database concurrency tests

From the `server` directory, with the dedicated replica set running:

```powershell
$env:REGISTRATION_TEST_MONGODB_URI='mongodb://127.0.0.1:27046/?replicaSet=topsend-us028'
npm test -- tests/eventRegistration.integration.test.js
Remove-Item Env:REGISTRATION_TEST_MONGODB_URI
```

The opt-in test refuses non-loopback hosts, creates a unique test database, and drops only that exact generated database afterward. It checks twelve concurrent requests for one seat, twelve duplicate requests by one account, rollback, visibility, role boundaries and concurrent capacity edits. A sequential Postman Collection Runner is useful for endpoint acceptance but is not proof of concurrency safety.

The normal `npm test` command runs unit/API tests and skips the real-database file unless its URI is explicitly set.

## Story boundary

US028 backend (#109 and #110) relies on existing competition/division/authentication models and US025 event details. US027 supplies the map-to-details navigation, not the registration mutation or capacity logic. Full map-to-registration/frontend acceptance is pending team integration. No Google Maps or registration UI is implemented here.

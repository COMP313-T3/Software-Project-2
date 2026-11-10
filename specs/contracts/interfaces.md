# TopSend Interfaces and API Contracts

## 1. Public Interfaces

This document defines the public boundaries for the TopSend MVP. It is derived from the user roles, functional requirements, and the competition workflow described in the source documentation. Field names follow contracts/domain.md, and Section 1.15 lists every route the API has.

Errors use one shape: `{ "error": "CODE", "message": "..." }`, plus `fields` with one message per field for validation errors, `details` with what a page needs to act on the error, such as when a competition starts, and `errorId` for unexpected server errors.

### 1.1 Authentication and role access

#### POST /api/auth/login

Request body:

```json
{
  "email": "user@example.com",
  "password": "string"
}
```

Response:

```json
{
  "userId": "string",
  "role": "ADMIN | GYM_ADMIN | CLIMBER",
  "token": "JWT access token",
  "expiresAt": "ISO-8601 timestamp"
}
```

The request needs the CSRF token from GET /api/auth/csrf in the X-CSRF-Token header. A successful login also sets the refresh cookie that POST /api/auth/refresh uses.

Errors:

```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "Email or password is incorrect."
}
```

After 10 failed attempts for one email within 15 minutes, the email is locked for 15 minutes:

```json
{
  "error": "LOGIN_LOCKED",
  "message": "Too many failed attempts. Try again in 15 minutes."
}
```

By default, a session ends after 60 minutes without activity or 12 hours after logging in, whichever comes first. Requests the user makes and POST /api/session/ping count as activity. Refreshing the access token doesn't.

#### GET /api/auth/csrf

Sets the CSRF cookie and answers the token that POST /api/auth/login, POST /api/auth/refresh, and POST /api/auth/logout need in the X-CSRF-Token header:

```json
{
  "csrfToken": "string",
  "sessionCookie": true
}
```

`sessionCookie` says whether the browser sent a refresh cookie, which the page can't read, so the client only calls POST /api/auth/refresh when there may be a login to pick up. The token is tied to the login session, so it stops working after logging in or out. A request with a missing or old token answers 403 `CSRF_INVALID`.

#### POST /api/auth/refresh

Needs the refresh cookie and the CSRF token. Swaps the refresh cookie for a new one and answers a new access token, in the same shape as POST /api/auth/login. Errors: 401 `NOT_AUTHENTICATED` without a valid refresh cookie, and 401 `SESSION_EXPIRED` when the session ended, was logged out, or its refresh cookie was already used. When the session can't go on, the login cookies are deleted.

#### POST /api/auth/logout

Needs the CSRF token. Ends the session in the refresh cookie, deletes the login cookies, and answers 204, also when there was no session, so logging out twice is fine.

#### GET /api/auth/me

Needs the access token. Answers who is logged in:

```json
{
  "userId": "string",
  "email": "user@example.com",
  "role": "ADMIN | GYM_ADMIN | CLIMBER",
  "session": { "expiresIn": 3540, "limitReached": false }
}
```

`expiresIn` is the whole seconds left in the session, and `limitReached` says whether it ends at its hard limit, 12 hours after logging in by default, so activity can't make it last longer. Errors: 401 `NOT_AUTHENTICATED` without a valid access token, 401 `TOKEN_EXPIRED` when the access token ran out, and 401 `SESSION_EXPIRED` when the session ended or the account was deactivated.

#### POST /api/session/ping

Needs the access token. The client sends it while the user is active, at most every 5 minutes, and when a tab comes back into view:

```json
{
  "idleSeconds": 0
}
```

`idleSeconds` is how long ago the user was last active, a whole number from 0 (the default) up to 7 days. The session is kept going from that moment, so a ping never makes it last longer than the user's activity allows. It answers `{ "expiresIn": 3600, "limitReached": false }`, like `session` in GET /api/auth/me, and fails like it, or with 400 `VALIDATION_ERROR` for a bad `idleSeconds`.

#### GET /api/users/me/onboarding

Needs the access token of any role. Answers whether the logged-in user has seen the onboarding tutorial (US-037):

```json
{
  "seen": false,
  "seenAt": null
}
```

`seenAt` is when they first finished or skipped it, as an ISO-8601 timestamp, or `null` while `seen` is false. The web app opens the tutorial by itself while `seen` is false. Errors: the 401 errors of GET /api/auth/me, including 401 `SESSION_EXPIRED` when the account was deactivated.

#### PUT /api/users/me/onboarding

Needs the access token of any role. Records that the logged-in user finished or skipped the onboarding tutorial (US-037):

```json
{
  "seen": true
}
```

It answers like GET. Only the first call sets `seenAt`, so sending it again, for example after watching the tutorial again from Onboarding tips, keeps the first time. The user is always the one in the access token, and nothing in the body can name another user. Errors: the GET errors, and 400 `VALIDATION_ERROR` when `seen` isn't `true`.

#### POST /api/auth/forgot-password

Request body:

```json
{
  "email": "user@example.com"
}
```

Answers 202 `{ "status": "requested" }` before the account is looked up, so the answer is the same whether or not the email has an account. An active account then gets an email with a link to /reset-password that works for 1 hour. By default, requests are limited to 3 an hour for one email and 30 an hour from one IP address (429 `TOO_MANY_REQUESTS`). While email is off, it answers 503 `EMAIL_UNAVAILABLE`.

#### POST /api/auth/reset-password/check

Request body:

```json
{
  "token": "the token from the link"
}
```

Checks a reset link before the new password is typed, and answers the email of the account it resets: `{ "email": "user@example.com" }`. Errors: 400 `RESET_LINK_INVALID` when the link is unknown, expired, or used.

#### POST /api/auth/reset-password

Request body:

```json
{
  "token": "the token from the link",
  "password": "string"
}
```

Sets the new password, which follows the sign-up password rules, and answers `{ "status": "reset" }`. A link works once: using it deletes every reset link of the account, logs the account out everywhere, and lifts a lock from failed logins. Errors: 400 `RESET_LINK_INVALID`, and 400 `VALIDATION_ERROR` with `fields` for a password that breaks the rules. This route and the link check share a limit of 30 tries an hour from one IP address by default.

### 1.2 Climber registration

#### POST /api/users/climbers

Request body:

```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "password": "string",
  "dateOfBirth": "YYYY-MM-DD",
  "gender": "MALE | FEMALE | PREFER_NOT_TO_SAY",
  "phone": "string",
  "address": "string",
  "postalCode": "string",
  "country": "ISO 3166-1 alpha-2 code",
  "location": { "lat": 43.65, "lng": -79.38 },
  "acceptedTerms": true,
  "recaptchaToken": "string"
}
```

`location` is optional. The server always creates a CLIMBER and ignores any role in the request.

Response:

```json
{
  "userId": "string",
  "status": "created",
  "role": "CLIMBER"
}
```

Errors: 409 `EMAIL_TAKEN` when the email already has an account, 400 `VALIDATION_ERROR` with `fields`, and 400 `RECAPTCHA_FAILED` or 503 `RECAPTCHA_UNAVAILABLE` from the reCAPTCHA check.

#### GET /api/geocode/place and GET /api/geocode/location

The address fields on sign-up, Add gym, and Gym details use these lookups. GET /api/geocode/place?id={placeId} looks up a place picked from the browser's address suggestions, and GET /api/geocode/location?lat={lat}&lng={lng} finds the closest address to a point picked on the map, in decimal degrees. The API asks Google's Geocoding API with its server key and answers:

```json
{
  "address": "100 Queen St W, Toronto, ON",
  "postalCode": "M5H 2N2",
  "country": "CA",
  "location": { "lat": 43.6534, "lng": -79.3841 }
}
```

Errors: 404 `ADDRESS_NOT_FOUND` when Google has no address, 503 `GEOCODING_UNAVAILABLE` when lookups aren't set up or the lookup fails, 400 `VALIDATION_ERROR` for a bad place ID or point, and 429 `TOO_MANY_REQUESTS` after 200 lookups in an hour from one IP address by default.

### 1.3 Administrator dashboard

#### GET /api/admin/dashboard

Requires a valid access token for a user with the `ADMIN` role. Returns registered gym counts
by status, platform user counts by role, and pending gym administrator requests by type.

Response:

```json
{
  "gyms": {
    "total": 12,
    "active": 9,
    "pending": 2,
    "inactive": 1
  },
  "users": {
    "total": 250,
    "admins": 2,
    "gymAdmins": 18,
    "climbers": 230
  },
  "pendingRequests": {
    "total": 3,
    "newGyms": 1,
    "existingGyms": 2
  }
}
```

### 1.4 Gyms

These routes need the access token of an ADMIN. Without a login they answer 401, and for any other role 403 `ROLE_FORBIDDEN`. A gym is answered with its map pin as `coordinates: { lat, lng }`, or `null` when it has none.

#### GET /api/gyms

Query: `status` (optional) is `PENDING`, `ACTIVE`, or `INACTIVE`. `page` starts at 1, and `limit` is from 1 to 100, 20 by default. Gyms are listed by name, ignoring case.

Response:

```json
{
  "gyms": [
    {
      "_id": "string",
      "name": "Hogtown Boulders",
      "location": "1 Bathurst St, Toronto",
      "status": "PENDING | ACTIVE | INACTIVE",
      "adminIds": ["string"],
      "coordinates": { "lat": 43.6383, "lng": -79.4006 },
      "createdAt": "ISO-8601 timestamp",
      "updatedAt": "ISO-8601 timestamp"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

#### POST /api/gyms

Request body:

```json
{
  "name": "Hogtown Boulders",
  "location": "1 Bathurst St, Toronto",
  "status": "ACTIVE",
  "coordinates": { "lat": 43.6383, "lng": -79.4006 }
}
```

- `name` (up to 100 characters) and `location` (up to 200) are required, and each must include a letter, not only numbers or symbols.
- `status` is optional and defaults to `ACTIVE`.
- `coordinates` is the optional map pin, chosen with the address search or on the map. The gym's competitions are pinned there on the Map View, and distance searches measure from it.

Response (201): the gym, shaped like one entry of the list.

Errors: 409 `GYM_EXISTS` when a gym with the same name and location is registered, ignoring case, and 400 `VALIDATION_ERROR` with `fields`.

#### GET /api/gyms/{gymId}

Response: the gym, with `adminIds` replaced by the assigned Gym Administrators, `[{ "_id", "firstName", "lastName", "email" }]`.

Errors: 404 `GYM_NOT_FOUND`, and 400 for an ID that isn't valid.

#### PATCH /api/gyms/{gymId}

Request body, with at least one of `name`, `location`, and `coordinates`. They follow the rules of a new gym, and `coordinates: null` removes the pin. Whenever `location` is sent, the gym's competitions dated today or later get it too, since a competition is held at its gym.

Response: the gym, shaped like GET /api/gyms/{gymId}.

Errors: 404 `GYM_NOT_FOUND`, 409 `GYM_EXISTS`, and 400 `VALIDATION_ERROR` with the message "Change the gym name or location." when the body has none of these fields.

#### PATCH /api/gyms/{gymId}/deactivate and PATCH /api/gyms/{gymId}/activate

Deactivating makes the gym INACTIVE, which takes its competitions out of discovery and stops its Gym Administrators from managing them. Activating makes a PENDING or INACTIVE gym ACTIVE. Response: the gym, shaped like GET /api/gyms/{gymId}.

#### GET /api/gyms/{gymId}/admin-candidates

Response: `{ "candidates": [{ "_id", "firstName", "lastName", "email" }] }`, the active GYM_ADMIN accounts with an APPROVED request for the gym that aren't assigned to it yet, by name.

#### GET /api/gyms/{gymId}/admins/{userId}

Response: an assigned Gym Administrator, `{ "_id", "firstName", "lastName", "email", "role", "isActive", "createdAt", "gyms": [{ "_id", "name", "location", "status" }] }`.

Errors: 404 `GYM_NOT_FOUND`, and 404 `GYM_ADMIN_NOT_FOUND` when the account isn't assigned to the gym.

#### PUT /api/gyms/{gymId}/admins/{userId}

Assigns a candidate to the gym (US-006). Response: the gym, shaped like GET /api/gyms/{gymId}.

### 1.5 Gym registration and Gym Administrator access requests

A Visitor who represents a climbing gym sends a request without an account (US-034). A System Administrator reviews it (US-035), and an approved applicant sets up their GYM_ADMIN account from the emailed link. The routes under /api/gym-requests need no login.

#### GET /api/gym-requests/gyms

Lists the ACTIVE registered gyms by name, up to 20, for the "existing gym" choice.

Query: `q` (optional, up to 100 characters) matches the gym's name or address, ignoring case.

Response:

```json
{
  "gyms": [{ "_id": "string", "name": "Hogtown Boulders", "location": "1 Bathurst St, Toronto" }]
}
```

#### POST /api/gym-requests

Request body for a new gym:

```json
{
  "requestType": "NEW_GYM",
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string",
  "jobTitle": "string",
  "details": "string",
  "gymName": "string",
  "gymLocation": "string",
  "recaptchaToken": "string"
}
```

- For a gym that's already on TopSend, `requestType` is `EXISTING_GYM`, and `gymId`, chosen from GET /api/gym-requests/gyms, replaces `gymName` and `gymLocation`.
- `jobTitle` (up to 100 characters) and `details` (up to 1000) are optional. The email is saved in lowercase.
- `website` is a hidden field that people never see. A request that fills it in is refused with 400 `GYM_REQUEST_REJECTED`.

Response (201):

```json
{
  "requestId": "string",
  "requestType": "NEW_GYM | EXISTING_GYM",
  "status": "PENDING",
  "submittedAt": "ISO-8601 timestamp",
  "contact": { "firstName": "string", "lastName": "string", "email": "string" },
  "gym": { "name": "string", "location": "string" },
  "message": "Your request was submitted for review.",
  "nextSteps": "string"
}
```

`gym` also has `_id` for an EXISTING_GYM request.

Errors: 409 `EMAIL_TAKEN` when the email has a TopSend account, 409 `REQUEST_PENDING` when a request from the email is waiting for review, 409 `REQUEST_APPROVED` when the email's approved request isn't set up yet, 409 `GYM_EXISTS` when a new gym is already registered at that address, 400 `VALIDATION_ERROR` with `fields` (`fields.gymId` when the chosen gym isn't an active registered gym), and the reCAPTCHA errors of POST /api/users/climbers. One network address can send 5 requests an hour, and the sixth answers 429 `TOO_MANY_REQUESTS`.

#### POST /api/gym-requests/setup/check

Checks an account setup link before the applicant chooses a password (US-035 criterion 6).

Request body: `{ "token": "string" }`, the token from the link.

Response:

```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "gym": { "name": "string", "location": "string" }
}
```

`gym` is `null` when the gym no longer exists.

Errors: 400 `SETUP_LINK_INVALID` when the link is unknown, has expired, or was already used, and 400 `VALIDATION_ERROR` with `fields.token` when the token is missing.

#### POST /api/gym-requests/setup

Creates the applicant's GYM_ADMIN account from the approved request, with the name, email, and phone it holds, and assigns the account to the gym. The link then stops working.

Request body: `{ "token": "string", "password": "string" }`. The password follows the sign-up rules.

Response (201):

```json
{
  "status": "ACCOUNT_CREATED",
  "message": "Your Gym Administrator account is ready. Log in with your email and new password.",
  "user": { "_id": "string", "firstName": "string", "lastName": "string", "email": "string", "role": "GYM_ADMIN", "isActive": true },
  "gym": { "_id": "string", "name": "string", "location": "string", "status": "ACTIVE" }
}
```

Errors: 400 `SETUP_LINK_INVALID` as above, 409 `EMAIL_TAKEN` when the email got a TopSend account since the approval, and 400 `VALIDATION_ERROR` with `fields.password`. Both setup routes share a limit of 30 tries an hour per network address.

#### GET /api/admin/gym-requests

ADMIN only, like every route under /api/admin. Lists requests for review (US-035 criterion 1).

Query: `status` is `PENDING` (the default), `APPROVED`, `REJECTED`, or `ALL`. `requestType` (optional) is `NEW_GYM` or `EXISTING_GYM`. `page` starts at 1, and `limit` is from 1 to 100, 20 by default. PENDING requests are listed oldest first, and other statuses newest first.

Response:

```json
{
  "requests": [
    {
      "_id": "string",
      "requestType": "NEW_GYM | EXISTING_GYM",
      "status": "PENDING | APPROVED | REJECTED",
      "submittedAt": "ISO-8601 timestamp",
      "reviewedAt": "ISO-8601 timestamp | null",
      "contact": { "firstName": "string", "lastName": "string", "email": "string" },
      "gym": { "_id": "string | null", "name": "string", "location": "string", "status": "PENDING | ACTIVE | INACTIVE | null" }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

`gym` is the registered gym once there is one, and otherwise the proposed gym, whose `_id` and `status` are `null`.

#### GET /api/admin/gym-requests/{requestId}

Response: one request with everything needed to review it (US-035 criterion 2):

```json
{
  "_id": "string",
  "requestType": "NEW_GYM | EXISTING_GYM",
  "status": "PENDING | APPROVED | REJECTED",
  "submittedAt": "ISO-8601 timestamp",
  "contact": { "firstName": "string", "lastName": "string", "email": "string", "phone": "string", "jobTitle": "string | null" },
  "details": "string | null",
  "proposedGym": { "name": "string", "location": "string" },
  "gym": { "_id": "string", "name": "string", "location": "string", "status": "ACTIVE" },
  "checks": { "contactMissing": false, "emailHasAccount": false, "gymAlreadyRegistered": false },
  "deletable": false,
  "expiresAt": "ISO-8601 timestamp | null",
  "review": {
    "reviewedBy": { "_id": "string", "firstName": "string", "lastName": "string", "email": "string" },
    "reviewedAt": "ISO-8601 timestamp",
    "rejectionReason": "string | null"
  },
  "accountSetup": {
    "completed": false,
    "completedAt": "ISO-8601 timestamp | null",
    "userId": "string | null",
    "linkExpiresAt": "ISO-8601 timestamp | null",
    "linkExpired": false
  }
}
```

- `proposedGym` is `null` for an EXISTING_GYM request, and `gym` is `null` until there's a registered gym.
- `checks` is only for PENDING requests and says what would stop an approval. An EXISTING_GYM request has `gymRegistered` and `gymActive` instead of `gymAlreadyRegistered`.
- `deletable` is true for a REJECTED request and for a PENDING one without contact details. `expiresAt` is when a PENDING request is deleted automatically, 30 days after it was sent, and `null` for other statuses.
- `review` is `null` while the request is PENDING, and `accountSetup` is only for APPROVED requests.

Errors: 404 `GYM_REQUEST_NOT_FOUND`, and 400 `VALIDATION_ERROR` for an ID that isn't valid.

#### PATCH /api/admin/gym-requests/{requestId}/review

Approves or rejects a PENDING request (US-035 criterion 3).

Request body: `{ "decision": "APPROVE" }`, or `{ "decision": "REJECT", "reason": "string" }`. The reason is optional, up to 500 characters, and goes in the applicant's email.

- Approving a NEW_GYM request registers the gym as ACTIVE. Either type then emails the applicant a setup link that works once, within 7 days.
- The applicant gets an email for either decision. The answer doesn't wait for the email to go out.

Response:

```json
{
  "message": "Request approved. We're emailing the applicant a link to set up their Gym Administrator account.",
  "request": {},
  "emailSent": true
}
```

`request` is shaped like GET /api/admin/gym-requests/{requestId}. `emailSent` is false when email is off on the server, and the message says so.

Errors: 409 `GYM_REQUEST_ALREADY_REVIEWED`, 409 `GYM_REQUEST_INCOMPLETE` for a request without contact details, for an approval 409 `EMAIL_TAKEN`, `GYM_EXISTS`, or `GYM_NOT_FOUND`, and 404 `GYM_REQUEST_NOT_FOUND`.

#### POST /api/admin/gym-requests/{requestId}/setup-link

Emails a new setup link to an approved applicant who hasn't set up their account, such as when the first link expired. Older links stop working, and the new one also lasts 7 days.

Response: shaped like the review answer.

Errors: 409 `GYM_REQUEST_NOT_APPROVED`, 409 `SETUP_ALREADY_COMPLETED`, 409 `GYM_REQUEST_INCOMPLETE` for a request without contact details, and 404 `GYM_REQUEST_NOT_FOUND`.

#### DELETE /api/admin/gym-requests/{requestId}

Deletes a REJECTED request, or a PENDING one without contact details, which can't be reviewed. APPROVED requests are kept, since the applicant's account and gym depend on them. Nobody is emailed.

Response: `{ "message": "Request deleted." }`

Errors: 409 `GYM_REQUEST_NOT_DELETABLE`, and 404 `GYM_REQUEST_NOT_FOUND`.

### 1.6 Gym Admin dashboard and competitions

These routes need the access token of a GYM_ADMIN assigned to at least one ACTIVE gym. Without a login they answer 401, for any other role 403 `ROLE_FORBIDDEN`, and for a Gym Admin without an active gym 403 `NO_ASSIGNED_GYM`. Every read and write is limited to the Gym Admin's active gyms, and a competition in any other gym answers 404 `COMPETITION_NOT_FOUND`.

#### GET /api/gym-admin/dashboard

The Gym Admin's gyms, competition counts, and next upcoming competitions (US-011).

Response:

```json
{
  "gyms": [{ "_id": "string", "name": "string", "location": "string" }],
  "counts": { "upcoming": 2, "past": 1, "drafts": 1 },
  "upcoming": []
}
```

`drafts` counts upcoming DRAFT competitions. `upcoming` holds up to five competitions, soonest first, shaped like the entries of GET /api/gym-admin/competitions.

#### GET /api/gym-admin/competitions

Query: `period` is `upcoming` (the default), `past`, or `all`. `gymId` (optional) narrows the list to one of the Gym Admin's gyms; another gym answers 404 `GYM_NOT_FOUND`. `page` starts at 1, and `limit` is from 1 to 100, 20 by default. Upcoming competitions come soonest first, and the others most recent first.

Response:

```json
{
  "competitions": [
    {
      "_id": "string",
      "gymId": "string",
      "name": "string",
      "date": "YYYY-MM-DD",
      "startTime": "10:00",
      "startsAt": "ISO-8601 timestamp",
      "endTime": "18:00",
      "endsAt": "ISO-8601 timestamp",
      "location": "string",
      "status": "DRAFT | PUBLISHED | CANCELLED",
      "registrationStatus": "OPEN | CLOSED",
      "capacity": 120,
      "coordinates": null,
      "gym": { "_id": "string", "name": "string" }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

- `startTime` is when the competition starts on its date, in Toronto time, as 24-hour `HH:mm`. It's `null` for a competition saved before start times existed.
- `startsAt` is that moment as a timestamp, so a browser in any time zone shows and counts down to the right moment. Without a `startTime`, it's 12:00 a.m. on the competition's date in Toronto.
- `endTime` is when the competition ends on its date, in Toronto time, as 24-hour `HH:mm`, always after `startTime`. Climbers' scoring closes then. It's `null` for a competition saved before end times existed.
- `endsAt` is that moment as a timestamp. Without an `endTime`, it's the end of the competition's date, 12:00 a.m. the next day in Toronto.
- `coordinates` is a pin saved with the competition itself, from before competitions used their gym's pin, and is `null` for new competitions.

#### POST /api/gym-admin/competitions

Request body:

```json
{
  "gymId": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
  "startTime": "10:00",
  "endTime": "18:00",
  "description": "string",
  "capacity": 120,
  "deductionPercent": 20,
  "maxAttempts": 5,
  "divisions": ["Beginner", "Youth", "Advanced"]
}
```

- `gymId` is needed only when the Gym Admin has more than one active gym, and must be one of them. One account manages one gym, so it's normally left out.
- `date` is a calendar date in Toronto, from today to two years ahead.
- `startTime` is required: when the competition starts on that date, in Toronto time, as 24-hour `HH:mm`, such as `10:00` or `18:30`. Until then, Climbers see a countdown and only their registration status (Section 1.13).
- `endTime` is required: when the competition ends on that date, in the same format, after `startTime`. Climbers record their own results until then, and see a countdown to it while the competition is on (Section 1.13).
- `description` is optional. `capacity` is a whole number from 1 to 1000.
- `deductionPercent` and `maxAttempts` are the competition's scoring, with the rules of PUT .../scoring (Section 1.9). Left out, they're 20 and 5.
- `divisions` is optional: any of `Open`, `Beginner`, `Youth`, and `Advanced`, the only division names there are. Each is saved once, as one of the competition's first divisions, and the response lists them in that order (other lists of divisions sort them by name). A division only shows who the category is meant for, and the others can be added later with POST .../divisions (Section 1.7). If the divisions can't be saved, the competition is taken back, so the request can be tried again.
- A competition is held at its gym, so it takes the gym's location, and a `location` or `coordinates` in the body is ignored.

Response (201): the new competition, as a DRAFT with registration CLOSED, shaped like GET /api/gym-admin/competitions/{competitionId} without `registeredClimberCount`, plus `divisions`, the divisions it starts with as `{ "_id": "string", "name": "string" }`, or `[]`.

Errors: 404 `GYM_NOT_FOUND` when `gymId` isn't one of the Gym Admin's active gyms, 409 `COMPETITION_EXISTS` when the gym already has a competition with that name on that date, ignoring case, and 400 `VALIDATION_ERROR` with `fields`, such as `fields.startTime` "Enter the time the competition starts." when it's missing, `fields.endTime` "Enter the time the competition ends." when it's missing, and `fields.endTime` "Choose an end time after the start time." when it isn't after `startTime`.

#### GET /api/gym-admin/competitions/{competitionId}

Response:

```json
{
  "_id": "string",
  "gymId": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
  "startTime": "10:00",
  "startsAt": "ISO-8601 timestamp",
  "endTime": "18:00",
  "endsAt": "ISO-8601 timestamp",
  "location": "string",
  "description": "string",
  "capacity": 120,
  "registrationStatus": "OPEN | CLOSED",
  "status": "DRAFT | PUBLISHED | CANCELLED",
  "createdBy": "string",
  "createdAt": "ISO-8601 timestamp",
  "updatedAt": "ISO-8601 timestamp",
  "coordinates": null,
  "gym": { "_id": "string", "name": "string" },
  "scoring": { "deductionPercent": 20, "maxAttempts": 5, "updatedBy": "string", "updatedAt": "ISO-8601 timestamp" },
  "tools": [{ "key": "details", "label": "Competition details", "story": "US-013" }],
  "registeredClimberCount": 0
}
```

- `registeredClimberCount` counts CONFIRMED registrations.
- `scoring` is `null` when the competition has no valid scoring settings, such as `{ format, flashBonus }`.
- `startTime`, `startsAt`, `endTime`, and `endsAt` are as in the list above.
- `tools` lists Competition details, Divisions and climbers (US-014), Boulder problems (US-016), Scoring format (US-018), Result entry (US-019), and Live leaderboard (US-020). The AI Route Assistant isn't a tool: it's a chatbot inside the Route statistics, Result entry, and Live leaderboard pages (Section 1.14).

#### PATCH /api/gym-admin/competitions/{competitionId}

Request body, with at least one field:

```json
{
  "name": "string",
  "date": "YYYY-MM-DD",
  "startTime": "10:00",
  "endTime": "18:00",
  "description": "string",
  "capacity": 120,
  "registrationStatus": "OPEN | CLOSED"
}
```

- The location isn't editable: it's always the gym's, and changes with it (PATCH /api/gyms/{gymId}). Saving a competition dated today or later, or moving one to a new date, also gives it the gym's location.
- A changed `date` follows the same rule as a new competition's.
- A changed `startTime` has the same format as a new competition's. Moving the start to a later moment that hasn't come yet closes the scorecard, the leaderboard, and the AI Route Assistant to Climbers again until then.
- A changed `endTime` has the same format. The start must still come before the end, whether one, the other, or both are sent. A competition saved before end times existed keeps ending at the end of its date until an `endTime` is sent. Moving the end later lets Climbers record results again until then, and moving it earlier closes their scoring then.
- `capacity` can't go below the number of CONFIRMED registrations.
- `status` can't be set directly. Opening registration on a DRAFT also makes it PUBLISHED. Closing registration later keeps it PUBLISHED.
- Registration opens only once the competition has a division, since a Climber chooses one to register.

Response: the competition, shaped like GET /api/gym-admin/competitions/{competitionId}.

Errors: 400 `VALIDATION_ERROR` with the message "Change at least one competition detail." when the body has none of these fields, 400 `VALIDATION_ERROR` with `fields.endTime` "Choose an end time after the start time." when the end wouldn't come after the start, 409 `DIVISION_REQUIRED` with `fields.registrationStatus` when registration would open on a competition without divisions, and 409 `COMPETITION_EXISTS` as for creation.

### 1.7 Divisions and registered Climbers

These routes follow the same access rules as 1.6: a GYM_ADMIN of an active gym, and 404 `COMPETITION_NOT_FOUND` for a competition in any other gym.

#### GET /api/gym-admin/competitions/{competitionId}/divisions

Response, by name:

```json
{
  "divisions": [
    {
      "_id": "string",
      "competitionId": "string",
      "name": "Beginner",
      "climberCount": 12,
      "createdAt": "ISO-8601 timestamp",
      "updatedAt": "ISO-8601 timestamp"
    }
  ]
}
```

`climberCount` counts the division's registrations, whatever their status.

#### POST /api/gym-admin/competitions/{competitionId}/divisions

Request body:

```json
{
  "name": "Beginner"
}
```

- `name` is required: `Open`, `Beginner`, `Youth`, or `Advanced`. The page offers them in a list, without the ones the competition already has.

Response (201): the new division, shaped like one entry of the list above, with `climberCount` 0.

Errors: 400 `VALIDATION_ERROR` with `fields.name` "Choose Open, Beginner, Youth, or Advanced." for any other name, and 409 `DIVISION_EXISTS` when the competition already has that division.

#### GET /api/gym-admin/competitions/{competitionId}/climbers

Query: `divisionId` (optional) lists only the Climbers in that division.

Response, by last name and then first name:

```json
{
  "climbers": [
    {
      "registrationId": "string",
      "status": "PENDING | CONFIRMED | WAITLIST",
      "registeredAt": "ISO-8601 timestamp",
      "climber": { "_id": "string", "firstName": "string", "lastName": "string", "email": "string" },
      "division": { "_id": "string", "name": "Beginner" }
    }
  ],
  "total": 1
}
```

`climber` or `division` is `null` when that record no longer exists.

#### PUT /api/gym-admin/competitions/{competitionId}/climbers/{climberId}/division

Places a registered Climber in one of the competition's divisions, or moves them to another one (US-014). `climberId` is the Climber's user ID.

Request body:

```json
{
  "divisionId": "string"
}
```

Response: the registration, shaped like one entry of the climbers list. Only the registration for this competition changes.

Errors: 400 `VALIDATION_ERROR` with `fields.divisionId` "Choose a division from this competition." when the division isn't one of this competition's, and 404 `REGISTRATION_NOT_FOUND` when the Climber isn't registered for it.

#### GET /api/gym-admin/competitions/{competitionId}/climbers/{climberId}

Response: the Climber's registration for this competition, shaped like one entry of the climbers list (US-015).

Errors: 404 `REGISTRATION_NOT_FOUND`.

#### PATCH /api/gym-admin/competitions/{competitionId}/climbers/{climberId}

Changes the Climber's division for this competition (US-015). The request body, response, and errors are the same as PUT .../climbers/{climberId}/division. The division is the only registration detail a Gym Admin can change.

#### DELETE /api/gym-admin/competitions/{competitionId}/climbers/{climberId}

Removes the Climber's registration for this competition only (US-015). Their account, and their registrations for other competitions, stay.

Response: 204 with no body.

Errors: 404 `REGISTRATION_NOT_FOUND` when the Climber isn't registered, including a second removal.

### 1.8 Routes / boulder problems

These routes follow the same access rules as 1.6. A route in another competition answers 404 `ROUTE_NOT_FOUND`.

#### GET /api/gym-admin/competitions/{competitionId}/routes

Response, by route number, so 2 comes before 10:

```json
{
  "routes": [
    {
      "routeId": "string",
      "competitionId": "string",
      "routeNumber": "8",
      "name": "Problem 8",
      "grade": "V4",
      "pointValue": 25,
      "notes": "string",
      "official": true
    }
  ],
  "total": 1
}
```

Each route is shaped like GET /api/gym-admin/competitions/{competitionId}/routes/{routeId}. The list holds every route of the competition.

#### POST /api/gym-admin/competitions/{competitionId}/routes

Request body:

```json
{
  "routeNumber": "8",
  "name": "Problem 8",
  "grade": "V4",
  "pointValue": 25,
  "notes": "string"
}
```

- `routeNumber` (up to 40 characters), `grade`, and `pointValue` are required. `grade` is an official V-grade from V0 to V17, such as V4. `pointValue` is a whole number from 0 to 10,000: what a top on the first attempt scores.
- `name` is optional, up to 50 characters, since the route number identifies the route. Left out or blank, the route has no name.
- `notes` is optional, up to 2000 characters.
- `official` may be left out or sent as `true`. The server always saves the route as official.

Response (201):

```json
{
  "routeId": "string",
  "competitionId": "string",
  "grade": "V4",
  "official": true
}
```

Errors: 409 `ROUTE_EXISTS` when the competition already has a route with that number, ignoring case.

#### GET /api/gym-admin/competitions/{competitionId}/routes/{routeId}

Response:

```json
{
  "routeId": "string",
  "competitionId": "string",
  "routeNumber": "8",
  "name": "Problem 8",
  "grade": "V4",
  "pointValue": 25,
  "notes": "string",
  "official": true
}
```

`name`, `pointValue`, and `notes` are left out when the route has none. Routes saved before the point value was required may have none.

#### PATCH /api/gym-admin/competitions/{competitionId}/routes/{routeId}

Request body, with at least one field:

```json
{
  "routeNumber": "8",
  "name": "Problem 8",
  "grade": "V4",
  "pointValue": 25,
  "notes": "string"
}
```

- The fields follow the same rules as for a new route. `name` or `notes` sent as an empty string removes it. A point value can be changed, including to 0, but not removed.
- The route's competition and its official status can't be changed.

Response: the route, shaped like GET /api/gym-admin/competitions/{competitionId}/routes/{routeId}.

Errors: 400 `VALIDATION_ERROR` with the message "Change at least one route detail." when the body has none of these fields, and 409 `ROUTE_EXISTS` as for a new route.

### 1.9 Scoring

These routes follow the same access rules as 1.6 (US-018).

#### GET /api/gym-admin/competitions/{competitionId}/scoring

Response:

```json
{
  "competitionId": "string",
  "scoring": { "deductionPercent": 20, "maxAttempts": 5, "updatedBy": "string", "updatedAt": "ISO-8601 timestamp" },
  "readiness": {
    "routes": 4,
    "routesWithoutPoints": 0,
    "ready": true,
    "warnings": []
  }
}
```

- `scoring` is `null` when the competition has no valid scoring settings.
- `readiness` lists what's missing before results can be entered: scoring settings, routes, and a point value on every route.

#### PUT /api/gym-admin/competitions/{competitionId}/scoring

Request body:

```json
{
  "deductionPercent": 20,
  "maxAttempts": 5
}
```

- A top scores the problem's point value, less `deductionPercent` percent of it for each failed attempt before the top. A problem not topped within `maxAttempts` scores 0. With 20 and 5, a 100-point problem scores 100, 80, 60, 40, or 20.
- `deductionPercent` is a whole number from 0 to 99, and `maxAttempts` from 1 to 20. A top on the last attempt must still score, so the deduction times one less than `maxAttempts` must stay below 100. Otherwise the answer is 400 `VALIDATION_ERROR` with `fields.deductionPercent`, such as "With 5 attempts, the deduction can be at most 24% so a top on the last attempt still scores."
- The server records who saved the settings and when.

Response: shaped like GET.

Errors: 409 `COMPETITION_CANCELLED`, and 409 `COMPETITION_FINISHED` once the competition's date has passed.

### 1.10 Competition discovery

These routes need the access token of a CLIMBER, like Section 1.11 (US-025 to US-027). Only PUBLISHED competitions of ACTIVE gyms are found.

A search can have a starting point (US-025 criterion 6): where the Climber is, a place they searched for, or the location they saved at sign-up. Distances are measured from it to each competition's gym. The starting point is only used for that answer: the server never stores or logs it, and the web app rounds where the Climber is to 3 decimal places (about 110 m) and keeps it out of the page's address. Every answer under `/api/competitions` is sent with `Cache-Control: no-store`, so browsers don't keep a search's address, and the point in it, in their cache.

#### GET /api/competitions

The List View: upcoming competitions, one page at a time, soonest first unless the Climber picks another order (US-026 criterion 6).

Query, every filter optional:
- `q`: search text, up to 100 characters. Up to five of its words are matched against the competition's name and location and its gym's name.
- `gymId`: one gym's competitions.
- `from`, `to`: dates as `YYYY-MM-DD`. Past dates are never shown, and `to` can't be before `from`.
- `registration`: `any` (the default) or `open`.
- `lat`, `lng`: the starting point, such as where the Climber is or a place they searched for. Both or neither.
- `near`: `saved` to start from the location the Climber saved at sign-up. It can't be sent with `lat` and `lng`.
- `radiusKm`: from 1 to 200. Only competitions whose gym's map pin is within it of the starting point. Without `lat`, `lng`, or `near`, it's measured from the saved location. The web app offers 5, 10, 25, 50, and 100. A gym without a pin keeps its competitions out of distance searches.
- `sort`: `soonest` (the default), `closest`, `joined` (most Climbers with a CONFIRMED registration), `spaces` (most spaces left), or `random`. Ties go soonest first. `closest` measures to each gym's pin and puts the competitions of gyms without one last. Without `lat`, `lng`, or `near`, it starts from the saved location. Any order but `soonest` ranks the 1000 soonest matching competitions at most, far more than TopSend's gyms hold at once, and `total` then counts the ranked ones.
- `seed`: for `random`, a whole number from 1 to 999999999. The same seed always gives the same order, so the pages of one shuffle fit together. Without it, the order stays the same all day, from the date in Toronto. The web app leaves a seed that isn't one out of its request, so the day's order shows.
- `page` starts at 1, and `limit` is from 1 to 100, 20 by default.

Response:

```json
{
  "competitions": [
    {
      "_id": "string",
      "name": "string",
      "date": "YYYY-MM-DD",
      "startTime": "10:00",
      "endTime": "18:00",
      "location": "string",
      "gym": { "_id": "string", "name": "string" },
      "registrationStatus": "OPEN | CLOSED",
      "capacity": 120,
      "joined": 80,
      "spacesLeft": 40,
      "full": false,
      "coordinates": { "lat": 43.6383, "lng": -79.4006 },
      "distanceKm": 2.4
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

- `startTime` is when the competition starts on its date, in Toronto time, as 24-hour `HH:mm`, or `null` for a competition saved before start times existed. `endTime` is when it ends, in the same format, or `null` for a competition saved before end times existed.
- `joined` counts the Climbers with a CONFIRMED registration, the only ones that take a space.
- `coordinates` is the gym's map pin, or, for a gym without one, a pin saved with the competition, or `null`.
- `distanceKm` is only sent when there's a starting point, and is `null` when the gym has no pin.

Errors: 400 `VALIDATION_ERROR` with:
- `fields.near`: "Choose one starting point: your saved location or a point." for `near` with `lat` and `lng`, "Your account doesn't have a saved location. Choose another starting point." for `near=saved` without one, or "Choose a starting point." for any other value.
- `fields.radiusKm` or `fields.sort`: "Choose a starting point to search by distance." or "Choose a starting point to sort by distance." when the saved location is needed and there isn't one.
- `fields.sort` for an order that isn't offered, and `fields.seed` for a seed out of range.

#### GET /api/competitions/map

The Map View: the same competitions and filters as the List View, without paging or order, up to 500. `sort` and `seed` are ignored.

Response:

```json
{
  "pins": [],
  "total": 1,
  "unmapped": 0,
  "pending": 0,
  "truncated": false,
  "origin": { "lat": 43.6455, "lng": -79.3807 }
}
```

- `pins` are shaped like the List View's entries. A competition without a pin is placed at its address when the server's Google Maps key can find it. That place is only used for this answer.
- `unmapped` counts competitions with no map location. `pending` counts the ones whose address wasn't looked up yet: each request starts at most 20 lookups, and a refresh adds the rest. `truncated` is true when more competitions matched than were loaded.
- `origin` is the starting point, or `null` when there's none, so the map can show it and the chosen distance around it (US-027 criterion 7). With `near=saved`, it's the Climber's own saved location.

#### GET /api/competitions/filters

Response:

```json
{
  "gyms": [{ "_id": "string", "name": "string", "location": "string", "competitionCount": 2 }],
  "registration": [
    { "value": "any", "label": "All upcoming competitions" },
    { "value": "open", "label": "Registration open" }
  ],
  "sorts": [
    { "value": "soonest", "label": "Soonest first" },
    { "value": "closest", "label": "Closest first" },
    { "value": "joined", "label": "Most joined" },
    { "value": "spaces", "label": "Most spaces left" },
    { "value": "random", "label": "Random order" }
  ],
  "distanceChoicesKm": [5, 10, 25, 50, 100],
  "maxRadiusKm": 200,
  "hasSavedLocation": true
}
```

`gyms` lists the active gyms with upcoming published competitions. `hasSavedLocation` says whether the Climber can start from their saved location.

#### GET /api/competitions/{competitionId}

Event Details (US-025 criterion 5). A past competition still opens, marked `upcoming: false`.

Response:

```json
{
  "_id": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
  "startTime": "10:00",
  "startsAt": "ISO-8601 timestamp",
  "started": false,
  "endTime": "18:00",
  "endsAt": "ISO-8601 timestamp",
  "ended": false,
  "location": "string",
  "description": "string",
  "gym": { "_id": "string", "name": "string", "location": "string" },
  "coordinates": { "lat": 43.6383, "lng": -79.4006 },
  "upcoming": true,
  "registrationStatus": "OPEN | CLOSED",
  "capacity": 120,
  "spacesLeft": 40,
  "full": false,
  "divisions": [{ "_id": "string", "name": "Open" }],
  "scoringFormat": { "label": "20% off for each failed attempt, up to 5 attempts" },
  "myRegistration": null,
  "registrationAvailable": true
}
```

- `startsAt` is the moment the competition starts, from `date` and `startTime` in Toronto time, and the page counts down to it. `started` is the server's answer to whether that moment has come: until it's true, a registered Climber sees their registration status only, and the scorecard and leaderboard stay closed (Section 1.13).
- `endsAt` is the moment the competition ends, from `date` and `endTime` in Toronto time, or 12:00 a.m. the next day without an `endTime`. `ended` is the server's answer to whether that moment has come. While `started` is true and `ended` is false, the page counts down to `endsAt`, when Climbers' scoring closes.
- `scoringFormat` is `null` when the competition's scoring isn't set.
- `myRegistration` is the Climber's own registration, `{ "status", "registeredAt", "division" }`, or `null`.
- `registrationAvailable` is true when the competition is upcoming, its registration is OPEN, it has spaces left and at least one division, and the Climber isn't registered.

Errors: 404 `COMPETITION_NOT_FOUND` for a draft, a cancelled competition, one of an inactive gym, or one that doesn't exist.

### 1.11 Registration

These routes need the access token of a CLIMBER. Without a login they answer 401, and for any other role 403 `ROLE_FORBIDDEN`.

#### POST /api/competitions/{competitionId}/registrations

Registers the logged-in Climber in one of the competition's divisions (US-028).

Request body:

```json
{
  "divisionId": "string"
}
```

- `divisionId` is required: the Climber chooses any of the competition's divisions. There are no age, gender, or level rules.
- `climberId` may be sent, but must be the logged-in Climber's own ID. The server always registers the logged-in Climber.

Response (201):

```json
{
  "registrationId": "string",
  "status": "CONFIRMED",
  "divisionId": "string",
  "competitionId": "string"
}
```

Errors: 404 `COMPETITION_NOT_FOUND` for a competition that isn't PUBLISHED or whose gym isn't ACTIVE, 409 `ALREADY_REGISTERED`, 409 `REGISTRATION_CLOSED`, 409 `COMPETITION_FINISHED` once its date has passed, 409 `COMPETITION_FULL` when its CONFIRMED registrations reach its capacity, 400 `VALIDATION_ERROR` with `fields.divisionId` "Choose a division from this competition.", and 503 `REGISTRATION_UNAVAILABLE` when the database can't run transactions.

#### GET /api/competitions/{competitionId}/registration

The logged-in Climber's own registration for the competition (US-029). Only their own registration is ever read.

Response:

```json
{
  "competition": {
    "_id": "string",
    "name": "string",
    "date": "YYYY-MM-DD",
    "startTime": "10:00",
    "startsAt": "ISO-8601 timestamp",
    "started": false,
    "endTime": "18:00",
    "endsAt": "ISO-8601 timestamp",
    "ended": false,
    "location": "string",
    "gym": { "_id": "string", "name": "string" },
    "status": "PUBLISHED",
    "upcoming": true,
    "registrationStatus": "OPEN | CLOSED"
  },
  "registration": {
    "registrationId": "string",
    "status": "PENDING | CONFIRMED | WAITLIST",
    "statusLabel": "Confirmed",
    "confirmed": true,
    "waitlistPosition": null,
    "division": { "_id": "string", "name": "Beginner" },
    "registeredAt": "ISO-8601 timestamp"
  },
  "capacity": { "capacity": 120, "confirmed": 80, "spacesLeft": 40, "full": false }
}
```

A Climber who registered keeps seeing this even after the competition is cancelled or its gym is deactivated. It's the one view of the competition a Climber has before it starts: `startsAt`, `started`, `endsAt`, and `ended` are as in Event Details, and GET /api/competitions/my-events sends the same six time fields with each of the Climber's competitions.

Errors: 404 `REGISTRATION_NOT_FOUND` when the Climber isn't registered for a competition they can find, and 404 `COMPETITION_NOT_FOUND` otherwise.

### 1.12 Official result entry

Not built yet (US-019).

#### POST /api/competitions/{competitionId}/results

Request body:

```json
{
  "climberId": "string",
  "routeId": "string",
  "attempts": 4,
  "sends": 1,
  "flash": false,
  "score": 25
}
```

Response:

```json
{
  "resultId": "string",
  "climberId": "string",
  "routeId": "string",
  "officialScore": 25,
  "status": "saved"
}
```

### 1.13 Leaderboard and scorecard queries

The Climber's leaderboard (US-020, US-032) and scorecard (US-031) are built.

Until a PUBLISHED competition's start (`startsAt`, Section 1.10), both routes below answer a Climber 409 `COMPETITION_NOT_STARTED`, after the checks that decide whether the Climber may see the competition at all:

```json
{
  "error": "COMPETITION_NOT_STARTED",
  "message": "This competition starts on November 14, 2026 at 10:00 a.m. Your scorecard and the leaderboard open then.",
  "details": { "startsAt": "ISO-8601 timestamp" }
}
```

- The page shows the countdown from `details.startsAt` and asks again when it ends, so it opens without a refresh.
- The public leaderboard, GET /api/leaderboards/{competitionId}, answers a Visitor the same way. So do the `/leaderboard` and `/scorecard` Socket.IO namespaces (events.md, section 8), the Climber's own result routes under .../scorecard, and the Climber's AI Route Assistant (Section 1.14).
- A Gym Administrator's routes for their own gym's competitions are never held back, so the gym can check the leaderboard before the doors open. A CANCELLED competition isn't held back either, since it has no start to wait for.

#### GET /api/competitions/{competitionId}/leaderboard

The current standings of a competition, with the logged-in Climber's own place (US-020 criterion 4, US-032). It needs the access token of a CLIMBER who registered for the competition, in any status, unless the competition's leaderboard is public. The standings are calculated from the official results each time they're asked for.

Query: `divisionId` (optional) answers only that division's standings. `myEntry` is still the Climber's own place.

Response:

```json
{
  "audience": "climber",
  "competition": {
    "_id": "string",
    "name": "string",
    "date": "YYYY-MM-DD",
    "status": "PUBLISHED",
    "gym": { "_id": "string", "name": "string" },
    "startsAt": "ISO-8601 timestamp",
    "endsAt": "ISO-8601 timestamp",
    "ended": false
  },
  "scoring": { "deductionPercent": 20, "maxAttempts": 5, "label": "20% off for each failed attempt, up to 5 attempts" },
  "tiebreakers": ["Highest total score"],
  "routeCount": 12,
  "divisions": [
    {
      "_id": "string",
      "name": "Open",
      "climberCount": 4,
      "standings": [
        {
          "entryId": "string",
          "rank": 2,
          "tied": true,
          "climber": { "firstName": "Sam", "lastName": "Rivera" },
          "totalScore": 260,
          "sends": 2,
          "flashes": 1,
          "attemptsToTops": 4,
          "problemsRecorded": 2
        }
      ]
    }
  ],
  "myEntry": {
    "entryId": "string",
    "division": { "_id": "string", "name": "Open" },
    "rank": 2,
    "tied": true,
    "totalScore": 260,
    "of": 4,
    "sends": 2,
    "flashes": 1,
    "problemsRecorded": 2,
    "pointsBehindLeader": 200,
    "placeAbove": { "rank": 1, "pointsBehind": 200 }
  },
  "myRegistration": { "status": "CONFIRMED", "division": { "_id": "string", "name": "Open" } },
  "lastResultAt": "ISO-8601 timestamp",
  "generatedAt": "ISO-8601 timestamp"
}
```

- Only CONFIRMED registrations are ranked, each against the Climbers of its own division. A confirmed Climber without results is listed with 0 points.
- Climbers are ranked by total score, highest first. Equal totals share a place (1, 2, 2, 4) and are listed by last name, then first name. Sends, flashes and attempts are shown, but they never break a tie.
- `entryId` is the registration's ID. Other Climbers are shown by name only.
- `myEntry` is `null` when the Climber isn't ranked. `pointsBehindLeader` is 0 in first place, and `placeAbove` is the nearest higher place, or `null` in first place.
- `myRegistration` is the Climber's registration status and division, so a Climber on the waitlist or with a pending place can be told why they aren't ranked. It's `null` for a Climber who didn't register and is viewing a public leaderboard.
- `scoring` is `null` when the competition's scoring isn't set, and every score is then 0. `lastResultAt` is `null` until the first official result is recorded, and every Climber then shares first place with 0 points.
- The `/leaderboard` Socket.IO namespace sends the same shape to each viewer when the standings may have changed (events.md, section 8).
- `competition.startsAt`, `endsAt`, and `ended` are as in Event Details (Section 1.10). While the competition is on, the page counts down to `endsAt`, when Climbers' scoring closes.

- The Climber's page shows the Climber's own division only, without a division picker: the division of `myEntry`, or of `myRegistration` for a Climber who isn't ranked. Only a Gym Administrator's leaderboard and the public one let the viewer pick a division.

Errors: 404 `COMPETITION_NOT_FOUND` for a draft or a competition that doesn't exist, 404 `REGISTRATION_NOT_FOUND` when the Climber isn't registered and the leaderboard isn't public, 409 `COMPETITION_NOT_STARTED` before the competition's start, 400 `VALIDATION_ERROR` for a malformed ID or a division of another competition, 401 without a login, and 403 `ROLE_FORBIDDEN` for any other role.

#### GET /api/competitions/{competitionId}/scorecard

The logged-in Climber's own scorecard for a competition they registered for (US-031): every official problem, by route number, each with their official result or `null`. The Climber is always the one in the access token, so no request reads another Climber's scorecard.

Response:

```json
{
  "competition": {
    "_id": "string",
    "name": "string",
    "date": "YYYY-MM-DD",
    "startTime": "10:00",
    "startsAt": "ISO-8601 timestamp",
    "endTime": "18:00",
    "endsAt": "ISO-8601 timestamp",
    "ended": false,
    "location": "string",
    "status": "PUBLISHED",
    "upcoming": true,
    "gym": { "_id": "string", "name": "string", "active": true }
  },
  "climber": { "firstName": "Sam", "lastName": "Rivera" },
  "registration": {
    "registrationId": "string",
    "status": "CONFIRMED",
    "statusLabel": "Confirmed",
    "confirmed": true,
    "division": { "_id": "string", "name": "Open" }
  },
  "scoring": { "deductionPercent": 20, "maxAttempts": 5, "label": "20% off for each failed attempt, up to 5 attempts" },
  "summary": {
    "routeCount": 12,
    "completed": 5,
    "unfinished": 7,
    "flashes": 2,
    "attempted": 3,
    "notAttempted": 4,
    "totalAttempts": 14,
    "totalScore": 185
  },
  "selfScoring": { "open": true, "reason": null },
  "routes": [
    {
      "routeId": "string",
      "routeNumber": "3",
      "name": "Crimp Ladder",
      "grade": "V5",
      "pointValue": 300,
      "status": "FLASHED | SENT | ATTEMPTED | NOT_ATTEMPTED",
      "statusLabel": "Sent",
      "completed": true,
      "result": {
        "attempts": 2,
        "sends": 1,
        "sent": true,
        "flash": false,
        "officialScore": 240,
        "attemptsLeft": 0,
        "updatedAt": "ISO-8601 timestamp"
      }
    }
  ],
  "lastResultAt": "ISO-8601 timestamp",
  "generatedAt": "ISO-8601 timestamp"
}
```

- The page shows the problems as a scrollable score sheet over the competition's background. Each row has the problem's number, name, grade, attempts against the limit, such as 2/5 from `result.attempts` and `scoring.maxAttempts`, and points. The sheet has no Flash column.
- `selfScoring.open` says whether the Climber can record their own results right now: from the competition's start until its end time (`endsAt`), on a PUBLISHED competition with scoring set, while their place is CONFIRMED. Otherwise `reason` is `CANCELLED`, `NOT_STARTED`, `CLOSED`, `NO_SCORING`, or `NOT_CONFIRMED`.
- `result` is `null` for a problem without an official result. `scoring` is `null` until the gym sets it.
- The `/scorecard` Socket.IO namespace sends the same shape when the Climber's scorecard may have changed.

Errors: 404 `COMPETITION_NOT_FOUND` for a draft or a competition that doesn't exist, 404 `REGISTRATION_NOT_FOUND` when the Climber isn't registered, 409 `COMPETITION_NOT_STARTED` before the competition's start, 401 without a login, and 403 `ROLE_FORBIDDEN` for any other role.

### 1.14 AI route assistant

The AI Route Assistant is a chatbot inside the scorecard, leaderboard, and statistics pages, with no page of its own (section 11 of the spec). A Climber's chatbot calls the two /api/competitions routes below (US-033), and a Gym Administrator's the two /api/gym-admin routes after them (US-023). Both call the Google Gemini API from the backend (services/geminiClient.js), with the key in `GEMINI_API_KEY` (server/.env.example). They only read official data, Gemini gets no tools, and nothing an answer says is saved or acted on. While `GEMINI_API_KEY` is empty, both are off.

Both POST bodies take the same two chatbot fields:

- `page`: the page the chatbot was opened on. It decides which approved data goes with the question and what kind of question the assistant expects. A page the role's chatbot isn't on answers 400 `VALIDATION_ERROR`.
- `history`: optional, the earlier messages of the conversation on that page, oldest first, as `{ "role": "user | assistant", "text": "string" }`. Up to 20 can be sent, the last 6 are used, and each is cut to 1000 characters. They reach Gemini as data inside the message, next to the question, never as instructions and never as its own earlier turns, so nothing a message says changes the assistant's rules.

The user, their role, and the competition's data always come from the server. Whatever the question or the earlier messages say, such as `{"$ne": null}`, `' OR '1'='1' --`, or "ignore your instructions", is only text to answer about: it's never part of a database query, and Gemini is never given a credential, a setting, or anything about another person that it could repeat.

#### GET /api/competitions/{competitionId}/route-assistant

Whether the logged-in Climber can ask the Route Assistant about a competition, and the data an answer would use (US-033). It needs the access token of a CLIMBER registered for the competition, in any status.

Response:

```json
{
  "competition": {
    "_id": "string",
    "name": "string",
    "date": "YYYY-MM-DD",
    "gym": { "_id": "string", "name": "string" }
  },
  "enabled": true,
  "canAsk": true,
  "reasons": [],
  "limits": { "questionMaxLength": 300, "questionsPerHour": 20 },
  "notice": "AI-generated. May be inaccurate. Official scores are not affected. Other Climbers' results can still change the standings, so no answer guarantees a place.",
  "basedOn": {
    "competition": { "name": "string", "date": "YYYY-MM-DD", "finished": false },
    "scoring": { "deductionPercent": 20, "maxAttempts": 5 },
    "you": {
      "division": "Open",
      "place": 2,
      "tied": true,
      "climbersInDivision": 4,
      "totalScore": 260,
      "routesTopped": 2,
      "flashes": 1,
      "pointsBehindLeader": 200
    },
    "placesAbove": [{ "place": 1, "totalScore": 460, "pointsToTie": 200 }],
    "divisionPlaces": [
      { "place": 1, "totalScore": 460, "climbers": 1 },
      { "place": 2, "totalScore": 260, "climbers": 2, "yours": true },
      { "place": 4, "totalScore": 0, "climbers": 1 }
    ],
    "routesToTry": [
      {
        "route": "3",
        "grade": "V5",
        "points": 300,
        "yourAttempts": 0,
        "attemptsLeft": 5,
        "pointsIfToppedNextAttempt": 300,
        "climbersWithResults": 2,
        "completionRatePercent": 100,
        "averageAttempts": 1.5,
        "flashRatePercent": 50,
        "enoughData": false
      }
    ],
    "completedRoutes": [
      { "route": "1", "name": "Crimp Ladder", "grade": "V2", "attempts": 3, "flash": false, "pointsEarned": 60 }
    ],
    "cantScore": [{ "route": "4", "grade": "V6", "yourAttempts": 5, "reason": "no attempts left" }],
    "minimumResultsForComparison": 3
  }
}
```

- `canAsk` is false, with each reason in `reasons`, when the assistant isn't set up (`enabled` is false), the Climber's place isn't CONFIRMED, the competition was cancelled, its scoring isn't set, or it has no problems.
- `basedOn` is exactly what Gemini receives with a question. Other Climbers appear only as places and totals, never by name, ID or email. `you` is `null` while the Climber isn't ranked, and `scoring` is `null` until the gym sets it.
- `routesToTry` lists the routes the Climber can still score on: not topped yet, with attempts left and a point value. `pointsIfToppedNextAttempt` applies the scoring rules to their next attempt. The route statistics are `null` until a Climber has a result on the route, and `enoughData` is false below `minimumResultsForComparison` Climbers.
- `cantScore` gives each other unfinished route's reason: `no point value yet`, `worth no points`, `no attempts left`, or `competition is over`. `competition.finished` is true once the competition day is over, and every unfinished route then moves to `cantScore`. A route's `name` is left out when it has none.

Errors: 404 `COMPETITION_NOT_FOUND` for a draft or a competition that doesn't exist, 404 `REGISTRATION_NOT_FOUND` when the Climber isn't registered, 409 `COMPETITION_NOT_STARTED` before the competition's start (Section 1.13), 400 `VALIDATION_ERROR` for a malformed ID, 401 without a login, and 403 `ROLE_FORBIDDEN` for any other role.

#### POST /api/competitions/{competitionId}/route-assistant

Asks which routes to try next or how far a place is (US-033). It needs a CLIMBER with a CONFIRMED place in the competition.

Request body:

```json
{
  "question": "Which route should I try next?",
  "page": "scorecard",
  "history": [
    { "role": "user", "text": "Explain my scorecard." },
    { "role": "assistant", "text": "You topped 2 of 12 routes for 260 points." }
  ]
}
```

- `question` is trimmed, runs of spaces become one, and line breaks are kept. It needs 3 to 300 characters and at least one letter.
- `page` is `scorecard` (the default) or `leaderboard`. Both get the same approved data, the Climber's own results, the route statistics, and the places and totals of their division. On `scorecard` the assistant expects questions about which problem to try, and on `leaderboard` about places and point differences.
- The Climber's results, the standings, the instructions and the model always come from the server. A body with fields such as `results`, `standings`, `scores`, `prompt` or `model` is refused with 400, and other unknown fields are dropped.

Response:

```json
{
  "competition": { "_id": "string", "name": "string", "date": "YYYY-MM-DD", "gym": { "_id": "string", "name": "string" } },
  "page": "scorecard",
  "question": "Which route should I try next?",
  "answer": "Try Route 3 next. A top on your next attempt is worth 300 points, and both Climbers who tried it topped it.",
  "recommendedRoutes": [
    {
      "route": "3",
      "grade": "V5",
      "points": 300,
      "yourAttempts": 0,
      "attemptsLeft": 5,
      "pointsIfToppedNextAttempt": 300,
      "climbersWithResults": 2,
      "completionRatePercent": 100,
      "averageAttempts": 1.5,
      "flashRatePercent": 50,
      "enoughData": false
    }
  ],
  "truncated": false,
  "notice": "AI-generated. May be inaccurate. Official scores are not affected. Other Climbers' results can still change the standings, so no answer guarantees a place.",
  "basedOn": {},
  "answeredAt": "ISO-8601 timestamp"
}
```

- `answer` is plain text, and the chatbot shows it as text, never as HTML.
- `recommendedRoutes` are entries of `basedOn.routesToTry`, best first, at most 3. A route Gemini names that the Climber already topped, can't score on, or that doesn't exist is left out, so a completed route is never recommended.
- `truncated` is true when the answer was cut off, or only part of it could be read. It's then kept as far as it was whole, with the recommended routes that came before the cut.
- `basedOn` has the same shape as in GET, read when the question was asked.
- Nothing is saved: the question, the answer and the official data stay as they were.

Errors: the GET errors, and 400 `VALIDATION_ERROR` for a question, page, or earlier messages that aren't valid, 409 `COMPETITION_CANCELLED`, `REGISTRATION_NOT_CONFIRMED`, `SCORING_NOT_CONFIGURED` or `ROUTE_ASSISTANT_NO_DATA` when `canAsk` is false for that reason, 503 `ROUTE_ASSISTANT_UNAVAILABLE` when the assistant isn't set up or Gemini can't be reached, 503 `ROUTE_ASSISTANT_BUSY` when Gemini is over its limits, with a Retry-After header when Gemini gives one, 502 `ROUTE_ASSISTANT_BAD_RESPONSE` for an answer that can't be used, 422 `ROUTE_ASSISTANT_DECLINED` when Gemini won't answer, and 429 `TOO_MANY_REQUESTS` after 20 answered questions in an hour, counted per Climber across competitions. A question that gets an error doesn't count.

#### GET /api/gym-admin/competitions/{competitionId}/route-assistant

Whether the Gym Admin can ask about one of their gym's competitions, and the statistics an answer would use (US-023). It follows the access rules of Section 1.6, so a competition of another gym answers 404 `COMPETITION_NOT_FOUND`.

Query: `divisionId` (optional) uses only the results of that division's Climbers.

Response:

```json
{
  "competition": { "_id": "string", "name": "string" },
  "enabled": true,
  "canAsk": true,
  "reasons": [],
  "limits": { "questionMaxLength": 500, "questionsPerHour": 30 },
  "notice": "AI-generated. May be inaccurate. Answers use this competition's official statistics and never change official scores, results, rankings or route grades.",
  "basedOn": {
    "division": null,
    "routes": [
      {
        "route": "3",
        "name": "Crimp Ladder",
        "grade": "V5",
        "climbersWithResults": 4,
        "sends": 3,
        "flashes": 1,
        "completionRatePercent": 75,
        "averageAttempts": 2.25,
        "flashRatePercent": 25,
        "enoughData": true
      }
    ],
    "resultCount": 4,
    "routesLeftOut": 0,
    "minimumResultsForComparison": 3
  }
}
```

- `canAsk` is false, with each reason in `reasons`, when the assistant isn't set up, the competition has no routes, or it has no official results yet.
- `basedOn.routes` are the official routes with the US-022 statistics, the only route data Gemini receives: no IDs, point values, or scores, and nothing about a Climber. `enoughData` is false below `minimumResultsForComparison` Climbers with results.

Errors: 404 `COMPETITION_NOT_FOUND`, 400 `VALIDATION_ERROR` for a malformed ID or a division of another competition, 401 without a login, 403 `ROLE_FORBIDDEN` for any other role, and 403 `NO_ASSIGNED_GYM`.

#### POST /api/gym-admin/competitions/{competitionId}/route-assistant

Asks how the routes or the competition performed (US-023).

Request body:

```json
{
  "question": "Which route was the hardest?",
  "page": "route-statistics",
  "history": [],
  "divisionId": "string",
  "routeIds": ["string"]
}
```

- `question` follows the Climber's rules, with up to 500 characters.
- `page` is `route-statistics` (the default), `results`, or `leaderboard`. Every page gets the route statistics. On `leaderboard`, the data also has the scoring rules and `standings`: each division's name, how many Climbers it ranks, and its places with their totals and how many Climbers share each, without a name or an ID. A division is `{ "division": "Open", "climbersRanked": 4, "places": [{ "place": 1, "totalScore": 460, "climbers": 1 }], "placesLeftOut": 0 }`, with its first 30 places and how many lower places were left out. With `divisionId`, the standings have that division only.
- `divisionId` and `routeIds` are optional: only one division's results, or only up to 20 of the competition's routes.
- The statistics, the standings, the instructions and the model always come from the server. A body with fields such as `statistics`, `results`, `scores`, `prompt`, `model` or `tools` is refused with 400, and other unknown fields are dropped.

Response:

```json
{
  "competition": { "_id": "string", "name": "string" },
  "page": "route-statistics",
  "question": "Which route was the hardest?",
  "answer": "Route 7 was the hardest: 1 of 6 Climbers topped it, in 4 attempts on average.",
  "truncated": false,
  "notice": "AI-generated. May be inaccurate. Answers use this competition's official statistics and never change official scores, results, rankings or route grades.",
  "basedOn": {},
  "answeredAt": "ISO-8601 timestamp"
}
```

- `answer` is plain text. `truncated` is true when it was cut off.
- `basedOn` has the same shape as in GET, read when the question was asked, plus `standings` on the `leaderboard` page.
- Nothing is saved, and nothing the answer says is acted on.

Errors: the GET errors, and 400 `VALIDATION_ERROR` for a question, page, earlier messages, division, or routes that aren't valid, 409 `ROUTE_ASSISTANT_NO_DATA` when the competition has no routes or no official results, 503 `ROUTE_ASSISTANT_UNAVAILABLE`, 503 `ROUTE_ASSISTANT_BUSY`, 502 `ROUTE_ASSISTANT_BAD_RESPONSE`, and 422 `ROUTE_ASSISTANT_DECLINED` as for a Climber, and 429 `TOO_MANY_REQUESTS` after 30 questions in an hour, counted per Gym Admin across competitions.

### 1.15 Route summary

Every route the API has. "Logged in" means a valid access token in the Authorization header. Every POST, PUT, PATCH and DELETE request from a browser must come from an allowed origin.

| Method | Path | Who can call it | Story |
| --- | --- | --- | --- |
| GET | /api/health | Anyone | T-001 |
| GET | /api/auth/csrf | Anyone | US-001 |
| POST | /api/auth/login | Anyone, with the CSRF token | US-001 |
| POST | /api/auth/refresh | Anyone with a refresh cookie, with the CSRF token | US-001 |
| POST | /api/auth/logout | Anyone with a refresh cookie, with the CSRF token | US-001 |
| GET | /api/auth/me | Logged in | US-001 |
| POST | /api/auth/forgot-password | Anyone | US-001 |
| POST | /api/auth/reset-password/check | Anyone with a reset link | US-001 |
| POST | /api/auth/reset-password | Anyone with a reset link | US-001 |
| POST | /api/session/ping | Logged in | US-001 |
| POST | /api/users/climbers | Anyone | US-002 |
| GET | /api/users/me/onboarding | Logged in | US-037 |
| PUT | /api/users/me/onboarding | Logged in | US-037 |
| GET | /api/geocode/place | Anyone | US-002, US-004, US-005 |
| GET | /api/geocode/location | Anyone | US-002, US-004, US-005 |
| GET | /api/admin/dashboard | ADMIN | US-003 |
| GET | /api/gyms | ADMIN | US-004 |
| POST | /api/gyms | ADMIN | US-004 |
| GET | /api/gyms/{gymId} | ADMIN | US-005 |
| PATCH | /api/gyms/{gymId} | ADMIN | US-005 |
| PATCH | /api/gyms/{gymId}/deactivate | ADMIN | US-005 |
| PATCH | /api/gyms/{gymId}/activate | ADMIN | US-005 |
| GET | /api/gyms/{gymId}/admin-candidates | ADMIN | US-006 |
| GET | /api/gyms/{gymId}/admins/{userId} | ADMIN | US-006 |
| PUT | /api/gyms/{gymId}/admins/{userId} | ADMIN | US-006 |
| GET | /api/gym-requests/gyms | Anyone | US-034 |
| POST | /api/gym-requests | Anyone | US-034 |
| POST | /api/gym-requests/setup/check | Anyone with a setup link | US-035 |
| POST | /api/gym-requests/setup | Anyone with a setup link | US-035 |
| GET | /api/admin/gym-requests | ADMIN | US-035 |
| GET | /api/admin/gym-requests/{requestId} | ADMIN | US-035 |
| PATCH | /api/admin/gym-requests/{requestId}/review | ADMIN | US-035 |
| POST | /api/admin/gym-requests/{requestId}/setup-link | ADMIN | US-035 |
| DELETE | /api/admin/gym-requests/{requestId} | ADMIN | US-035 |
| GET | /api/gym-admin/dashboard | GYM_ADMIN of an active gym | US-011 |
| GET | /api/gym-admin/competitions | GYM_ADMIN of an active gym | US-011 |
| POST | /api/gym-admin/competitions | GYM_ADMIN of an active gym | US-012 |
| GET | /api/gym-admin/competitions/{competitionId} | GYM_ADMIN of an active gym | US-011, US-013 |
| PATCH | /api/gym-admin/competitions/{competitionId} | GYM_ADMIN of an active gym | US-013 |
| GET | /api/gym-admin/competitions/{competitionId}/divisions | GYM_ADMIN of an active gym | US-014 |
| POST | /api/gym-admin/competitions/{competitionId}/divisions | GYM_ADMIN of an active gym | US-014 |
| GET | /api/gym-admin/competitions/{competitionId}/climbers | GYM_ADMIN of an active gym | US-014 |
| PUT | /api/gym-admin/competitions/{competitionId}/climbers/{climberId}/division | GYM_ADMIN of an active gym | US-014 |
| GET | /api/gym-admin/competitions/{competitionId}/climbers/{climberId} | GYM_ADMIN of an active gym | US-015 |
| PATCH | /api/gym-admin/competitions/{competitionId}/climbers/{climberId} | GYM_ADMIN of an active gym | US-015 |
| DELETE | /api/gym-admin/competitions/{competitionId}/climbers/{climberId} | GYM_ADMIN of an active gym | US-015 |
| GET | /api/gym-admin/competitions/{competitionId}/routes | GYM_ADMIN of an active gym | US-016, US-017 |
| POST | /api/gym-admin/competitions/{competitionId}/routes | GYM_ADMIN of an active gym | US-016 |
| GET | /api/gym-admin/competitions/{competitionId}/routes/{routeId} | GYM_ADMIN of an active gym | US-017 |
| PATCH | /api/gym-admin/competitions/{competitionId}/routes/{routeId} | GYM_ADMIN of an active gym | US-017 |
| GET | /api/gym-admin/competitions/{competitionId}/scoring | GYM_ADMIN of an active gym | US-018 |
| PUT | /api/gym-admin/competitions/{competitionId}/scoring | GYM_ADMIN of an active gym | US-018 |
| GET | /api/competitions | CLIMBER | US-025, US-026 |
| GET | /api/competitions/map | CLIMBER | US-025, US-027 |
| GET | /api/competitions/filters | CLIMBER | US-025 |
| GET | /api/competitions/{competitionId} | CLIMBER | US-025 |
| POST | /api/competitions/{competitionId}/registrations | CLIMBER | US-028 |
| GET | /api/competitions/{competitionId}/registration | CLIMBER | US-029 |
| GET | /api/competitions/{competitionId}/leaderboard | CLIMBER registered for it, or any CLIMBER when its leaderboard is public, once it has started | US-020, US-032 |
| GET | /api/competitions/{competitionId}/scorecard | CLIMBER registered for it, once it has started | US-031 |
| GET | /api/competitions/{competitionId}/route-assistant | CLIMBER registered for it, once it has started | US-033 |
| POST | /api/competitions/{competitionId}/route-assistant | CLIMBER with a confirmed place in it, once it has started | US-033 |
| GET | /api/leaderboards/{competitionId} | Anyone, when its leaderboard is public, once it has started | US-020 |
| GET | /api/gym-admin/competitions/{competitionId}/leaderboard | GYM_ADMIN of an active gym | US-020 |
| GET | /api/gym-admin/competitions/{competitionId}/route-assistant | GYM_ADMIN of an active gym | US-023 |
| POST | /api/gym-admin/competitions/{competitionId}/route-assistant | GYM_ADMIN of an active gym | US-023 |

GET /api/health answers `{ "status": "ok", "database": "connected" }`, with `"disconnected"` while the API has no database connection, for hosting health checks.

GET /api/gyms/{gymId}/admin-candidates lists the active GYM_ADMIN accounts with an APPROVED request for the gym that aren't assigned to it yet. PUT /api/gyms/{gymId}/admins/{userId} assigns only such an account. Removing a Gym Administrator from a gym comes with US-007 in Iteration 2. Until then there's no DELETE /api/gyms/{gymId}/admins/{userId} route, so it answers 404.

## 2. Shared service interfaces

The controllers call the services in server/src/services. Access checks are middleware that run first: requireAuth checks the access token, requireRole the role, and requireGymAdmin loads the active gyms of the logged-in Gym Administrator. Every Gym Admin service takes those `gyms` and only finds competitions at them.

| Service | Functions | Stories |
| --- | --- | --- |
| loginService | `createLoginService({ sessions, limits })`, which gives `logIn(email, password)`, and `clearLoginFailures(email)` | US-001 |
| sessionService | `createSessionService({ idleMinutes, absoluteHours })`, which gives `start`, `rotate`, `findActive`, `recordActivity`, `recordRequest`, `timing`, `end`, and `logOut`, and `endAllSessions(userId)` | US-001 |
| accessTokenService | `createAccessTokens(key)`, which gives `sign` and `verify` | US-001 |
| passwordResetService | `sendPasswordResetLink({ email, mailer, appUrl })`, `checkResetLink(token)`, `resetPassword(token, password)` | US-001 |
| mailService | `createMailer({ smtp, mailFrom, nodeEnv })`, which gives `send(message)` | US-001, US-035 |
| userService | `createClimberAccount(details)` | US-002 |
| recaptchaService | `verifyRecaptchaToken(secretKey, token)` | US-002, US-034 |
| geocodingService | `lookUpPlace(apiKey, placeId)`, `lookUpLocation(apiKey, { lat, lng })`, `lookUpAddress(apiKey, address)` | US-002, US-004, US-005 |
| adminDashboardService | `getAdminDashboardSummary()` | US-003 |
| gymService | `listGyms(query)`, `getGymById(gymId)`, `createGym(details)`, `updateGym(gymId, details)`, `deactivateGym(gymId)`, `activateGym(gymId)`, `syncCompetitionLocations()` | US-004, US-005 |
| gymAdminService | `listAdminCandidates(gymId)`, `getGymAdmin(gymId, userId)`, `assignGymAdmin(gymId, userId)` | US-006 |
| gymRequestService | `listRegisteredGyms({ q })`, `submitGymRequest(details)` | US-034 |
| gymRequestReviewService | `listGymRequests(query)`, `getGymRequest(requestId)`, `reviewGymRequest({ requestId, adminId, decision, reason, appUrl })`, `renewSetupLink({ requestId, appUrl })`, `deleteGymRequest({ requestId, adminId })` | US-035 |
| gymAdminSetupService | `checkSetupLink(token)`, `completeGymAdminSetup(token, password)`, `newSetupLink(appUrl)` | US-035 |
| gymAdminDashboardService | `getDashboard(gyms)`, `listCompetitions(gyms, query)`, `getCompetition(gyms, competitionId)`, `updateCompetition(gyms, competitionId, details)` | US-011, US-013 |
| competitionService | `createCompetition(gyms, userId, details)` | US-012 |
| competitionAccess | `findManagedCompetition(gyms, competitionId, fields)`, `competitionNotFound()` | US-014 to US-018 |
| divisionService | `listDivisions(gyms, competitionId)`, `createDivision(gyms, competitionId, userId, { name })`, `listClimbers(gyms, competitionId, { divisionId })`, `assignDivision(gyms, competitionId, climberId, divisionId, userId)` | US-014, US-015 |
| climberDetailsService | `getClimber(gyms, competitionId, climberId)`, `removeClimber(gyms, competitionId, climberId, userId)` | US-015 |
| routeService | `listRoutes(gyms, competitionId)`, `createRoute(gyms, competitionId, userId, details)`, `getRoute(gyms, competitionId, routeId)`, `updateRoute(gyms, competitionId, routeId, userId, details)` | US-016, US-017 |
| scoringService | `getScoring(gyms, competitionId)`, `setScoring(gyms, competitionId, userId, settings)`, `loadScoringRules(competitionId)` | US-018 |
| discoveryService | `listCompetitions(userId, query)`, `competitionMap(userId, query, findPoints)`, `discoveryOptions(userId)`, `getCompetitionDetails(userId, competitionId)` | US-025, US-026, US-027 |
| addressPoints | `createAddressPoints(apiKey)`, which finds where addresses are, to pin competitions whose gym has no map pin | US-027 |
| registrationService | `registerClimber(competitionId, climberId, divisionId)` | US-028 |
| registrationStatusService | `getRegistrationStatus(userId, competitionId)` | US-029 |

Not built yet. Result entry, the leaderboard, route statistics, and the AI Route Assistant come with their Iteration 2 stories (US-019 to US-024 and US-031 to US-033). The two scoring functions below belong in scoringService, next to `loadScoringRules`, which reads a competition's scoring rules.

```ts
interface ScoringService {
  recordOfficialResult(input: OfficialResultInput): Promise<OfficialResult>;
  calculateLeaderboard(competitionId: string): Promise<LeaderboardEntry[]>;
}

interface AnalyticsService {
  computeRouteStatistics(competitionId: string): Promise<RouteStatistics[]>;
  answerRouteQuestion(competitionId: string, userId: string, question: string): Promise<AiAnswer>;
}
```

## 3. External integration contracts

### Google Maps API behavior

- Map loads shall fail gracefully when service latency exceeds the expected threshold.
- If the Google Maps service is unavailable, the UI must show an error or loading state and preserve the list view.
- The application shall not block the user from discovering competitions in list form when the map is unavailable.
- The browser loads the Maps JavaScript API with the browser key, for the Map View, the map pickers, and address suggestions. The API calls the Geocoding API with the server key, for GET /api/geocode/place, GET /api/geocode/location, and the pins of competitions whose gym has no map pin.

### reCAPTCHA

- POST /api/users/climbers and POST /api/gym-requests need `recaptchaToken` from the browser's reCAPTCHA check, and the API verifies it with Google before saving anything. A token Google doesn't accept answers 400 `RECAPTCHA_FAILED`, and 503 `RECAPTCHA_UNAVAILABLE` when Google can't be asked.

### Email

- The API sends email over SMTP, through Amazon SES: password reset links, and the approval, rejection, and new setup link emails for gym requests. Emails go out in the background, so an answer never waits for one, and a failed send is logged with the request ID.
- While SMTP isn't set up, POST /api/auth/forgot-password answers 503 `EMAIL_UNAVAILABLE`, and a gym request review answers `emailSent: false`, so the System Administrator can send a new setup link once email works.

### Persistence and data integrity rules

- Registration and result writes must be atomic.
- A failed result save must not leave partial results.
- Leaderboard data must be recomputed from persisted official results.
- AI recommendation calls must read from official result data only.

## 4. Contract assumptions

- TopSend uses a shared authentication subsystem for all authenticated users.
- The role context is enforced on the server side, not only in the client UI.
- Official results, route grades, and rankings are authoritative and can be edited only by authorized gym staff or platform administrators as defined by the project rules.
- AI features are read-only with respect to official competition outcomes.

# TopSend Interfaces and API Contracts

## 1. Public Interfaces

This document defines the public boundaries for the TopSend MVP. It is derived from the user roles, functional requirements, and the competition workflow described in the source documentation. Field names follow contracts/domain.md, and Section 1.15 lists every route the API has.

Errors use one shape: `{ "error": "CODE", "message": "..." }`, plus `fields` with one message per field for validation errors, and `errorId` for unexpected server errors.

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

`coordinates` is a pin saved with the competition itself, from before competitions used their gym's pin, and is `null` for new competitions.

#### POST /api/gym-admin/competitions

Request body:

```json
{
  "gymId": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
  "description": "string",
  "capacity": 120,
  "deductionPercent": 20,
  "maxAttempts": 5
}
```

- `gymId` is needed only when the Gym Admin has more than one active gym, and must be one of them. One account manages one gym, so it's normally left out.
- `date` is a calendar date in Toronto, from today to two years ahead.
- `description` is optional. `capacity` is a whole number from 1 to 1000.
- `deductionPercent` and `maxAttempts` are the competition's scoring, with the rules of PUT .../scoring (Section 1.9). Left out, they're 20 and 5.
- A competition is held at its gym, so it takes the gym's location, and a `location` or `coordinates` in the body is ignored.

Response (201): the new competition, as a DRAFT with registration CLOSED, shaped like GET /api/gym-admin/competitions/{competitionId} without `registeredClimberCount`.

Errors: 404 `GYM_NOT_FOUND` when `gymId` isn't one of the Gym Admin's active gyms, 409 `COMPETITION_EXISTS` when the gym already has a competition with that name on that date, ignoring case, and 400 `VALIDATION_ERROR` with `fields`.

#### GET /api/gym-admin/competitions/{competitionId}

Response:

```json
{
  "_id": "string",
  "gymId": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
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
- `tools` lists Competition details, Divisions and climbers (US-014), Boulder problems (US-016), and Scoring format (US-018).

#### PATCH /api/gym-admin/competitions/{competitionId}

Request body, with at least one field:

```json
{
  "name": "string",
  "date": "YYYY-MM-DD",
  "description": "string",
  "capacity": 120,
  "registrationStatus": "OPEN | CLOSED"
}
```

- The location isn't editable: it's always the gym's, and changes with it (PATCH /api/gyms/{gymId}). Saving a competition dated today or later, or moving one to a new date, also gives it the gym's location.
- A changed `date` follows the same rule as a new competition's.
- `capacity` can't go below the number of CONFIRMED registrations.
- `status` can't be set directly. Opening registration on a DRAFT also makes it PUBLISHED. Closing registration later keeps it PUBLISHED.
- Registration opens only once the competition has a division, since a Climber chooses one to register.

Response: the competition, shaped like GET /api/gym-admin/competitions/{competitionId}.

Errors: 400 `VALIDATION_ERROR` with the message "Change at least one competition detail." when the body has none of these fields, 409 `DIVISION_REQUIRED` with `fields.registrationStatus` when registration would open on a competition without divisions, and 409 `COMPETITION_EXISTS` as for creation.

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

- `name` is required, up to 50 characters.

Response (201): the new division, shaped like one entry of the list above, with `climberCount` 0.

Errors: 409 `DIVISION_EXISTS` when the competition already has a division with that name, ignoring case.

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

#### GET /api/competitions

The List View: upcoming competitions, soonest first, one page at a time.

Query, every filter optional:
- `q`: search text, up to 100 characters. Up to five of its words are matched against the competition's name and location and its gym's name.
- `gymId`: one gym's competitions.
- `from`, `to`: dates as `YYYY-MM-DD`. Past dates are never shown, and `to` can't be before `from`.
- `registration`: `any` (the default) or `open`.
- `lat`, `lng`: a point to measure distances from. Both or neither.
- `radiusKm`: from 1 to 200. Only competitions whose gym's map pin is within it, measured from `lat` and `lng` or, without them, from the location the Climber saved at sign-up. Without either, the answer is 400 with `fields.radiusKm`. A gym without a pin keeps its competitions out of distance searches.
- `page` starts at 1, and `limit` is from 1 to 100, 20 by default.

Response:

```json
{
  "competitions": [
    {
      "_id": "string",
      "name": "string",
      "date": "YYYY-MM-DD",
      "location": "string",
      "gym": { "_id": "string", "name": "string" },
      "registrationStatus": "OPEN | CLOSED",
      "capacity": 120,
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

- `coordinates` is the gym's map pin, or, for a gym without one, a pin saved with the competition, or `null`.
- `distanceKm` is only sent when there's a point to measure from, and is `null` when the gym has no pin.

#### GET /api/competitions/map

The Map View: the same competitions and filters as the List View, without paging, up to 500.

Response:

```json
{
  "pins": [],
  "total": 1,
  "unmapped": 0,
  "pending": 0,
  "truncated": false
}
```

- `pins` are shaped like the List View's entries. A competition without a pin is placed at its address when the server's Google Maps key can find it. That place is only used for this answer.
- `unmapped` counts competitions with no map location. `pending` counts the ones whose address wasn't looked up yet: each request starts at most 20 lookups, and a refresh adds the rest. `truncated` is true when more competitions matched than were loaded.

#### GET /api/competitions/filters

Response:

```json
{
  "gyms": [{ "_id": "string", "name": "string", "location": "string", "competitionCount": 2 }],
  "registration": [
    { "value": "any", "label": "All upcoming competitions" },
    { "value": "open", "label": "Registration open" }
  ],
  "maxRadiusKm": 200,
  "hasSavedLocation": true
}
```

`gyms` lists the active gyms with upcoming published competitions.

#### GET /api/competitions/{competitionId}

Event Details (US-025 criterion 5). A past competition still opens, marked `upcoming: false`.

Response:

```json
{
  "_id": "string",
  "name": "string",
  "date": "YYYY-MM-DD",
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

A Climber who registered keeps seeing this even after the competition is cancelled or its gym is deactivated.

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

Not built yet (US-020, US-031, US-032).

#### GET /api/competitions/{competitionId}/leaderboard

Response:

```json
[
  {
    "rank": 1,
    "climberId": "string",
    "score": 100,
    "division": "Beginner"
  }
]
```

#### GET /api/climbers/{climberId}/scorecards?competitionId={id}

Response:

```json
{
  "competitionId": "string",
  "climberId": "string",
  "routesCompleted": 5,
  "routesUnfinished": 3,
  "score": 185,
  "results": [
    {
      "routeId": "string",
      "attempts": 3,
      "sends": 1,
      "flash": false,
      "officialScore": 25
    }
  ]
}
```

### 1.14 AI route assistant

Not built yet (US-023, US-033).

#### POST /api/ai/route-assistant

Request body:

```json
{
  "competitionId": "string",
  "userId": "string",
  "question": "Which V4 route was harder than expected?"
}
```

Response:

```json
{
  "answer": "Problem 11 had a much lower completion rate and higher average attempts than the other V4 routes.",
  "dataSources": [
    "official_results",
    "route_statistics"
  ],
  "confidence": "medium"
}
```

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

GET /api/health answers `{ "status": "ok", "database": "connected" }`, with `"disconnected"` while the API has no database connection, for hosting health checks.

GET /api/gyms/{gymId}/admin-candidates lists the active GYM_ADMIN accounts with an APPROVED request for the gym that aren't assigned to it yet. PUT /api/gyms/{gymId}/admins/{userId} assigns only such an account. Removing a Gym Administrator from a gym comes with US-007 in Iteration 2. Until then there's no DELETE /api/gyms/{gymId}/admins/{userId} route, so it answers 404.

## 2. Shared service interfaces

```ts
interface AuthService {
  login(email: string, password: string): Promise<AuthSession>;
  authorize(userId: string, requiredRole: Role): Promise<boolean>;
}

interface UserService {
  createClimber(input: CreateClimberInput): Promise<User>;
  requestGymAdminAccess(input: GymAdminRequestInput): Promise<GymAdminRequest>;
  approveGymAdminRequest(requestId: string, approverId: string, decision: string): Promise<void>;
}

interface CompetitionService {
  createCompetition(input: CreateCompetitionInput): Promise<Competition>;
  createDivision(competitionId: string, input: CreateDivisionInput): Promise<Division>;
  assignClimberToDivision(competitionId: string, divisionId: string, climberId: string): Promise<void>;
  createRoute(competitionId: string, input: CreateRouteInput): Promise<Route>;
}

interface RegistrationService {
  registerClimber(competitionId: string, climberId: string, divisionId: string): Promise<Registration>;
  validateCapacity(competitionId: string): Promise<boolean>;
}

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

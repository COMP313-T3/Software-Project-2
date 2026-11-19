
# TopSend

TopSend is our Software Development Project II (COMP313) application for managing local bouldering competitions.

The goal of TopSend is to make it easier for climbing gyms to organize competitions while giving climbers a place to find events, register, record their results, and check the leaderboard.

The application has different user roles, so each user can access the features they need.

## Main User Roles

TopSend has four types of users:

- **ADMIN** - Manages gyms, Gym Administrator accounts, users, access requests, and system settings.
- **GYM_ADMIN** - Creates and manages competitions for assigned gyms, manages routes and divisions, and records official results.
- **CLIMBER** - Finds competitions, registers for events, uses their scorecard, and checks leaderboards.
- **VISITOR** - Can view the landing page, create a Climber account, request Gym Administrator access, and view public leaderboards.

> VISITOR is not an actual account role. It refers to users who are not logged in.

---

# Current Features

TopSend includes the features completed during Iterations 1 and 2.

## Authentication and Accounts

- User login and logout
- Climber account registration
- Password reset
- Role-based access control
- Session handling
- reCAPTCHA protection
- Step-by-step onboarding for each user role
- Onboarding tips that users can open again

## System Administration

- Admin dashboard
- Create and manage gyms
- View and update gym information
- Manage Gym Administrator accounts
- Review Gym Administrator access requests
- Approve or reject access requests
- Assign and remove gym access
- Search, filter, edit, and deactivate user accounts
- System configuration and advanced settings
- Maintenance mode with a message displayed to logged-in users
- Login lock and Climber registration settings
- Email notifications for new Gym Administrator requests

## Gym Administration and Competition Management

- Gym Admin dashboard
- Create and manage competitions
- Set competition dates and start/end times
- Manage competition divisions
- View registered climbers
- View climber competition details
- Add and edit boulder routes
- Configure competition scoring
- Record, update, and delete official results
- Live leaderboard with division selection
- Competition display customization with logos, backgrounds, and sponsor images
- Route statistics showing completion rate, average attempts, and flash rate
- Competition history with past results and final leaderboards
- Public leaderboard support through the API

> Public leaderboard visibility can be configured through the API. The web application does not currently have a switch for this setting.

## Competition Discovery and Registration

- Discover available competitions
- Search and filter competitions
- Competition List View
- Competition Map View
- Google Maps integration
- View competition details
- Register for competitions
- Check registration status
- Competition start countdown
- Scorecard and leaderboard access when a competition starts
- Warnings before a competition ends
- Final leaderboard after scoring closes

## Climber Features

- My Events page
- View registered and past competitions
- Record attempts and sends using the scorecard
- Scorecard with interactive attempt circles
- View live competition standings
- View rankings for the climber's division
- Live scorecard and leaderboard updates
- Mobile-friendly layouts with collapsible sections

## AI Route Assistant

TopSend also includes an AI Route Assistant using Google Gemini.

The chatbot is available on selected competition pages.

**For Gym Administrators:**

- Route Statistics
- Result Entry
- Live Leaderboard

**For Climbers:**

- Scorecard
- Leaderboard

The AI Route Assistant can:

- Answer questions about competition results
- Explain route performance
- Use available V-grades, completion rates, flash rates, and average attempts
- Compare routes when enough data is available
- Explain limitations when there are not enough results
- Answer questions using the selected competition's available information

The chatbot opens as a panel, so users can continue viewing their competition page while asking questions.

The AI Route Assistant is read-only. It cannot change official scores, results, or route grades.

## Live Updates

TopSend uses live updates to keep competition information updated.

- Live leaderboard updates
- Scorecard updates
- Updated competition information
- Automatic page data updates without manually refreshing
- Protection against overwriting unsaved user input

---

# Tech Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- CSS Modules
- React Router
- Socket.IO Client
- Three.js
- React Day Picker
- Google Maps JavaScript API

## Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- Zod
- JWT authentication using jose
- argon2 password hashing
- Helmet
- CSRF protection
- Express rate limiting
- Socket.IO
- Nodemailer

## External Services

- MongoDB Atlas
- Google Maps API
- Google Geocoding API
- Google reCAPTCHA
- Amazon SES
- Google Gemini API

## Testing Tools

- Vitest
- React Testing Library
- Supertest
- Oxlint
- GitHub Actions

## Deployment

- **Frontend:** Netlify
- **Backend:** Render
- **Database:** MongoDB Atlas
- **Email:** Amazon SES

---

# Project Structure

```text
Software-Project-2/
│
├── client/                  # React frontend
│   ├── src/
│   ├── public/
│   ├── .env.example
│   └── package.json
│
├── server/                  # Express backend
│   ├── src/
│   │   ├── config/
│   │   ├── constants/
│   │   ├── controllers/
│   │   ├── emails/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── realtime/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── utils/
│   ├── postman/
│   ├── scripts/
│   ├── tests/
│   ├── .env.example
│   └── package.json
│
├── docs/
│   ├── Diagrams/
│   ├── Mvp/
│   ├── Project-Proposal/
│   ├── Requirements/
│   ├── Roles_and_Persona/
│   ├── Sprint1/
│   ├── Sprint2/
│   └── User_Stories/
│
├── specs/
│   ├── contracts/
│   ├── implementation-plan.md
│   └── specs.md
│
├── .github/
│   ├── agents/
│   ├── skills/
│   └── workflows/
│
├── scripts/
│   └── dev.mjs
│
├── README.md
└── package.json
```

---

# Requirements

Before running TopSend, make sure you have:

- Node.js 24 LTS recommended
- npm
- Git
- MongoDB Atlas access
- MongoDB connection string

Some features also require:

- Google Maps API key
- Google reCAPTCHA keys
- Amazon SES SMTP credentials
- Google Gemini API key

The application can run locally without every optional service, but some features may not work until their API keys are configured.

---

# Installation

## 1. Clone the Repository

Clone the TopSend repository from GitHub:

```bash
git clone https://github.com/COMP313-T3/Software-Project-2.git
```

Open the project folder:

```bash
cd Software-Project-2
```

If you already have the repository and want to update your local `dev` branch:

```bash
git switch dev
git pull origin dev
```

Make sure your local changes are saved before pulling.

## 2. Install Frontend Dependencies

From the main project folder:

```bash
npm ci --prefix client
```

## 3. Install Backend Dependencies

```bash
npm ci --prefix server
```

You can also use `npm install` if needed:

```bash
npm install --prefix client
npm install --prefix server
```

---

# Environment Setup

TopSend uses environment variables for database connections, authentication, API keys, and other services.

The actual `.env` files should not be committed to GitHub.

Use the `.env.example` files as a reference when setting up your local environment.

## Backend Environment

Create a file called:

```text
server/.env
```

You can copy the example file using PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

For basic local development, configure:

```env
PORT=4000
MONGODB_URI=your_mongodb_connection_string
CLIENT_ORIGINS=http://localhost:5173
NODE_ENV=development
APP_URL=http://localhost:5173
```

## MongoDB Atlas

TopSend uses MongoDB Atlas to store application information.

The connection string should include the TopSend database name.

Example:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/topsend?retryWrites=true&w=majority
```

Replace the placeholders with your own MongoDB connection information.

Never upload your real database credentials to GitHub.

## Authentication Secret

TopSend uses `AUTH_SECRET` for authentication and security tokens.

For local development, the server can generate a temporary secret if the value is empty.

To generate your own:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Add the generated value to `server/.env`:

```env
AUTH_SECRET=your_generated_secret
```

A permanent secret must be configured for production.

## Google reCAPTCHA

TopSend uses reCAPTCHA for account registration and Gym Administrator access requests.

For local development:

```env
RECAPTCHA_SECRET_KEY=
```

When left empty in development, the application uses a test configuration.

Production requires the correct reCAPTCHA key.

## Google Maps

Google Maps is used for competition discovery, location selection, and address features.

Backend configuration:

```env
GOOGLE_MAPS_SERVER_KEY=your_server_key
```

Some map and location features may be unavailable if the key is missing.

## Amazon SES Email

TopSend uses Amazon SES through SMTP for sending emails.

This includes:

- Password reset emails
- Gym Administrator access approvals
- Access request rejections
- Account setup emails

Example configuration:

```env
SMTP_HOST=your_amazon_ses_smtp_endpoint
SMTP_PORT=465
SMTP_USER=your_ses_smtp_username
SMTP_PASS=your_ses_smtp_password
MAIL_FROM=TopSend <your_verified_email@example.com>
```

Use the SMTP endpoint and credentials from your AWS region.

Port 465 uses TLS, while port 587 can use STARTTLS.

### Local Email Testing

For local development, AWS SES is not required.

You can leave these empty:

```env
SMTP_USER=
SMTP_PASS=
```

When these values are empty in development, email content and links are printed in the backend terminal instead of being sent.

This is useful when testing password reset and other email features locally.

---

# AI Route Assistant Setup

The AI Route Assistant uses the Google Gemini API.

The API is called through the backend, so the Gemini key is not sent to the browser.

## Setting Up Gemini

1. Open [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in using the Google account being used for TopSend.
3. Create a Gemini API key.
4. Open `server/.env`.
5. Add:

```env
GEMINI_API_KEY=your_gemini_api_key
```

6. Save the file.
7. Restart the backend.

The Gemini key is different from the Google Maps API key.

### Optional Gemini Settings

```env
GEMINI_MODEL=
GEMINI_THINKING_LEVEL=
```

These values are optional.

The current project configuration uses `gemini-3.5-flash-lite` by default.

If responses are getting cut off, the thinking level can be changed to:

```env
GEMINI_THINKING_LEVEL=low
```

If the Gemini API key is missing, the rest of TopSend can still run, but the chatbot will report that it has not been configured.

For the deployed backend on Render, set the Gemini API key in the service's environment settings.

**Never commit your Gemini API key to GitHub.**

---

# Frontend Environment

Create:

```text
client/.env
```

Using PowerShell:

```powershell
Copy-Item client/.env.example client/.env
```

For basic local development:

```env
VITE_API_BASE_URL=
VITE_RECAPTCHA_SITE_KEY=
VITE_GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAPS_MAP_ID=
```

## API URL

When developing locally, leave this empty:

```env
VITE_API_BASE_URL=
```

Vite forwards API requests to:

```text
http://localhost:4000
```

## Google Maps Browser Key

To enable map features:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
VITE_GOOGLE_MAPS_MAP_ID=your_google_maps_map_id
```

Do not place private server credentials in frontend environment variables.

Variables beginning with `VITE_` can be accessed from the browser.

---

# Running TopSend

Once the dependencies are installed and your environment files are ready, run:

```bash
npm run dev
```

This starts both the frontend and backend.

```text
Frontend: http://localhost:5173
Backend:  http://localhost:4000
```

The terminal should show output from both services:

```text
[client]
[server]
```

Open the frontend URL in your browser to use the application.

## Running the Backend Separately

From the main project folder:

```bash
npm run dev:server
```

Or:

```bash
cd server
npm run dev
```

The backend runs at:

```text
http://localhost:4000
```

To check the API:

```text
http://localhost:4000/api/health
```

## Running the Frontend Separately

From the main project folder:

```bash
npm run dev:client
```

Or:

```bash
cd client
npm run dev
```

The frontend normally runs at:

```text
http://localhost:5173
```

If port 5173 is already being used, Vite may start on another port.

## Stopping the Application

Press:

```text
Ctrl + C
```

If you're using `npm run dev` from the main folder, this stops both the frontend and backend processes.

---

# Testing

We completed the frontend and backend automated testing for Iteration 2 to check that the updated features and existing functionality were working properly.

The tests were run locally using VS Code on the `release/iteration-2` branch.

## Frontend Tests

Command:

```bash
npm test --prefix client
```

Results:

- Test Files: 144 passed
- Tests: 2734 passed
- Failed: 0
- Duration: 53.59 seconds

**Result: PASS**

The frontend tests covered different features, including login, account registration, password reset, competition discovery, maps, leaderboards, route statistics, result entry, onboarding, and other frontend components.

## Backend Tests

Command:

```bash
npm test --prefix server
```

Results:

- Test Files: 55 passed
- Test Files Skipped: 1
- Tests: 1443 passed
- Tests Skipped: 16
- Failed: 0
- Duration: 11.84 seconds

**Result: PASS**

The backend tests covered authentication, user permissions, competition management, scoring, registration, system settings, and other backend features.

Some tests were skipped by the test configuration, but all executed tests passed.

The registration tests requiring a real MongoDB replica set are skipped unless `REGISTRATION_TEST_MONGODB_URI` is configured.

More information about these tests can be found in:

```text
server/postman/README.md
```

## Overall Automated Test Results

| Category | Passed | Failed |
|----------|--------|--------|
| Frontend | 2734 | 0 |
| Backend | 1443 | 0 |
| **Total** | **4177** | **0** |

- Total Test Files Passed: 199
- Total Tests Passed: 4177
- Total Tests Skipped: 16
- Total Failed Tests: 0

**Overall Result: PASS**

All executed frontend and backend automated tests passed during our final Iteration 2 testing.

We also completed manual testing to check the main application features and user workflows.

---

# GitHub Actions CI

TopSend uses GitHub Actions to automatically run frontend and backend tests.

We ran the CI workflow on the `release/iteration-2` branch after pushing the updated code to GitHub.

## Iteration 2 CI Results

- Workflow: TopSend CI
- Branch: `release/iteration-2`
- Frontend Tests: PASS
- Backend Tests: PASS
- Failed Jobs: 0
- Overall CI Result: PASS

The GitHub Actions workflow completed successfully in 1 minute and 52 seconds.

This confirmed that the frontend and backend test jobs were also passing on GitHub.

**CI Evidence:**

[TopSend Iteration 2 GitHub Actions Run](https://github.com/COMP313-T3/Software-Project-2/actions/runs/44608681173)

---

# Linting

To run frontend linting:

```bash
npm run lint --prefix client
```

To run backend linting:

```bash
npm run lint --prefix server
```

These commands help check the code for common issues.

---

# Building the Frontend

To check the production build:

```bash
npm run build --prefix client
```

The generated files will be saved in:

```text
client/dist/
```

To preview the production build locally:

```bash
npm run preview --prefix client
```

---

# Development Workflow

Our team uses a Gitflow-style workflow to organize development and releases.

## Feature Development

```text
feature/*
    |
    v
   dev
    |
    v
 release/*
    |
    v
   main
```

New features are developed in separate branches before being merged into `dev`.

Once the features for an iteration are ready, they are brought into a release branch for final testing.

After testing and review, the release branch can be merged into `main`.

## Bug Fixes

```text
dev
 |
 v
fix/*
 |
 v
dev
```

Bug fixes are normally created in separate branches and merged back into `dev`.

## Hotfixes

```text
main
 |
 v
hotfix/*
 |
 v
main
 |
 v
dev
```

Urgent production fixes can be handled using hotfix branches.

Pull Requests are used to review changes before merging into shared branches.

---

# Documentation

Project documentation can be found inside the `docs` and `specs` folders.

## Project Documentation

```text
docs/
├── Project-Proposal/
├── Requirements/
├── User_Stories/
├── Roles_and_Persona/
├── Mvp/
├── Diagrams/
├── Sprint1/
└── Sprint2/
```

These folders include the project proposal, requirements, user stories, diagrams, sprint planning, progress reports, and testing documentation.

## Development Specifications

```text
specs/
├── specs.md
├── implementation-plan.md
└── contracts/
```

These documents contain the technical specifications, implementation plans, domain rules, and API information used during development.

---

# Important Notes

- Never commit `.env` files to GitHub.
- Never upload MongoDB passwords.
- Never commit AWS SES credentials.
- Never expose the Gemini API key.
- Keep private API keys on the backend.
- Use `.env.example` files with placeholder values.
- Frontend variables beginning with `VITE_` are visible in the browser.
- Check your Git branch before making changes.
- Make sure your local changes are saved before pulling or merging updates.
- Use Pull Requests when merging into shared branches.

---

# Project Status

TopSend has completed the planned work for Iterations 1 and 2.

## Iteration 1

Iteration 1 focused on the main foundation of the application.

This included:

- Authentication and role-based access
- Admin and Gym Admin features
- Competition creation and management
- Divisions and climber management
- Route setup
- Scoring configuration
- Competition discovery
- Competition List and Map Views
- Event registration
- Registration status

## Iteration 2

Iteration 2 focused on completing more competition features, improving the user experience, and making sure the application was working properly.

This included:

- Live leaderboards
- Climber scorecards
- Result entry and scoring improvements
- Route statistics
- Competition history
- AI Route Assistant
- Onboarding tutorials
- System settings and maintenance mode
- UI and mobile layout improvements
- Live updates
- Bug fixes and final testing

We also updated the project documentation and completed the automated and manual testing.

### Final Iteration 2 Testing

- Frontend: 2734 passed
- Backend: 1443 passed
- Total: 4177 passed
- Failed: 0
- GitHub Actions: PASS
- Manual Testing: Completed

The Iteration 2 automated tests completed with no failures, and our final manual testing was completed successfully.

The `release/iteration-2` branch is ready for final review and merging into `main`.

---

# Team

TopSend was developed as part of the Software Development Project II (COMP313) course at Centennial College.

Our team worked together on the frontend, backend, integration, testing, documentation, and deployment of the application.

| Team Member | Role / Responsibilities |
|---|---|
| **Brian** | Frontend Development |
| **Ruisheng** | Frontend and Backend Development |
| **Joseph** | Backend Development |
| **Richard** | Backend Development |
| **Gab** | Frontend Development, Integration, and Bug Fixes |
| **Andrew** | Scrum Master and Documentation |

Everyone contributed to the project by working on their assigned tasks, fixing issues, and helping prepare TopSend for each iteration.

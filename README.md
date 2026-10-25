# TopSend

TopSend is our Software Project 2 application for managing local bouldering competitions.

The main goal of TopSend is to make it easier for climbing gyms to create and manage competitions while also giving Climbers one place to discover events, register, and check their competition information.

The project uses different roles so each type of user only has access to the features they are allowed to use.

## Main User Roles

TopSend currently uses the following roles:

- **ADMIN** — manages gyms, Gym Administrators, access requests, and system-level features.
- **GYM_ADMIN** — manages competitions for their assigned gym.
- **CLIMBER** — discovers competitions, registers for events, and accesses Climber features.
- **VISITOR** — a public user who has not logged in yet. Visitors can create a Climber account or request Gym Administrator access.

> `VISITOR` is not stored as an account role. It represents someone using the public parts of the application.

---

# Current Features

The current TopSend implementation includes the main features completed during Iteration 1.

### Authentication and Accounts

- User login
- Climber account creation
- Password reset
- Role-based access
- Session handling
- Logout
- reCAPTCHA protection

### System and Gym Administration

- Admin dashboard
- Manage gyms
- View and update gym details
- Manage Gym Administrators
- Submit Gym Administrator access requests
- Review and approve/reject Gym Administrator requests

### Competition Management

- Gym Admin dashboard
- Create competitions
- View and update competition details
- Manage competition divisions
- View and manage registered Climbers
- View Climber competition details
- Add boulder problems/routes
- View and edit route details
- Configure competition scoring format

### Competition Discovery and Registration

- Discover competitions
- Search and filter competitions
- Competition List View
- Competition Map View
- Google Maps integration
- Event registration
- Registration status

### Planned Features

Later development includes features such as:

- Result entry
- Live leaderboard
- Display customization
- Route statistics
- Competition history
- Climber scorecards
- Rankings
- AI Route Assistant for Gym Administrators
- AI Route Assistant for Climbers

---

# Tech Stack

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Google Maps JavaScript API

## Backend

- Node.js
- Express
- MongoDB
- Mongoose
- Zod
- JWT authentication
- Nodemailer

## External Services

- MongoDB Atlas
- Google Maps API
- Google Geocoding API
- Google reCAPTCHA
- Amazon SES for email through SMTP
- Anthropic Claude API for planned AI features

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
├── client/                 # React frontend
│   ├── src/
│   ├── public/
│   ├── .env.example
│   └── package.json
│
├── server/                 # Express backend
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── utils/
│   ├── tests/
│   ├── .env.example
│   └── package.json
│
├── docs/                   # Project documentation
│   ├── Mvp/
│   ├── Project-Proposal/
│   ├── Requirements/
│   ├── Roles_and_Persona/
│   └── User_Stories/
│
├── specs/                  # Specs-driven development documents
│   ├── contracts/
│   ├── implementation-plan.md
│   └── specs.md
│
├── .github/
│   ├── agents/             # TopSend Copilot agents
│   └── skills/             # Specs and TopSend project skills
│
├── scripts/
│   └── dev.mjs             # Runs frontend and backend together
│
└── package.json
```

---

# Requirements

Before running the project, make sure you have:

- **Node.js 24 LTS recommended**
- npm
- Git
- MongoDB Atlas access
- A MongoDB connection string

Some features also need:

- Google Maps API key
- Google reCAPTCHA keys
- Amazon SES SMTP credentials

The application can still run locally without all of these optional services, but some features such as Maps or real email sending may be unavailable.

---

# Installation

## 1. Clone the Repository

```bash
git clone <YOUR_REPOSITORY_URL>
```

Move into the project folder:

```bash
cd Software-Project-2
```

If you already have the repository cloned, update your local `dev` branch instead:

```bash
git switch dev
git pull origin dev
```

---

## 2. Install the Frontend Packages

From the main TopSend folder, run:

```bash
npm ci --prefix client
```

---

## 3. Install the Backend Packages

```bash
npm ci --prefix server
```

You can also use `npm install` instead of `npm ci` if needed:

```bash
npm install --prefix client
npm install --prefix server
```

---

# Environment Setup

The real `.env` files should never be committed to GitHub.

The repository only contains `.env.example` files showing which variables are needed.

## Backend Environment

Create:

```text
server/.env
```

The easiest way in PowerShell is:

```powershell
Copy-Item server/.env.example server/.env
```

At minimum, you need to add your MongoDB connection:

```env
PORT=4000

MONGODB_URI=your_mongodb_connection_string

CLIENT_ORIGINS=http://localhost:5173

NODE_ENV=development

APP_URL=http://localhost:5173
```

### MongoDB

Your `MONGODB_URI` should include the TopSend database name.

Example format:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/topsend?retryWrites=true&w=majority
```

Do not copy a real database username or password into GitHub.

---

## Authentication Secret

`AUTH_SECRET` is used to sign authentication and security tokens.

During development it can be left empty and the server will create a temporary secret each time it starts.

You can also generate one with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Then add it:

```env
AUTH_SECRET=your_generated_secret
```

Production requires this value to be set.

---

## Google reCAPTCHA

The application uses reCAPTCHA for account registration and Gym Administrator access requests.

For normal local development, these can be left empty:

```env
RECAPTCHA_SECRET_KEY=
```

When empty in development, TopSend uses Google's test reCAPTCHA configuration.

For production, the real key must be configured.

---

## Google Maps

The backend uses a Google Maps server key for address and geocoding features.

```env
GOOGLE_MAPS_SERVER_KEY=your_server_key
```

If this is left empty, the application can still run, but some map and address lookup features will be limited.

---

## Amazon SES Email

TopSend uses Amazon SES through SMTP for emails such as:

- password reset links
- Gym Administrator request approvals
- Gym Administrator request rejections
- account setup emails

Example:

```env
SMTP_HOST=your_amazon_ses_smtp_endpoint
SMTP_PORT=587

SMTP_USER=your_ses_smtp_username
SMTP_PASS=your_ses_smtp_password

MAIL_FROM=TopSend <your_verified_email@example.com>
```

Use the SMTP endpoint and credentials from the AWS region being used by the project.

### Local Email Testing

You do not need AWS SES just to run the application locally.

If these are empty:

```env
SMTP_USER=
SMTP_PASS=
```

development mode prints the email and its link directly in the backend terminal instead of sending a real email.

This makes password reset and other email flows easier to test locally.

---

# Frontend Environment

Create:

```text
client/.env
```

In PowerShell:

```powershell
Copy-Item client/.env.example client/.env
```

For basic local development, most of these values can stay empty.

```env
VITE_API_BASE_URL=

VITE_RECAPTCHA_SITE_KEY=

VITE_GOOGLE_MAPS_API_KEY=

VITE_GOOGLE_MAPS_MAP_ID=
```

### API URL

Leave this empty when running locally:

```env
VITE_API_BASE_URL=
```

Vite automatically forwards `/api` requests to:

```text
http://localhost:4000
```

---

## Google Maps Browser Key

To use the Competition Map View and location features:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
VITE_GOOGLE_MAPS_MAP_ID=your_google_maps_map_id
```

Never put private server secrets in the frontend `.env`.

Vite variables beginning with `VITE_` are available in the browser.

---

# Running the Application

## Recommended Method

After the frontend and backend packages are installed and the environment files are ready, run this from the main project folder:

```bash
npm run dev
```

This starts both:

```text
Frontend → http://localhost:5173
Backend  → http://localhost:4000
```

The terminal output is labelled:

```text
[client]
[server]
```

The application should automatically open in your browser after the frontend and backend are ready.

---

# Running Frontend and Backend Separately

You can also run them separately.

## Backend

From the root folder:

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

To check if the API is working, open:

```text
http://localhost:4000/api/health
```

---

## Frontend

From the root folder:

```bash
npm run dev:client
```

Or:

```bash
cd client
npm run dev
```

The frontend runs at:

```text
http://localhost:5173
```

---

# Stopping the Application

Press:

```text
Ctrl + C
```

in the terminal running the project.

When using the root:

```bash
npm run dev
```

one `Ctrl + C` stops both the frontend and backend.

---

# Testing

TopSend currently includes frontend and backend automated tests.

## Frontend Tests

From the root folder:

```bash
npm test --prefix client
```

Or:

```bash
cd client
npm test
```

---

## Backend Tests

From the root folder:

```bash
npm test --prefix server
```

Or:

```bash
cd server
npm test
```

---

# Linting

## Frontend

```bash
npm run lint --prefix client
```

## Backend

```bash
npm run lint --prefix server
```

---

# Building the Frontend

To check that the frontend can build successfully for production:

```bash
npm run build --prefix client
```

The production files will be generated inside:

```text
client/dist/
```

You can preview the production build locally with:

```bash
npm run preview --prefix client
```

---

# Development Workflow

The project uses a Gitflow-style workflow.

New User Story work normally follows:

```text
feature/*
    ↓
   dev
    ↓
release/*
    ↓
   main
```

Bug fixes found during development normally follow:

```text
dev
 ↓
fix/*
 ↓
dev
```

Urgent production fixes can use:

```text
main
 ↓
hotfix/*
 ↓
main
 ↓
dev
```

Pull Requests are used before changes are merged into the shared branches.

---

# Documentation

More information about the project can be found inside the `docs` and `specs` folders.

### Project Documentation

```text
docs/Project-Proposal/Project-Proposal.md
docs/Requirements/requirements.md
docs/User_Stories/User_Stories.md
docs/Roles_and_Persona/Roles_and_Persona.md
docs/Mvp/mvp.md
```

### Development Specifications

```text
specs/specs.md
specs/implementation-plan.md
specs/contracts/
```

The specification files are used as a development reference for the project requirements, domain rules, APIs, model relationships, and Iteration planning.

---

# Important Notes

- Never commit `.env` files.
- Never commit MongoDB passwords.
- Never commit AWS SES credentials.
- Never commit Google API secret keys.
- Frontend `VITE_` keys are visible in the browser, so only public browser keys belong there.
- Use `.env.example` to show the required variables without exposing real credentials.
- Make sure your local `dev` branch is updated before creating a new feature or fix branch.

---

# Project Status

TopSend completed the main Iteration 1 workflow, including:

```text
Authentication
      ↓
Admin / Gym Management
      ↓
Competition Setup
      ↓
Divisions + Climbers
      ↓
Routes
      ↓
Scoring Configuration
      ↓
Competition Discovery
      ↓
List + Map View
      ↓
Event Registration
      ↓
Registration Status
```

The remaining features are planned for the next development iteration.
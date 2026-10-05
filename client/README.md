# TopSend web app

React with TypeScript, built with Vite and styled with Tailwind CSS. Use Node.js 24 LTS.

## Setup

1. Start the API first. See `server/README.md`.
2. Install packages: `npm install`
3. Start the app: `npm run dev`
4. Open http://localhost:5173, which opens the log in page. Logging in opens the dashboard at `/dashboard`.

To run the app and the API together, run `npm run dev` in the TopSend folder instead. Each line of output is labelled [client] or [server], and one Ctrl+C stops both. Once both are ready (the API has connected to the database), it opens the app in your default browser, in a new tab each time it starts. To turn that off, add `BROWSER=none` to `client/.env`. In Command Prompt, Windows still asks "Terminate batch job (Y/N)?" because npm itself is a batch file there; PowerShell, the VS Code default, doesn't ask, and neither does `node --run dev`.

In development, the Vite server forwards every request under `/api` to the API at http://localhost:4000. The app and the API then share one origin, so cookies work with no extra setup. If you change the API's port, change the proxy in `vite.config.ts` to match.

## Scripts

- `npm run dev`: start the dev server with hot reload
- `npm run build`: type-check and build for production into `dist/`. Vite warns that one chunk is larger than 500 kB. That chunk is three.js for the fog on the log in page, and it only loads there, once the page is idle.
- `npm run preview`: serve the production build locally
- `npm test`: run the tests
- `npm run lint`: check the code with Oxlint

## Structure

- `src/main.tsx`: entry point. Wraps the app in the router.
- `src/App.tsx`: every page route. Add new pages here, and wrap a page that needs a login in `RequireSession`.
- `src/pages/`: one component per page.
- `src/components/`: components used by the pages, grouped by feature. `auth/` holds the log in, forgot password, reset password, and create account forms, the climbing mascot, and `LoginFog`, the fog along the bottom of the page that the mouse sweeps away. It's drawn with three.js (`fogScene.ts`, `fogShader.ts`, and `fogSweep.ts`). `legal/` holds the Terms and Conditions and the Privacy Policy, shown in a pop-up during sign-up and at `/terms` and `/privacy`. `session/` holds `SessionProvider`, which wraps the app; `useSession`, which tells a page who is logged in and offers `logIn` and `logOut`; `RequireSession`, which sends anyone not logged in to the log in page and brings them back afterwards; and the warning shown before an idle session ends. `common/` holds small shared parts, such as `Tooltip`.
- `src/lib/apiClient.ts`: the only place that calls `fetch`. Use `apiRequest` for every API call. It sends cookies, times out after 10 seconds, retries failed reads, and throws an `ApiError` with the API's error code and message.
- `src/lib/usersApi.ts`: calls for the `/api/users` routes, such as creating a climber account.
- `src/lib/authApi.ts`: calls for the `/api/auth` routes: asking for a reset link, checking it, and saving the new password.
- `src/lib/sessionApi.ts`: calls for logging in, refreshing, logging out, the current user, and the keep-alive.
- `src/lib/sessionClient.ts`: keeps the access token in memory only, never in browser storage, and refreshes it with the refresh cookie when it runs out. It sends the CSRF token that login, refresh, and log out need, and refreshes in one tab at a time.
- `src/lib/sessionTimer.ts`, `sessionStore.ts`, and `sessionChannel.ts`: the session timeout. A login ends after 60 minutes without activity (the API's `SESSION_IDLE_MINUTES`) and 12 hours after logging in. Activity sends a keep-alive at most every 5 minutes, a warning with a countdown appears 2 minutes before the end on pages that need a login, and every tab shares the timer and logs out together. When a session ends, keys starting with `topsend.` in browser storage are deleted, so name any key the app stores that way.
- `src/lib/recaptcha.ts`: loads Google's reCAPTCHA script once, for the create account form.
- `src/lib/googleMaps.ts`: loads Google Maps once, and handles the address suggestions and the map used at sign-up.
- `src/lib/geocodeApi.ts`: calls for the `/api/geocode` routes, which look up the address of a picked suggestion or a point on the map.
- `src/content/legal.ts`: version, effective date, operator and contact email shown on the legal pages.
- `src/constants/`: shared values, such as the account roles, countries and genders.
- `public/`: files served as they are: the browser tab icon (`favicon.ico`, in 16, 32 and 48 pixels) and the home screen icon for phones (`apple-touch-icon.png`), both made from the TopSend badge. Browsers keep tab icons for a long time, so when the icon changes, raise the `?v=` number on its link in `index.html`.

## Tests

Every test starts logged out, without reaching the API: `src/test/setup.ts` replaces `src/lib/sessionApi.ts` with stand-ins. A test that needs a login sets what they answer, as `src/pages/Session.test.tsx` does.

## Environment

Copy `.env.example` to `.env` only if you need to change a setting. Everything in it ends up in the browser, so never put a secret there.

While `VITE_RECAPTCHA_SITE_KEY` is empty, development uses Google's reCAPTCHA test key, so the box says it is for testing only and every check passes. A production build needs the real site key.

While `VITE_GOOGLE_MAPS_API_KEY` is empty, Address is a plain text box with no suggestions and no Choose on map button. Put a Maps key in `.env` to turn them on. Picking a suggestion or a map pin fills in the address through the API, which also needs `GOOGLE_MAPS_SERVER_KEY` in `server/.env`.

# TopSend web app

React with TypeScript, built with Vite and styled with Tailwind CSS. Use Node.js 24 LTS.

## Setup

1. Start the API first. See `server/README.md`.
2. Install packages: `npm install`
3. Start the app: `npm run dev`
4. Open http://localhost:5173

In development, the Vite server forwards every request under `/api` to the API at http://localhost:4000. The app and the API then share one origin, so cookies work with no extra setup. If you change the API's port, change the proxy in `vite.config.ts` to match.

## Scripts

- `npm run dev`: start the dev server with hot reload
- `npm run build`: type-check and build for production into `dist/`
- `npm run preview`: serve the production build locally
- `npm test`: run the tests
- `npm run lint`: check the code with Oxlint

## Structure

- `src/main.tsx`: entry point. Wraps the app in the router.
- `src/App.tsx`: every page route. Add new pages here.
- `src/pages/`: one component per page.
- `src/lib/apiClient.ts`: the only place that calls `fetch`. Use `apiRequest` for every API call. It sends cookies, times out after 10 seconds, retries failed reads, and throws an `ApiError` with the API's error code and message.
- `src/constants/`: shared values, such as the account roles.

## Environment

Copy `.env.example` to `.env` only if you need to change a setting. Everything in it ends up in the browser, so never put a secret there.

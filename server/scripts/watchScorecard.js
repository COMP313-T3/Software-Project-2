// Watches a Climber's live scorecard (US-031) in the terminal, to test live updates without the
// frontend. Postman's Socket.IO requests can't send the login token the way the server expects
// (in the handshake's auth), so this uses the same Socket.IO client the web app uses.
//
// One-time setup, from the server folder:   npm install --save-dev socket.io-client
// Run:   node scripts/watchScorecard.js <climberAccessToken> <competitionId> [apiUrl]
//   apiUrl defaults to http://localhost:5000.
// Add --leaderboard to watch the live leaderboard (US-020) instead, for example to check that it
// keeps updating more than 15 minutes after connecting. Press Ctrl+C to stop.

import { io } from "socket.io-client";

const args = process.argv.slice(2);
const leaderboard = args.includes("--leaderboard");
const [token, competitionId, apiUrl = "http://localhost:5000"] = args.filter((arg) => arg !== "--leaderboard");

if (!token || !competitionId) {
  console.log("Usage: node scripts/watchScorecard.js <accessToken> <competitionId> [apiUrl] [--leaderboard]");
  process.exit(1);
}

const kind = leaderboard ? "leaderboard" : "scorecard";
const startedAt = Date.now();
const time = () => {
  const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
  return `[${new Date().toLocaleTimeString()} | ${minutes} min]`;
};

function printScorecard(scorecard) {
  const { summary } = scorecard;
  console.log(
    `  ${scorecard.competition.name}: ${summary.completed} completed, ${summary.unfinished} unfinished, ` +
      `${summary.flashes} flashes, ${summary.totalScore} points`,
  );
  for (const route of scorecard.routes) {
    const result = route.result
      ? `${route.result.attempts} attempt(s), ${route.result.officialScore} points`
      : "no result yet";
    console.log(`    Route ${route.routeNumber.padEnd(4)} ${route.grade.padEnd(4)} ${route.status.padEnd(14)} ${result}`);
  }
}

function printLeaderboard(board) {
  console.log(`  ${board.competition.name} (${board.audience} view)`);
  for (const division of board.divisions) {
    console.log(`    ${division.name}:`);
    for (const entry of division.standings.slice(0, 5)) {
      console.log(`      ${entry.rank}. ${entry.climber.firstName} ${entry.climber.lastName} - ${entry.totalScore}`);
    }
  }
}

const show = leaderboard ? printLeaderboard : printScorecard;
const socket = io(`${apiUrl}/${kind}`, { auth: { token } });

socket.on("connect", () => {
  console.log(`${time()} Connected. Joining the ${kind}...`);
  socket.emit(`${kind}:join`, { competitionId }, (ack) => {
    if (!ack.ok) {
      console.log(`${time()} Join refused: ${ack.error.error} - ${ack.error.message}`);
      return;
    }
    console.log(`${time()} Joined. Current ${kind}:`);
    show(ack[kind]);
    console.log("Waiting for updates. Save a result as the Gym Admin in Postman now.\n");
  });
});

socket.on(`${kind}:update`, (update) => {
  console.log(`${time()} UPDATE (${update.reason ?? "change"}):`);
  show(update[kind]);
  console.log("");
});

socket.on(`${kind}:closed`, (closed) => {
  console.log(`${time()} CLOSED: ${closed.error} - ${closed.message}`);
});

socket.on("connect_error", (error) => {
  const data = error.data ?? { error: "CONNECTION_FAILED", message: error.message };
  console.log(`${time()} Connection refused: ${data.error} - ${data.message}`);
  if (error.data) process.exit(1);
});

socket.on("disconnect", (reason) => {
  console.log(`${time()} Disconnected (${reason}). Socket.IO will try to reconnect...`);
});

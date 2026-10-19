import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { createEventRegistrationFixture } from "../tests/fixtures/eventRegistrationFixture.js";
import "../src/config/database.js";

// Never reads .env. Only a dedicated loopback replica set can be used by this demo.
const uri = process.env.US028_DEMO_MONGODB_URI ?? "mongodb://127.0.0.1:27046/?replicaSet=topsend-us028";
const target = new URL(uri);
if (target.protocol !== "mongodb:" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) throw new Error("US028 demo requires a dedicated loopback MongoDB URI.");
const database = "topsend_us028_demo_" + randomUUID().replaceAll("-", "");
target.pathname = "/" + database;
const output = resolve(process.argv[2] ?? resolve(tmpdir(), "topsend-us028-demo"));
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fromRepository = relative(repository, output);
if (!fromRepository || (!fromRepository.startsWith(".." + sep) && !fromRepository.startsWith("..\\") && !fromRepository.startsWith("../"))) throw new Error("Export demo credentials outside the repository.");
await mongoose.connect(target.href, { serverSelectionTimeoutMS: 10000 });
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
if (!hello.setName) { await mongoose.disconnect(); throw new Error("Start the dedicated local MongoDB replica set first; see server/postman/README.md."); }
const fixture = await createEventRegistrationFixture();
const values = {
  baseUrl: "http://127.0.0.1:4428", email: fixture.users[0].email, password: fixture.password,
  climberId: String(fixture.users[0]._id), otherClimberId: String(fixture.users[1]._id),
  gymAdminEmail: fixture.users[12].email, systemAdminEmail: fixture.users[13].email,
  competitionId: String(fixture.events.open.competition._id), divisionId: String(fixture.events.open.division._id),
  foreignDivisionId: String(fixture.events.open.division._id), csrfToken: "", accessToken: "", gymAdminToken: "", systemAdminToken: "",
};
for (const [name, event] of Object.entries(fixture.events)) {
  values[name + "CompetitionId"] = String(event.competition._id);
  values[name + "DivisionId"] = String(event.division._id);
}
await mkdir(output, { recursive: true });
const environmentPath = resolve(output, "US028-local.postman_environment.json");
const app = createApp({ clientOrigins: ["http://127.0.0.1:4428"], authSecret: randomUUID(), mailer: null });
const server = app.listen(4428, "127.0.0.1");
try {
  await new Promise((done, reject) => { server.once("listening", done); server.once("error", reject); });
} catch (error) { await mongoose.disconnect(); throw error; }
// A second launch must not overwrite the environment of an already running demo.
await writeFile(environmentPath, JSON.stringify({
  id: randomUUID(), name: "US028 isolated local demo", _postman_variable_scope: "environment",
  values: Object.entries(values).map(([key, value]) => ({ key, value, enabled: true, type: /password|Token/.test(key) ? "secret" : "default" })),
}, null, 2));
console.log("US028 local API ready: http://127.0.0.1:4428");
console.log("Database: " + database + " (dedicated local fixture; no team .env used)");
console.log("Postman environment: " + environmentPath);
console.log("Import server/postman/US028.postman_collection.json and this environment, then run the collection in order.");
console.log("For a clean repeat, stop this process and start it again; import the new environment.");
async function close() { server.close(); await mongoose.disconnect(); process.exit(0); }
process.once("SIGINT", close); process.once("SIGTERM", close);

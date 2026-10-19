import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { User } from "../../src/models/User.js";
import { Gym } from "../../src/models/Gym.js";
import { Competition } from "../../src/models/Competition.js";
import { Division } from "../../src/models/Division.js";
import { Registration } from "../../src/models/Registration.js";
import { hashPassword } from "../../src/services/passwordService.js";

/** Synthetic local/test data only. Caller must already be connected to its own empty database. */
export async function createEventRegistrationFixture() {
  const password = "Local-" + randomBytes(16).toString("hex") + "!";
  const passwordHash = await hashPassword(password);
  const users = Array.from({ length: 14 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(), email: `us028-${i}@example.com`, firstName: "Local", lastName: `Climber ${i}`,
    role: i === 12 ? "GYM_ADMIN" : i === 13 ? "ADMIN" : "CLIMBER", passwordHash, isActive: true,
  }));
  // The fixture is deliberately not a public account-creation flow; no external email or maps.
  await User.collection.insertMany(users);
  const gyms = await Gym.create([
    { name: "US028 Local Gym", location: "Toronto", status: "ACTIVE", adminIds: [users[12]._id] },
    { name: "US028 Inactive Gym", location: "Ottawa", status: "INACTIVE", adminIds: [] },
  ]);
  async function makeEvent(overrides = {}) {
    const competition = await Competition.create({
      gymId: gyms[0]._id, name: "US028 " + randomBytes(6).toString("hex"), date: new Date("2100-11-01T00:00:00Z"),
      location: "Toronto", description: "Isolated local registration fixture.", capacity: 3,
      status: "PUBLISHED", registrationStatus: "OPEN", createdBy: users[12]._id, ...overrides,
    });
    const division = await Division.create({ competitionId: competition._id, name: "Open" });
    return { competition, division };
  }
  const events = {};
  events.open = await makeEvent({ name: "US028 Registration Demo" });
  events.validation = await makeEvent({ name: "US028 Validation Demo" });
  events.closed = await makeEvent({ name: "US028 Closed", registrationStatus: "CLOSED" });
  events.full = await makeEvent({ name: "US028 Full", capacity: 1 });
  events.past = await makeEvent({ name: "US028 Past", date: new Date("2000-01-01T00:00:00Z") });
  events.draft = await makeEvent({ name: "US028 Draft", status: "DRAFT", registrationStatus: "CLOSED" });
  events.cancelled = await makeEvent({ name: "US028 Cancelled", status: "CANCELLED" });
  events.inactive = await makeEvent({ name: "US028 Inactive", gymId: gyms[1]._id });
  await Registration.create({ competitionId: events.full.competition._id, divisionId: events.full.division._id, climberId: users[1]._id, status: "CONFIRMED" });
  await Promise.all([User.init(), Gym.init(), Competition.init(), Division.init(), Registration.init()]);
  return { users, password, gyms, events, makeEvent };
}

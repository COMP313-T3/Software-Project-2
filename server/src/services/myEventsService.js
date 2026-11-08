import { Registration } from "../models/Registration.js";

/**
 * The logged-in Climber's registered events (US-030). Registrations are always scoped to the
 * identity from the access token, and the associated competition is included even if it is no
 * longer available in discovery.
 *
 * @param {string} userId The Climber, from the access token.
 * @returns {Promise<{ events: object[] }>} The Climber's registrations and their competitions.
 */
export async function getMyEvents(userId) {
  const registrations = await Registration.find(
    { climberId: userId },
    "competitionId divisionId status registeredAt",
  )
    .populate([
      {
        path: "competitionId",
        select: "gymId name date location status registrationStatus",
        populate: { path: "gymId", select: "name" },
      },
      { path: "divisionId", select: "name" },
    ])
    .lean();

  return {
    events: registrations.map((registration) => {
      const competition = registration.competitionId;
      const gym = competition.gymId;
      const division = registration.divisionId;

      return {
        competition: {
          _id: String(competition._id),
          name: competition.name,
          date: competition.date.toISOString().slice(0, 10),
          location: competition.location,
          gym: gym ? { _id: String(gym._id), name: gym.name } : null,
          status: competition.status,
          registrationStatus: competition.registrationStatus,
        },
        registration: {
          registrationId: String(registration._id),
          status: registration.status,
          registeredAt: registration.registeredAt,
          division: division
            ? { _id: String(division._id), name: division.name }
            : null,
        },
      };
    }),
  };
}

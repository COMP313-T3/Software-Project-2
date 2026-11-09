import { REGISTRATION_RECORD_STATUS } from "../constants/competitions.js";
import { Registration } from "../models/Registration.js";
import { parseCalendarDate, torontoToday } from "../utils/calendarDates.js";

const ACTIVE_GYM = "ACTIVE";

/** How each registration state reads on the page, as on the US-029 status page. */
const STATUS_LABELS = Object.freeze({
  [REGISTRATION_RECORD_STATUS.CONFIRMED]: "Confirmed",
  [REGISTRATION_RECORD_STATUS.WAITLIST]: "On the waitlist",
  [REGISTRATION_RECORD_STATUS.PENDING]: "Pending",
});

/**
 * The logged-in Climber's registered events (US-030): upcoming ones soonest first, then past ones
 * most recent first. Registrations are always matched on the identity from the access token. A
 * competition that was cancelled, or whose gym was deactivated, is still listed, as on the US-029
 * status page, so the Climber finds out: competition.status and gym.active say so. A registration
 * whose competition no longer exists is left out instead of failing the whole list.
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
        populate: { path: "gymId", select: "name status" },
      },
      { path: "divisionId", select: "name" },
    ])
    .lean();

  const today = parseCalendarDate(torontoToday()).date;
  const events = registrations
    .filter((registration) => registration.competitionId?._id && registration.competitionId.date)
    .map((registration) => {
      const competition = registration.competitionId;
      const gym = competition.gymId?._id ? competition.gymId : null;
      const division = registration.divisionId?._id ? registration.divisionId : null;

      return {
        competition: {
          _id: String(competition._id),
          name: competition.name,
          date: competition.date.toISOString().slice(0, 10),
          location: competition.location,
          gym: gym
            ? { _id: String(gym._id), name: gym.name, active: gym.status === ACTIVE_GYM }
            : null,
          status: competition.status,
          upcoming: competition.date >= today,
          registrationStatus: competition.registrationStatus,
        },
        registration: {
          registrationId: String(registration._id),
          status: registration.status,
          statusLabel: STATUS_LABELS[registration.status] ?? registration.status,
          registeredAt: registration.registeredAt,
          division: division ? { _id: String(division._id), name: division.name } : null,
        },
      };
    })
    .sort((a, b) => {
      const [first, second] = [a.competition, b.competition];
      if (first.upcoming !== second.upcoming) return first.upcoming ? -1 : 1;
      const byDate = first.date.localeCompare(second.date);
      return first.upcoming ? byDate : -byDate;
    });

  return { events };
}

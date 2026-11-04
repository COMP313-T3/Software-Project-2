/**
 * Who can create or change an official result (US-019 criterion 7). Only a Gym Administrator of
 * the competition's gym, through the result entry routes. The OfficialResult model accepts no
 * other source, so a result can never be saved as coming from an AI feature.
 */
export const RESULT_SOURCE = Object.freeze({
  GYM_ADMIN: "GYM_ADMIN",
});

/** Every value allowed in an official result's source field. */
export const RESULT_SOURCES = Object.freeze(Object.values(RESULT_SOURCE));

/**
 * What TopSend's scoring format records for each Climber on each problem (US-019 criterion 4):
 * the attempts, whether they topped it (a send), and whether the top was a flash, meaning a send
 * on the first attempt. A flash scores the full point value, since no attempt is deducted.
 */
export const RESULT_RECORDING = Object.freeze({
  attempts: true,
  sends: true,
  flash: true,
});
/**
 * How many times a save is tried again when another save of the same result lands first, such
 * as two judges pressing "Attempt" at once. Each try reads the result again, so no attempt is
 * lost or counted twice (NR-004).
 */
export const RESULT_SAVE_TRIES = 3;
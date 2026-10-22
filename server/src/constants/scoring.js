/**
 * Limits for a competition's scoring settings (US-018), shared by the request checks and the
 * Competition model. A top scores the problem's point value (US-016), less deductionPercent of
 * that value for each failed attempt before the top. A problem not topped within maxAttempts
 * scores 0.
 */
export const SCORING_DEDUCTION_MAX = 99;
export const SCORING_ATTEMPTS_MAX = 20;

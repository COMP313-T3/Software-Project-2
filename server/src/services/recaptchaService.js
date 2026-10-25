const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

/**
 * Asks Google whether a reCAPTCHA response token is valid. A token can be checked only once,
 * and it expires two minutes after the box is ticked.
 *
 * @param {string} secretKey The reCAPTCHA secret key.
 * @param {string} token The response token the browser got when the box was ticked.
 * @returns {Promise<{ success: boolean, errorCodes: string[] }>} Google's verdict.
 * @throws {Error} When Google can't be reached in time or answers with an HTTP error.
 */
export async function verifyRecaptchaToken(secretKey, token) {
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    body: new URLSearchParams({ secret: secretKey, response: token }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`reCAPTCHA verification returned HTTP ${response.status}`);
  }

  const result = await response.json();
  return {
    success: result.success === true,
    errorCodes: Array.isArray(result["error-codes"])
      ? result["error-codes"]
      : [],
  };
}

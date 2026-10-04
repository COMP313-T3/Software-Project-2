/**
 * An error whose status, code, and message are safe to send to API clients.
 * Throw it from any route and the error handler turns it into the API's error shape.
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status code to respond with.
   * @param {string} code Stable uppercase error code, for example NOT_FOUND.
   * @param {string} message Message that is safe to show to users.
   * @param {Record<string, string>} [fields] Validation messages keyed by field name.
   */
  constructor(status, code, message, fields) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

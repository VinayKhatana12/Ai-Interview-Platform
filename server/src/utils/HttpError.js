// Typed operational error. The error handler serializes it into the API's
// uniform envelope: { error: { code, message, details? } }.
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

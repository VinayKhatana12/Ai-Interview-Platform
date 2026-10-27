// Per-request correlation id: honors a well-formed inbound X-Request-Id
// (so proxy logs line up) or mints a UUID, and echoes it back in the
// response. Error logs carry it; request bodies, headers and cookies never
// reach the log line.
import { randomUUID } from "node:crypto";

const INBOUND_ID = /^[\w.-]{8,64}$/;

export function requestId(req, res, next) {
  const inbound = req.get("x-request-id");
  req.id = typeof inbound === "string" && INBOUND_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}

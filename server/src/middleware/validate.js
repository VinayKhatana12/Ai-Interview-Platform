// Replaces the request body (or query) with the schema's parsed output —
// trimmed, lowercased emails, coerced numbers — or rejects with per-field
// details for the form to show inline.
export function validate(schema, target = "body") {
  return (req, res, next) => {
    const source = target === "query" ? req.query : req.body ?? {};
    const result = schema.safeParse(source);
    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "_";
        if (!details[key]) details[key] = issue.message;
      }
      return res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields need attention.",
          details,
        },
      });
    }
    if (target === "query") {
      req.validatedQuery = result.data;
    } else {
      req.body = result.data;
    }
    next();
  };
}

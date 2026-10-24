// Replaces req.body with the schema's parsed output (trimmed, lowercased
// emails) or rejects with per-field details for the form to show inline.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
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
    req.body = result.data;
    next();
  };
}

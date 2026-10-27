// Replaces the request body (query or params) with the schema's parsed
// output — trimmed, lowercased emails, coerced numbers — or rejects with
// per-field details for the form to show inline. The params target guards
// URL segments (ids) before they reach Prisma.
export function validate(schema, target = "body") {
  return (req, res, next) => {
    const source = target === "query" ? req.query : target === "params" ? req.params : req.body ?? {};
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
    } else if (target === "params") {
      Object.assign(req.params, result.data);
    } else {
      req.body = result.data;
    }
    next();
  };
}

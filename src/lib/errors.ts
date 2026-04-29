import { validate, type ValidationError } from "class-validator";

function flattenValidationErrors(
  errors: ValidationError[],
  prefix = "",
): { property: string; constraints?: Record<string, string> }[] {
  const out: { property: string; constraints?: Record<string, string> }[] = [];
  for (const e of errors) {
    const prop = prefix ? `${prefix}.${e.property}` : e.property;
    if (e.constraints) {
      out.push({ property: prop, constraints: e.constraints });
    }
    if (e.children?.length) {
      out.push(...flattenValidationErrors(e.children, prop));
    }
  }
  return out;
}

/** Thrown when a request body fails class-validator checks. */
export class ValidationFailedError extends Error {
  readonly name = "ValidationFailedError";

  constructor(
    public readonly details: { property: string; constraints?: Record<string, string> }[],
  ) {
    super("Validation failed");
  }
}

/** Generic HTTP error for controllers / services to map to status codes. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Run `class-validator` on an already-built DTO instance (no class-transformer). */
export async function validateOrThrow<T extends object>(dto: T): Promise<void> {
  const errors = await validate(dto);
  if (errors.length > 0) {
    throw new ValidationFailedError(flattenValidationErrors(errors));
  }
}

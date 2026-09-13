export class DomainError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = "domain_error") {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404, "not_found");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, 403, "forbidden");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}

'use strict';
// Domain error taxonomy. Application/IPC layers serialize these as
// { ok:false, code, message } so the browser frontend and a future HTTP API
// share one error contract. No Electron, no fs, no SQL here.
class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
class ValidationError extends DomainError {
  constructor(message) { super('VALIDATION', message); }
}
class NotFoundError extends DomainError {
  constructor(message) { super('NOT_FOUND', message); }
}
class ConflictError extends DomainError {
  constructor(message) { super('CONFLICT', message); }
}
class StateError extends DomainError {
  constructor(message) { super('INVALID_STATE', message); }
}
class ForbiddenError extends DomainError {
  constructor(message) { super('FORBIDDEN', message); }
}

module.exports = { ValidationError, NotFoundError, ConflictError, StateError, ForbiddenError };

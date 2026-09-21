export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly current: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    current?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.current = current;
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, 'invalid_input', message);
}

export function unauthorized(message = 'Authentication required'): HttpError {
  return new HttpError(401, 'unauthorized', message);
}

export function forbidden(message = 'Permission denied'): HttpError {
  return new HttpError(403, 'forbidden', message);
}

export function notFound(message = 'Resource not found'): HttpError {
  return new HttpError(404, 'not_found', message);
}

export function conflict(
  code: string,
  message: string,
  current?: unknown,
): HttpError {
  return new HttpError(409, code, message, current);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.current === undefined ? {} : { current: error.current }),
        },
      },
      { status: error.status },
    );
  }
  console.error(error);
  return Response.json(
    { error: { code: 'internal_error', message: 'Internal server error' } },
    { status: 500 },
  );
}

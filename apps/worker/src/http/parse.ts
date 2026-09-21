import { z } from 'zod';
import { badRequest } from '../errors.ts';

export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw badRequest('Request body must be valid JSON');
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw badRequest(
      parsed.error.issues[0]?.message ?? 'Request body is invalid',
    );
  return parsed.data;
}

export function response<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}

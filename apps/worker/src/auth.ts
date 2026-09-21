import { createRemoteJWKSet, jwtVerify } from 'jose';
import { principalSchema } from '../../../packages/contracts/src/index.ts';
import { HttpError, unauthorized } from './errors.ts';
import type { AuthActor, WorkerEnv } from './types.ts';

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authenticateAccess(
  request: Request,
  env: WorkerEnv,
): Promise<AuthActor> {
  const domain = env.ACCESS_TEAM_DOMAIN;
  const audience = env.ACCESS_AUD;
  if (!domain || !audience)
    throw new HttpError(
      500,
      'auth_config',
      'Cloudflare Access is not configured',
    );
  const issuer = domain.startsWith('http') ? domain : `https://${domain}`;
  const token = accessToken(request);
  if (token === null) throw unauthorized();
  try {
    let jwks = keySets.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      keySets.set(issuer, jwks);
    }
    const verified = await jwtVerify(token, jwks, { issuer, audience });
    if (
      typeof verified.payload.exp !== 'number' ||
      verified.payload.exp <= Date.now() / 1000
    ) {
      throw unauthorized('Access token has expired');
    }
    const parsed = principalSchema.safeParse({
      subject: verified.payload.sub,
      email: verified.payload.email,
    });
    if (!parsed.success)
      throw unauthorized('Access token has no verified email');
    return {
      issuer,
      subject: parsed.data.subject,
      email: parsed.data.email.toLowerCase(),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unauthorized('Access token could not be verified');
  }
}

export function verifyMutationOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if (origin === null) return;
  if (origin !== new URL(request.url).origin) {
    throw new HttpError(
      403,
      'invalid_origin',
      'Mutation origin is not allowed',
    );
  }
}

function accessToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7);
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (assertion) return assertion;
  const cookie = request.headers.get('Cookie');
  if (cookie === null) return null;
  for (const part of cookie.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === 'CF_Authorization') return value.join('=') || null;
  }
  return null;
}

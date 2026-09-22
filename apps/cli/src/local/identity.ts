import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { isLocalUrl, loadProfile, normalizeUrl } from '../config.ts';

const tokenPrincipalSchema = z.object({
  iss: z.string().min(1),
  sub: z.string().min(1),
  email: z.email(),
});

export type LocalPrincipalKey = {
  issuer: string;
  subject: string;
  email: string;
};

export async function localPrincipalKey(
  url: string,
  testEmail?: string,
): Promise<LocalPrincipalKey> {
  const normalizedUrl = normalizeUrl(url);
  const profile = await loadProfile(normalizedUrl);
  const localEmail = testEmail ?? profile?.testEmail;
  if (isLocalUrl(normalizedUrl)) {
    if (!localEmail)
      throw new Error('Local mode requires login or --test-email <email>.');
    const email = z.email().parse(localEmail).toLowerCase();
    return { issuer: 'local', subject: email, email };
  }
  if (!profile?.accessToken)
    throw new Error('Run linc auth login before using local mode.');
  return decodePrincipal(profile.accessToken);
}

function decodePrincipal(token: string): LocalPrincipalKey {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('The saved Access token is not a JWT.');
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('The saved Access token payload is invalid.');
  }
  const parsed = tokenPrincipalSchema.parse(value);
  return {
    issuer: parsed.iss,
    subject: parsed.sub,
    email: parsed.email.toLowerCase(),
  };
}

async function localStateDirectory(): Promise<string> {
  const base = process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state');
  const path = join(base, 'linc', 'local');
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
  return path;
}

export async function databasePath(
  url: string,
  principal: LocalPrincipalKey,
  workspaceId: string,
): Promise<string> {
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        normalizeUrl(url),
        principal.issuer,
        principal.subject,
        workspaceId,
      ]),
    )
    .digest('hex');
  return join(await localStateDirectory(), `${key}.sqlite`);
}

export async function localDatabaseFiles(): Promise<string[]> {
  const directory = await localStateDirectory();
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.sqlite') &&
        !entry.name.endsWith('.sync-lock.sqlite'),
    )
    .map((entry) => join(directory, entry.name));
}

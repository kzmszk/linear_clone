import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as z from 'zod';
import {
  isLocalUrl,
  loadProfile,
  normalizeUrl,
  saveProfile,
  type AuthProfile,
} from './config.ts';

const execFileAsync = promisify(execFile);
const emailSchema = z.string().email();

export async function login(
  url: string,
  testEmail: string | undefined,
): Promise<AuthProfile> {
  const normalizedUrl = normalizeUrl(url);
  if (isLocalUrl(normalizedUrl)) {
    if (!testEmail)
      throw new Error('Local login requires --test-email <email>.');
    const profile: AuthProfile = {
      url: normalizedUrl,
      testEmail: emailSchema.parse(testEmail),
    };
    await saveProfile(profile);
    return profile;
  }
  if (testEmail)
    throw new Error('--test-email is allowed only for localhost URLs.');
  try {
    await runAccessLogin(normalizedUrl);
    const result = await execFileAsync(
      'cloudflared',
      ['access', 'token', `-app=${normalizedUrl}`],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    const accessToken = result.stdout.trim();
    if (!accessToken)
      throw new Error('cloudflared returned an empty Access token.');
    const profile: AuthProfile = { url: normalizedUrl, accessToken };
    await saveProfile(profile);
    return profile;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('cloudflared returned')
    )
      throw error;
    throw new Error(
      'Cloudflare Access login failed. Install cloudflared and retry.',
    );
  }
}

function runAccessLogin(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('cloudflared', ['access', 'login', url, '--quiet'], {
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`cloudflared exited with code ${code ?? 'unknown'}`));
    });
  });
}

export async function headersFor(
  url: string,
  testEmail?: string,
): Promise<Record<string, string>> {
  const normalizedUrl = normalizeUrl(url);
  if (testEmail) {
    if (!isLocalUrl(normalizedUrl))
      throw new Error('--test-email is allowed only for localhost URLs.');
    return { 'X-Test-Email': emailSchema.parse(testEmail) };
  }
  const profile = await loadProfile(normalizedUrl);
  if (isLocalUrl(normalizedUrl)) {
    return profile?.testEmail ? { 'X-Test-Email': profile.testEmail } : {};
  }
  return profile?.accessToken
    ? {
        'Cf-Access-Token': profile.accessToken,
        Authorization: `Bearer ${profile.accessToken}`,
      }
    : {};
}

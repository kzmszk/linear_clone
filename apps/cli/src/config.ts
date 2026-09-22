import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as z from 'zod';

const profileSchema = z.object({
  url: z.string().url(),
  accessToken: z.string().min(1).optional(),
  testEmail: z.string().email().optional(),
});
const configSchema = z.object({
  profiles: z.record(z.string(), profileSchema).default({}),
  defaultUrl: z.string().url().optional(),
});

export type AuthProfile = z.infer<typeof profileSchema>;
type Config = z.infer<typeof configSchema>;

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/u, '');
  return url.toString().replace(/\/$/u, '');
}

export function isLocalUrl(value: string): boolean {
  const hostname = new URL(value).hostname;
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  );
}

function configPath(): string {
  const explicit = process.env.LINC_CONFIG;
  if (explicit) return explicit;
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'linc', 'config.json');
}

async function readConfig(): Promise<Config> {
  try {
    const value: unknown = JSON.parse(await readFile(configPath(), 'utf8'));
    return configSchema.parse(value);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { profiles: {} };
    }
    throw new Error(
      `Cannot read ${configPath()}: ${error instanceof Error ? error.message : 'invalid JSON'}`,
    );
  }
}

async function writeConfig(config: Config): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await chmod(path, 0o600);
}

export async function saveProfile(profile: AuthProfile): Promise<void> {
  const config = await readConfig();
  const url = normalizeUrl(profile.url);
  config.profiles[url] = {
    ...profile,
    url,
  };
  config.defaultUrl = url;
  await writeConfig(config);
}

export async function defaultUrl(): Promise<string> {
  if (process.env.LINC_URL) return normalizeUrl(process.env.LINC_URL);
  const config = await readConfig();
  if (config.defaultUrl) return config.defaultUrl;
  const urls = Object.keys(config.profiles);
  return (urls.length === 1 ? urls[0] : undefined) ?? 'http://localhost:8787';
}

export async function loadProfile(
  url: string,
): Promise<AuthProfile | undefined> {
  const config = await readConfig();
  return config.profiles[normalizeUrl(url)];
}

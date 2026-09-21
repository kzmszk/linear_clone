import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const profileSchema = z.object({
  url: z.string().url(),
  accessToken: z.string().min(1).optional(),
  testEmail: z.string().email().optional(),
});
const configSchema = z.object({
  profiles: z.record(z.string(), profileSchema).default({}),
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

export function configPath(): string {
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
  config.profiles[normalizeUrl(profile.url)] = {
    ...profile,
    url: normalizeUrl(profile.url),
  };
  await writeConfig(config);
}

export async function loadProfile(
  url: string,
): Promise<AuthProfile | undefined> {
  const config = await readConfig();
  return config.profiles[normalizeUrl(url)];
}

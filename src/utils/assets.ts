import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Content-hash versioning for static assets, so they can be served with
// long-lived immutable cache headers: the URL changes whenever the file does.
// Hashes are computed lazily and cached for the life of the process (a deploy
// restarts the server, which is exactly when assets can change).
const versions = new Map<string, string>();

export function assetUrl(path: string): string {
  let version = versions.get(path);
  if (version === undefined) {
    try {
      const content = readFileSync(join(process.cwd(), 'public', path));
      version = createHash('sha256').update(content).digest('hex').slice(0, 10);
    } catch {
      version = '';
    }
    versions.set(path, version);
  }
  return version ? `${path}?v=${version}` : path;
}

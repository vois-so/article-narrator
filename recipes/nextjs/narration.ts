// Reads the manifest that `article-narrator build` writes. Put this file in lib/.
// It runs on the server only. If there is no manifest, posts have no player.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Narration = { src: string; duration: number; title: string };

export function getNarration(id: string): Narration | undefined {
  const file = join(process.cwd(), 'content', 'narration.json');
  if (!existsSync(file)) return undefined;
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { posts?: Record<string, Narration> };
  return manifest.posts?.[id];
}

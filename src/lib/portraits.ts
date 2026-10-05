import fs from 'node:fs';
import path from 'node:path';

export function fullPortrait(id: string): string | undefined {
  const src = `/images/personaggi/${id}-full.png`;
  return fs.existsSync(path.join(process.cwd(), 'public', src)) ? src : undefined;
}

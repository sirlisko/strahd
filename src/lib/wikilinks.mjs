import fs from 'node:fs';
import path from 'node:path';

// Resolved from the current working directory rather than import.meta.url:
// Astro moves this module under dist/.prerender/ during build, which would
// break a path resolved relative to the module's own location. Astro (dev
// and build) is always invoked from the project root, so process.cwd() is
// the stable anchor here.
const CONTENT_DIR = path.join(process.cwd(), 'src', 'content');

const COLLECTION_ROUTES = {
  sessions: '/diario',
  personaggi: '/personaggi',
  png: '/png',
  luoghi: '/luoghi',
  riassunto: '/riassunto',
};

export const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

// Range of Unicode combining diacritical marks (U+0300-U+036F), built from
// code points rather than a literal character class to avoid encoding issues.
const DIACRITICS_RE = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g'
);

// Astro's default markdown processor runs remark-smartypants, which turns
// straight apostrophes/quotes into their curly typographic equivalents in
// rendered text nodes. The slug map, however, is built from a raw read of
// the source files (still straight quotes). Stripping every apostrophe
// variant before comparing keeps both sides matching regardless of which
// form a given piece of text went through.
const APOSTROPHE_RE = new RegExp(
  `['${String.fromCharCode(0x2018)}${String.fromCharCode(0x2019)}]`,
  'g'
);

export function normalize(str) {
  return str
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(APOSTROPHE_RE, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// IM Fell draws a straight " as a closing quote, and frontmatter doesn't go
// through remark-smartypants.
export const curlyQuotes = (s) => s.replace(/"([^"]*)"/g, '“$1”');

function frontmatterField(raw, key) {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m?.[1].trim().replace(/^(["'])(.*)\1$/, '$2');
}

let cache = null;

export function getSlugMap() {
  if (cache) return cache;
  cache = new Map();

  for (const [collection, routeBase] of Object.entries(COLLECTION_ROUTES)) {
    const dir = path.join(CONTENT_DIR, collection);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const id = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      const title = frontmatterField(raw, 'titolo') ?? id;
      const url = collection === 'riassunto' ? routeBase : `${routeBase}/${id}`;
      const entry = {
        url,
        title,
        collection,
        ruolo: frontmatterField(raw, 'ruolo'),
        stato: frontmatterField(raw, 'stato'),
        tipo: frontmatterField(raw, 'tipo'),
      };

      cache.set(normalize(id), entry);
      cache.set(normalize(title), entry);
    }
  }
  return cache;
}

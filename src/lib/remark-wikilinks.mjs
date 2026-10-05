import { visit } from 'unist-util-visit';
import { curlyQuotes, getSlugMap, normalize, WIKILINK_RE } from './wikilinks.mjs';

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function marginaliaItem(entry) {
  const dagger =
    entry.stato === 'morto'
      ? '<span class="marginalia-dagger" aria-hidden="true">†</span><span class="sr-only">(morto)</span>'
      : '';
  const status = entry.stato === 'scomparso' || entry.stato === 'sconosciuto' ? entry.stato : '';
  const note = [entry.collection === 'png' ? entry.ruolo : entry.tipo, status].filter(Boolean).join(' · ');
  return `<li><a href="${entry.url}">${escapeHtml(entry.title)}</a>${dagger}${
    note ? `<span class="marginalia-note">${escapeHtml(curlyQuotes(note))}</span>` : ''
  }</li>`;
}

// Session pages: after each ## heading, a margin note introduces the NPCs and
// places that section mentions for the first time. The party is in every
// scene, so it's left out.
function addMarginalia(tree, slugMap) {
  const seen = new Set();
  // The first section is whatever comes before the first heading.
  const sections = [{ heading: null, entries: [] }];
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === 2) {
      sections.push({ heading: node, entries: [] });
      continue;
    }
    const section = sections.at(-1);
    visit(node, 'text', (text) => {
      for (const [, target] of text.value.matchAll(WIKILINK_RE)) {
        const entry = slugMap.get(normalize(target));
        if (!entry || seen.has(entry.url) || !['png', 'luoghi'].includes(entry.collection)) continue;
        seen.add(entry.url);
        section.entries.push(entry);
      }
    });
  }
  for (const { heading, entries } of sections) {
    if (entries.length === 0) continue;
    tree.children.splice(heading ? tree.children.indexOf(heading) + 1 : 0, 0, {
      type: 'html',
      value: `<div class="marginalia" data-pagefind-ignore><ul>${entries.map(marginaliaItem).join('')}</ul></div>`,
    });
  }
}

export default function remarkWikilinks() {
  return (tree, file) => {
    const slugMap = getSlugMap();
    if (file.path?.includes('/content/sessions/')) addMarginalia(tree, slugMap);

    visit(tree, 'text', (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      WIKILINK_RE.lastIndex = 0;
      if (!WIKILINK_RE.test(node.value)) return;
      WIKILINK_RE.lastIndex = 0;

      const newNodes = [];
      let lastIndex = 0;
      let match;

      while ((match = WIKILINK_RE.exec(node.value))) {
        const [full, target, alias] = match;
        if (match.index > lastIndex) {
          newNodes.push({ type: 'text', value: node.value.slice(lastIndex, match.index) });
        }

        const entry = slugMap.get(normalize(target));
        const label = alias ?? (entry ? entry.title : target);

        if (entry) {
          newNodes.push({
            type: 'link',
            url: entry.url,
            data: { hProperties: { class: 'wikilink' } },
            children: [{ type: 'text', value: label }],
          });
        } else {
          newNodes.push({
            type: 'html',
            value: `<span class="wikilink-broken" title="Nessuna pagina trovata per &quot;${escapeHtml(target)}&quot;">${escapeHtml(label)}</span>`,
          });
          console.warn(`[wikilinks] Unresolved link: [[${target}]]`);
        }

        lastIndex = match.index + full.length;
      }
      if (lastIndex < node.value.length) {
        newNodes.push({ type: 'text', value: node.value.slice(lastIndex) });
      }

      parent.children.splice(index, 1, ...newNodes);
      return index + newNodes.length;
    });
  };
}

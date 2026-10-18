// Reports land-linked territories that don't touch on the generated board, and writes a preview SVG.
import { buildBoard, TERRITORIES, CONTINENTS, VIEW_W, VIEW_H } from '../js/map.js';
import { writeFileSync } from 'node:fs';
const b = buildBoard();
const missing = [...b.landLinks].filter(k => !b.contacts.has(k));
console.log('land links without contact:', missing.length ? missing.join(', ') : 'none');
for (const t of TERRITORIES) if (!b.paths[t.id]) console.log('EMPTY', t.id);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W * 1.5}" height="${VIEW_H * 1.5}"><rect width="100%" height="100%" fill="#1d4e6e"/>`;
svg += `<path d="${b.coastD}" stroke="#e8dcb0" stroke-width="3" fill="none"/>`;
for (const [x1, y1, x2, y2] of b.lanes) svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-dasharray="3 3" stroke-width="0.8"/>`;
for (const t of TERRITORIES) svg += `<path d="${b.paths[t.id]}" fill="${CONTINENTS[t.continent].tint}" stroke="#333" stroke-width="0.6" fill-rule="evenodd"/>`;
for (const t of TERRITORIES) svg += `<text x="${t.sites[0][0]}" y="${t.sites[0][1]}" font-size="8" text-anchor="middle" font-family="sans-serif">${t.name}</text>`;
svg += '</svg>';
writeFileSync(process.argv[2] || '/tmp/risk-preview.svg', svg);

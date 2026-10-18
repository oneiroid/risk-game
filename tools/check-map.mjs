// Reports how the rules' adjacencies show on the board, and writes a preview SVG.
import { buildBoard, TERRITORIES, CONTINENTS, VIEW_W, VIEW_H } from '../js/map.js';
import { writeFileSync } from 'node:fs';
const b = buildBoard();
const missing = [...b.landLinks].filter(k => !b.contacts.has(k));
console.log('land links drawn as lanes (no contact):', missing.length ? missing.join(', ') : 'none');
for (const t of TERRITORIES) if (!b.paths[t.id]) console.log('EMPTY', t.id);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W * 1.5}" height="${VIEW_H * 1.5}"><rect width="100%" height="100%" fill="#1d4e6e"/>`;
for (const t of TERRITORIES) svg += `<path d="${b.paths[t.id]}" fill="${CONTINENTS[t.continent].tint}" stroke="#333" stroke-width="0.4" fill-rule="evenodd"/>`;
svg += `<path d="${b.walls}" stroke="#000" stroke-width="2" fill="none"/>`;
for (const [x1, y1, x2, y2] of b.lanes) svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-dasharray="3 3" stroke-width="0.8"/>`;
for (const t of TERRITORIES) svg += `<text x="${t.sites[0][0]}" y="${t.sites[0][1]}" font-size="7" text-anchor="middle" font-family="sans-serif">${t.name}</text>`;
svg += '</svg>';
writeFileSync(process.argv[2] || '/tmp/risk-preview.svg', svg);

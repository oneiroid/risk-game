// Board data (classic 42-territory map) and generated hex-board geometry.

export const CONTINENTS = {
  na: { name: 'North America', bonus: 5, tint: '#c9b37a' },
  sa: { name: 'South America', bonus: 2, tint: '#c98a6a' },
  eu: { name: 'Europe', bonus: 5, tint: '#8aa3c9' },
  af: { name: 'Africa', bonus: 3, tint: '#c9a46a' },
  as: { name: 'Asia', bonus: 7, tint: '#8ac98f' },
  au: { name: 'Australia', bonus: 2, tint: '#b38ac9' },
};

// sites: Voronoi seed points (first one is the label/army badge position).
// r: land radius around each site.
const T = [
  ['alaska', 'Alaska', 'na', [[62, 98], [40, 140]]],
  ['nwt', 'Northwest Territory', 'na', [[160, 82], [220, 70], [110, 70]]],
  ['greenland', 'Greenland', 'na', [[338, 52], [380, 40], [310, 30]], 44],
  ['alberta', 'Alberta', 'na', [[140, 150], [105, 140]]],
  ['ontario', 'Ontario', 'na', [[214, 152], [215, 120]]],
  ['quebec', 'Quebec', 'na', [[288, 150], [290, 115]]],
  ['wus', 'Western US', 'na', [[150, 222], [110, 200]]],
  ['eus', 'Eastern US', 'na', [[238, 230], [285, 205]]],
  ['cam', 'Central America', 'na', [[180, 298], [205, 330]], 50],

  ['ven', 'Venezuela', 'sa', [[250, 358], [290, 365]], 50],
  ['peru', 'Peru', 'sa', [[238, 430]], 50],
  ['brazil', 'Brazil', 'sa', [[318, 420], [345, 400]]],
  ['arg', 'Argentina', 'sa', [[272, 505], [262, 555]], 50],

  ['iceland', 'Iceland', 'eu', [[418, 88]], 34],
  ['gb', 'Great Britain', 'eu', [[414, 168], [405, 145]], 36],
  ['scand', 'Scandinavia', 'eu', [[505, 88], [525, 58]], 50],
  ['neur', 'Northern Europe', 'eu', [[497, 168]], 46],
  ['weur', 'Western Europe', 'eu', [[438, 240], [445, 205]], 48],
  ['seur', 'Southern Europe', 'eu', [[520, 232], [555, 215]], 46],
  ['ukraine', 'Ukraine', 'eu', [[598, 140], [585, 95], [580, 195]], 54],

  ['nafr', 'North Africa', 'af', [[462, 345], [500, 300], [520, 385]], 54],
  ['egypt', 'Egypt', 'af', [[562, 312]], 46],
  ['eafr', 'East Africa', 'af', [[606, 392], [570, 365], [608, 440]], 50],
  ['congo', 'Congo', 'af', [[548, 435]], 46],
  ['safr', 'South Africa', 'af', [[565, 515], [550, 545], [592, 482]], 50],
  ['madag', 'Madagascar', 'af', [[650, 505]], 32],

  ['ural', 'Ural', 'as', [[680, 120], [670, 170]], 50],
  ['siberia', 'Siberia', 'as', [[752, 82], [745, 150]], 50],
  ['yakutsk', 'Yakutsk', 'as', [[838, 62], [880, 50]], 50],
  ['kamchatka', 'Kamchatka', 'as', [[930, 82], [960, 120], [885, 118]], 50],
  ['irkutsk', 'Irkutsk', 'as', [[828, 128]], 46],
  ['mongolia', 'Mongolia', 'as', [[845, 188], [800, 182], [885, 175]], 46],
  ['japan', 'Japan', 'as', [[950, 200], [945, 165]], 30],
  ['afgh', 'Afghanistan', 'as', [[668, 215]], 50],
  ['china', 'China', 'as', [[790, 250], [745, 205], [840, 245]], 50],
  ['mideast', 'Middle East', 'as', [[625, 290], [600, 255]], 48],
  ['india', 'India', 'as', [[722, 310]], 50],
  ['siam', 'Siam', 'as', [[815, 325]], 42],

  ['indonesia', 'Indonesia', 'au', [[828, 410], [790, 395]], 38],
  ['nguinea', 'New Guinea', 'au', [[918, 395]], 36],
  ['wau', 'Western Australia', 'au', [[855, 498], [870, 540]], 50],
  ['eau', 'Eastern Australia', 'au', [[940, 485], [925, 540]], 50],
];

const ADJ_LIST = {
  alaska: ['nwt', 'alberta', 'kamchatka'],
  nwt: ['alaska', 'alberta', 'ontario', 'greenland'],
  greenland: ['nwt', 'ontario', 'quebec', 'iceland'],
  alberta: ['alaska', 'nwt', 'ontario', 'wus'],
  ontario: ['nwt', 'alberta', 'wus', 'eus', 'quebec', 'greenland'],
  quebec: ['ontario', 'eus', 'greenland'],
  wus: ['alberta', 'ontario', 'eus', 'cam'],
  eus: ['wus', 'ontario', 'quebec', 'cam'],
  cam: ['wus', 'eus', 'ven'],
  ven: ['cam', 'peru', 'brazil'],
  peru: ['ven', 'brazil', 'arg'],
  brazil: ['ven', 'peru', 'arg', 'nafr'],
  arg: ['peru', 'brazil'],
  iceland: ['greenland', 'gb', 'scand'],
  gb: ['iceland', 'scand', 'neur', 'weur'],
  scand: ['iceland', 'gb', 'neur', 'ukraine'],
  neur: ['gb', 'scand', 'ukraine', 'seur', 'weur'],
  weur: ['gb', 'neur', 'seur', 'nafr'],
  seur: ['weur', 'neur', 'ukraine', 'mideast', 'egypt', 'nafr'],
  ukraine: ['scand', 'neur', 'seur', 'mideast', 'afgh', 'ural'],
  nafr: ['brazil', 'weur', 'seur', 'egypt', 'eafr', 'congo'],
  egypt: ['nafr', 'seur', 'mideast', 'eafr'],
  eafr: ['egypt', 'nafr', 'congo', 'safr', 'madag', 'mideast'],
  congo: ['nafr', 'eafr', 'safr'],
  safr: ['congo', 'eafr', 'madag'],
  madag: ['safr', 'eafr'],
  ural: ['ukraine', 'siberia', 'china', 'afgh'],
  siberia: ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'],
  yakutsk: ['siberia', 'kamchatka', 'irkutsk'],
  kamchatka: ['yakutsk', 'irkutsk', 'mongolia', 'japan', 'alaska'],
  irkutsk: ['siberia', 'yakutsk', 'kamchatka', 'mongolia'],
  mongolia: ['irkutsk', 'siberia', 'china', 'japan', 'kamchatka'],
  japan: ['kamchatka', 'mongolia'],
  afgh: ['ukraine', 'ural', 'china', 'india', 'mideast'],
  china: ['afgh', 'ural', 'siberia', 'mongolia', 'siam', 'india'],
  mideast: ['ukraine', 'afgh', 'india', 'egypt', 'eafr', 'seur'],
  india: ['mideast', 'afgh', 'china', 'siam'],
  siam: ['india', 'china', 'indonesia'],
  indonesia: ['siam', 'nguinea', 'wau'],
  nguinea: ['indonesia', 'eau', 'wau'],
  wau: ['indonesia', 'nguinea', 'eau'],
  eau: ['wau', 'nguinea'],
};

// Adjacencies crossing water (drawn as dashed sea lanes, never touching on the board).
const SEA = [
  'alaska-kamchatka', 'nwt-greenland', 'ontario-greenland', 'quebec-greenland', 'greenland-iceland',
  'iceland-gb', 'iceland-scand', 'gb-scand', 'gb-neur', 'gb-weur', 'weur-nafr', 'seur-nafr',
  'seur-egypt', 'brazil-nafr', 'eafr-mideast', 'eafr-madag', 'safr-madag', 'siam-indonesia',
  'indonesia-nguinea', 'indonesia-wau', 'nguinea-wau', 'nguinea-eau', 'kamchatka-japan', 'mongolia-japan',
];

export const TERRITORIES = T.map(([id, name, continent, sites, r]) => ({
  id, name, continent, sites: sites.map(([x, y]) => [x, y + 24]), r: r || 56,
}));
export const TERR = Object.fromEntries(TERRITORIES.map(t => [t.id, t]));
export const ADJ = ADJ_LIST;
export const IDS = TERRITORIES.map(t => t.id);

export const VIEW_W = 1000, VIEW_H = 650;

const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const SEA_SET = new Set(SEA.map(s => pairKey(...s.split('-'))));
const LAND_SET = new Set();
for (const a in ADJ) for (const b of ADJ[a]) if (!SEA_SET.has(pairKey(a, b))) LAND_SET.add(pairKey(a, b));

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, y) {
  // smoothed value noise in [-1, 1]
  const s = 0.045;
  const fx = x * s, fy = y * s;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

const HEX_R = 7;
const GAP = 16, CONT_GAP = 26;

// Builds territory outline paths from a hex grid where every hex is assigned to the
// territory owning the nearest seed site, with water channels between non-land-linked territories.
export function buildBoard() {
  const r = HEX_R, w = Math.sqrt(3) * r, h = 1.5 * r;
  const cols = Math.ceil(VIEW_W / w) + 1, rows = Math.ceil(VIEW_H / h) + 1;
  const sites = [];
  TERRITORIES.forEach((t, ti) => t.sites.forEach(([x, y]) => sites.push({ x, y, ti })));
  const grid = new Int16Array(cols * rows).fill(-1);
  const center = (c, rw) => [w * (c + 0.5 * (rw & 1)), h * rw];

  for (let rw = 0; rw < rows; rw++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = center(c, rw);
      let d1 = 1e9, t1 = -1;
      for (const s of sites) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < d1) { d1 = d; t1 = s.ti; }
      }
      let d2 = 1e9, t2 = -1;
      for (const s of sites) {
        if (s.ti === t1) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < d2) { d2 = d; t2 = s.ti; }
      }
      const tt = TERRITORIES[t1];
      if (d1 > tt.r * (1 + 0.22 * noise(x, y))) continue;
      if (t2 >= 0 && !LAND_SET.has(pairKey(tt.id, TERRITORIES[t2].id))) {
        const gap = tt.continent === TERRITORIES[t2].continent ? GAP : CONT_GAP;
        if (d2 - d1 < gap) continue;
      }
      grid[rw * cols + c] = t1;
    }
  }

  const at = (c, rw) => (c < 0 || rw < 0 || c >= cols || rw >= rows ? -1 : grid[rw * cols + c]);
  const DIRS = [
    [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]],
    [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]],
  ];
  const corner = (cx, cy, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return [Math.round((cx + r * Math.cos(a)) * 10) / 10, Math.round((cy + r * Math.sin(a)) * 10) / 10];
  };
  const edges = TERRITORIES.map(() => new Map()); // start point key -> end point
  const coast = [];
  const contacts = new Set();
  for (let rw = 0; rw < rows; rw++) {
    for (let c = 0; c < cols; c++) {
      const ti = at(c, rw);
      if (ti < 0) continue;
      const [cx, cy] = center(c, rw);
      for (let e = 0; e < 6; e++) {
        const [dc, dr] = DIRS[rw & 1][e];
        const ni = at(c + dc, rw + dr);
        if (ni === ti) continue;
        const p = corner(cx, cy, e), q = corner(cx, cy, (e + 1) % 6);
        edges[ti].set(p.join(','), q);
        if (ni < 0) coast.push(p, q);
        else contacts.add(pairKey(TERRITORIES[ti].id, TERRITORIES[ni].id));
      }
    }
  }

  const paths = {};
  TERRITORIES.forEach((t, ti) => {
    const m = edges[ti];
    let d = '';
    while (m.size) {
      const [startKey, first] = m.entries().next().value;
      m.delete(startKey);
      d += 'M' + startKey;
      let cur = first;
      let guard = 0;
      while (cur.join(',') !== startKey && guard++ < 100000) {
        d += 'L' + cur.join(',');
        const k = cur.join(',');
        const next = m.get(k);
        if (!next) break;
        m.delete(k);
        cur = next;
      }
      d += 'Z';
    }
    paths[t.id] = d;
  });

  let coastD = '';
  for (let i = 0; i < coast.length; i += 2) coastD += 'M' + coast[i].join(',') + 'L' + coast[i + 1].join(',');

  // sea lanes: adjacency pairs without land contact
  const lanes = [];
  const laneSet = new Set(SEA_SET);
  for (const k of LAND_SET) if (!contacts.has(k)) laneSet.add(k);
  for (const k of laneSet) {
    const [a, b] = k.split('|');
    const [ax, ay] = TERR[a].sites[0], [bx, by] = TERR[b].sites[0];
    if (k === pairKey('alaska', 'kamchatka')) {
      lanes.push([ax, ay, 0, ay - 4], [bx, by, VIEW_W, by + 4]);
    } else lanes.push([ax, ay, bx, by]);
  }
  return { paths, coastD, lanes, contacts, landLinks: LAND_SET };
}

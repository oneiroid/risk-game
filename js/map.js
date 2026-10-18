// Board data (classic 42-territory map). Geometry: js/geo.js, built from real geography by tools/build-map.py.
import { GEO } from './geo.js';

export const CONTINENTS = {
  na: { name: 'North America', bonus: 5, tint: '#c9b37a' },
  sa: { name: 'South America', bonus: 2, tint: '#c98a6a' },
  eu: { name: 'Europe', bonus: 5, tint: '#8aa3c9' },
  af: { name: 'Africa', bonus: 3, tint: '#c9a46a' },
  as: { name: 'Asia', bonus: 7, tint: '#8ac98f' },
  au: { name: 'Australia', bonus: 2, tint: '#b38ac9' },
};

const T = [
  ['alaska', 'Alaska', 'na'],
  ['nwt', 'Northwest Territory', 'na'],
  ['greenland', 'Greenland', 'na'],
  ['alberta', 'Alberta', 'na'],
  ['ontario', 'Ontario', 'na'],
  ['quebec', 'Quebec', 'na'],
  ['wus', 'Western US', 'na'],
  ['eus', 'Eastern US', 'na'],
  ['cam', 'Central America', 'na'],
  ['ven', 'Venezuela', 'sa'],
  ['peru', 'Peru', 'sa'],
  ['brazil', 'Brazil', 'sa'],
  ['arg', 'Argentina', 'sa'],
  ['iceland', 'Iceland', 'eu'],
  ['gb', 'Great Britain', 'eu'],
  ['scand', 'Scandinavia', 'eu'],
  ['neur', 'Northern Europe', 'eu'],
  ['weur', 'Western Europe', 'eu'],
  ['seur', 'Southern Europe', 'eu'],
  ['ukraine', 'Ukraine', 'eu'],
  ['nafr', 'North Africa', 'af'],
  ['egypt', 'Egypt', 'af'],
  ['eafr', 'East Africa', 'af'],
  ['congo', 'Congo', 'af'],
  ['safr', 'South Africa', 'af'],
  ['madag', 'Madagascar', 'af'],
  ['ural', 'Ural', 'as'],
  ['siberia', 'Siberia', 'as'],
  ['yakutsk', 'Yakutsk', 'as'],
  ['kamchatka', 'Kamchatka', 'as'],
  ['irkutsk', 'Irkutsk', 'as'],
  ['mongolia', 'Mongolia', 'as'],
  ['japan', 'Japan', 'as'],
  ['afgh', 'Afghanistan', 'as'],
  ['china', 'China', 'as'],
  ['mideast', 'Middle East', 'as'],
  ['india', 'India', 'as'],
  ['siam', 'Siam', 'as'],
  ['indonesia', 'Indonesia', 'au'],
  ['nguinea', 'New Guinea', 'au'],
  ['wau', 'Western Australia', 'au'],
  ['eau', 'Eastern Australia', 'au'],
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

export const TERRITORIES = T.map(([id, name, continent]) => ({ id, name, continent, sites: [GEO.labels[id]] }));
export const TERR = Object.fromEntries(TERRITORIES.map(t => [t.id, t]));
export const ADJ = ADJ_LIST;
export const IDS = TERRITORIES.map(t => t.id);

export const VIEW_W = GEO.w, VIEW_H = GEO.h;

const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const SEA_SET = new Set(SEA.map(s => pairKey(...s.split('-'))));
const LAND_SET = new Set();
for (const a in ADJ) for (const b of ADJ[a]) if (!SEA_SET.has(pairKey(a, b))) LAND_SET.add(pairKey(a, b));

// paths: territory outlines; lanes: rule links across water; walls: borders that touch but are closed.
export function buildBoard() {
  return {
    paths: GEO.paths, lanes: GEO.lanes, walls: GEO.walls, graticule: GEO.graticule, equator: GEO.equator,
    contLabels: GEO.contLabels, contacts: new Set(GEO.contacts), landLinks: LAND_SET,
  };
}

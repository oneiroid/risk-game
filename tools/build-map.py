"""Builds js/geo.js: the 42 territories from real geography (Natural Earth 1:50m, public domain).

    python3 tools/build-map.py [NE_DIR]

NE_DIR (default /tmp/ne) must hold ne_50m_admin_0_countries_lakes.geojson and
ne_50m_admin_1_states_provinces_lakes.geojson from github.com/nvkelso/natural-earth-vector (geojson/).
Projection: Miller cylindrical, central meridian 11°E, longitudes -169..191, latitudes -56..84.
"""
import json, math, re, sys, warnings
from pathlib import Path

import geopandas as gpd
from shapely import affinity
from shapely.geometry import box, LineString, MultiLineString, Point, Polygon, MultiPolygon, GeometryCollection
from shapely.ops import nearest_points, unary_union, polylabel, transform

warnings.filterwarnings('ignore')
NE = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/ne')
ROOT = Path(__file__).resolve().parent.parent

LON0, LON_MIN, LON_MAX, LAT_MIN, LAT_MAX = 11, -169, 191, -56, 84
VIEW_W, PAD = 1000, 8
K = VIEW_W / math.radians(LON_MAX - LON_MIN)          # px per radian
def miller(lat): return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))
Y_TOP = miller(LAT_MAX)
VIEW_H = round((Y_TOP - miller(LAT_MIN)) * K + 2 * PAD)
def proj(lon, lat): return (math.radians(lon - LON_MIN) * K, (Y_TOP - miller(max(min(lat, 89), -89))) * K + PAD)
def proj_geom(g): return transform(lambda x, y, z=None: tuple(zip(*[proj(a, b) for a, b in zip(x, y)])), g)

# ---------- territory composition ----------
ADM0 = {
    'greenland': 'GRL', 'cam': 'MEX GTM BLZ SLV HND NIC CRI PAN CUB JAM HTI DOM BHS PRI',
    'ven': 'VEN COL GUY SUR TTO ABW CUW', 'peru': 'PER ECU BOL', 'brazil': 'BRA', 'arg': 'ARG CHL URY PRY FLK',
    'iceland': 'ISL', 'gb': 'GBR IRL IMN GGY JEY', 'scand': 'NOR SWE FIN DNK ALD FRO',
    'neur': 'DEU POL NLD BEL LUX CZE', 'weur': 'FRA ESP PRT AND MCO',
    'seur': 'ITA CHE LIE AUT SVK HUN SVN HRV BIH SRB MNE KOS MKD ALB GRC BGR ROU MLT SMR VAT',
    'ukraine': 'UKR BLR MDA LTU LVA EST',
    'nafr': 'MAR SAH DZA TUN MRT MLI NER SEN GMB GNB GIN SLE LBR CIV BFA GHA TGO BEN NGA TCD CPV',
    'egypt': 'EGY LBY', 'eafr': 'SDN SDS ETH ERI DJI SOM SOL KEN UGA TZA RWA BDI',
    'congo': 'COD COG CAF CMR GAB GNQ STP', 'safr': 'ZAF NAM BWA ZWE MOZ ZMB MWI AGO LSO SWZ',
    'madag': 'MDG COM MUS', 'mongolia': 'MNG', 'japan': 'JPN',
    'afgh': 'AFG KAZ UZB TKM TJK KGZ', 'china': 'CHN TWN HKG MAC KOR PRK',
    'mideast': 'TUR CYP CYN SYR LBN ISR PSX JOR IRQ IRN SAU KWT BHR QAT ARE OMN YEM GEO ARM AZE',
    'india': 'IND PAK NPL BTN BGD LKA KAS', 'siam': 'MMR THA LAO KHM VNM SGP',
    'indonesia': 'PHL BRN TLS', 'nguinea': 'PNG SLB', 'eau': 'NZL',
}
ADM1 = {  # (country, region names) — everything else of that country goes to the default below
    'alaska': ('USA', ['Alaska']),
    'wus': ('USA', 'Washington Oregon California Nevada Idaho Montana Wyoming Utah Colorado Arizona'.split()
            + ['New Mexico', 'North Dakota', 'South Dakota', 'Nebraska', 'Kansas', 'Oklahoma', 'Texas']),
    'nwt': ('CAN', ['Yukon', 'Northwest Territories', 'Nunavut']),
    'alberta': ('CAN', ['British Columbia', 'Alberta', 'Saskatchewan']),
    'ontario': ('CAN', ['Manitoba', 'Ontario']),
    'ural': ('RUS', ['Sverdlovsk', 'Chelyabinsk', 'Kurgan', "Tyumen'", 'Khanty-Mansiy', 'Yamal-Nenets', 'Omsk',
                     'Novosibirsk', 'Altay', 'Gorno-Altay']),
    'siberia': ('RUS', ['Tomsk', 'Kemerovo', 'Khakass', 'Tuva', 'Krasnoyarsk']),
    'irkutsk': ('RUS', ['Irkutsk', 'Buryat', 'Chita']),
    'yakutsk': ('RUS', ['Sakha (Yakutia)']),
    'kamchatka': ('RUS', ['Chukchi Autonomous Okrug', 'Maga Buryatdan', 'Kamchatka', 'Khabarovsk', 'Sakhalin',
                          "Primor'ye", 'Yevrey', 'Amur']),
    'nguinea': ('IDN', ['Papua', 'Papua Barat']),
    'wau': ('AUS', ['Western Australia', 'Northern Territory', 'South Australia']),
}
ADM1_DEFAULT = {'USA': 'eus', 'CAN': 'quebec', 'RUS': 'ukraine', 'IDN': 'indonesia', 'AUS': 'eau'}
DROP_REGIONS = {('USA', 'Hawaii')}
SPLIT = {'MYS': lambda p: 'indonesia' if p.centroid.x > 108 else 'siam'}  # Borneo vs peninsula
DROP = set('ATA ATF HMD SGS IOT IOA ATC PCN BMU'.split())

CONT_LABELS = {'na': (-100, 72), 'sa': (-122, -26), 'eu': (16, 73), 'af': (-12, -12), 'as': (122, 82.5), 'au': (115, -45)}

def parts(g):
    if g is None or g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, (MultiPolygon, GeometryCollection)): return [p for q in g.geoms for p in parts(q)]
    return []

def fix_lon(p, country):
    """Move parts across the antimeridian to the side the map shows."""
    minx, _, maxx, _ = p.bounds
    if country == 'RUS' and maxx < -150: return affinity.translate(p, 360)
    if country == 'USA' and minx > 150: return None  # western Aleutians
    return p

frame = box(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX)
a0 = gpd.read_file(NE / 'ne_50m_admin_0_countries_lakes.geojson')
a1 = gpd.read_file(NE / 'ne_50m_admin_1_states_provinces_lakes.geojson')

assigned = {}            # territory -> list of polygons (lon/lat)
loose = []               # (country, polygon) to place by proximity
iso_terr = {iso: t for t, s in ADM0.items() for iso in s.split()}
region_terr = {(c, n): t for t, (c, names) in ADM1.items() for n in names}

def add(t, p, country):
    p = fix_lon(p, country)
    if p is None: return
    p = p.intersection(frame)
    for q in parts(p): assigned.setdefault(t, []).append(q)

for _, r in a1[a1.adm0_a3.isin(ADM1_DEFAULT)].iterrows():
    c, n = r.adm0_a3, r['name']
    if (c, n) in DROP_REGIONS: continue
    t = region_terr.get((c, n), ADM1_DEFAULT[c])
    for p in parts(r.geometry): add(t, p, c)

for _, r in a0.iterrows():
    c = r.ADM0_A3
    if c in DROP or c in ADM1_DEFAULT: continue
    ps = parts(r.geometry)
    if c in SPLIT:
        for p in ps: add(SPLIT[c](p), p, c)
        continue
    t = iso_terr.get(c)
    if not t:
        loose += [(c, p) for p in ps]
        continue
    main = max(ps, key=lambda p: p.area)
    for p in ps:  # far-away overseas parts (French Guiana, Réunion…) are placed by proximity
        if p.centroid.distance(main.centroid) > 20: loose.append((c, p))
        else: add(t, p, c)

home = {t: unary_union(ps) for t, ps in assigned.items()}
placed = {}
for c, p in loose:
    t, d = min(((t, g.distance(p)) for t, g in home.items()), key=lambda x: x[1])
    if d < 5: add(t, p, c); placed.setdefault(t, set()).add(c)
print('placed by proximity:', {t: sorted(s) for t, s in placed.items()})

# ---------- project, merge, simplify ----------
MIN_AREA = 0.35  # px²: smaller islets are dropped
terr = {}
for t, ps in assigned.items():
    g = unary_union([proj_geom(p) for p in ps]).buffer(0)
    terr[t] = MultiPolygon([p for p in parts(g) if p.area >= MIN_AREA])

def ring_d(coords):
    pts = []
    for x, y in coords[:-1]:
        p = f'{round(x, 1):g},{round(y, 1):g}'
        if not pts or pts[-1] != p: pts.append(p)
    return 'M' + pts[0] + 'L' + ' '.join(pts[1:]) + 'Z' if len(pts) > 2 else ''

def line_d(g):
    lines = g.geoms if hasattr(g, 'geoms') else [g]
    return ''.join('M' + ' '.join(f'{round(x, 1):g},{round(y, 1):g}' for x, y in l.simplify(0.3).coords)
                   for l in lines if isinstance(l, LineString) and l.length > 0.3)

def path_d(g, tol):
    g = g.simplify(tol, preserve_topology=True)
    return ''.join(ring_d(r.coords) for p in parts(g) for r in [p.exterior, *p.interiors])

TOL = 0.22
paths = {t: path_d(g, TOL) for t, g in terr.items()}

# label point: pole of inaccessibility of the largest part
labels = {}
for t, g in terr.items():
    big = max(g.geoms, key=lambda p: p.area)
    pt = polylabel(big, tolerance=0.3)
    labels[t] = [round(pt.x, 1), round(pt.y, 1)]

# land contacts and "closed borders" (territories that touch but are not adjacent in the rules)
adj_src = (ROOT / 'js/map.js').read_text().split('const ADJ_LIST = {')[1].split('};')[0]
ADJ = {m.group(1): re.findall(r"'(\w+)'", m.group(2)) for m in re.finditer(r"^\s+(\w+): \[(.*?)\],?$", adj_src, re.M)}
pair = lambda a, b: '|'.join(sorted((a, b)))
adj_pairs = {pair(a, b) for a in ADJ for b in ADJ[a]}
ids = sorted(terr)
contacts, walls = [], []
for i, a in enumerate(ids):
    for b in ids[i + 1:]:
        if terr[a].distance(terr[b]) > 0.05: continue
        shared = terr[a].buffer(0.25).intersection(terr[b].buffer(0.25))
        if shared.area < 0.4: continue
        contacts.append(pair(a, b))
        if pair(a, b) not in adj_pairs:
            walls.append(line_d(terr[a].boundary.intersection(terr[b].buffer(0.3))))
print('contacts not in rules (drawn as closed borders):', [c for c in contacts if c not in adj_pairs])
print('rule links without contact (drawn as lanes):', sorted(adj_pairs - set(contacts)))
# sea lanes: rule links without land contact, between the nearest coast points (Alaska–Kamchatka wraps around)
lanes = []
for k in sorted(adj_pairs - set(contacts)):
    a, b = k.split('|')
    if k == 'alaska|kamchatka':
        for t, edge in (('alaska', 0), ('kamchatka', VIEW_W)):
            px, py = (min if edge == 0 else max)((c for p in terr[t].geoms for c in p.exterior.coords), key=lambda c: c[0])
            lanes.append([round(px, 1), round(py, 1), edge, round(py, 1)])
        continue
    pa, pb = nearest_points(terr[a], terr[b])
    lanes.append([round(pa.x, 1), round(pa.y, 1), round(pb.x, 1), round(pb.y, 1)])
missing = set(ADJ) - set(terr)
assert not missing, missing

# graticule every 30°
grat = []
for lon in range(-150, 181, 30):
    x, _ = proj(lon, 0); grat.append(f'M{x:.1f},{PAD}V{VIEW_H - PAD}')
for lat in range(-30, 81, 30):
    _, y = proj(0, lat); grat.append(f'M0,{y:.1f}H{VIEW_W}')
_, eq = proj(0, 0)

geo = {
    'w': VIEW_W, 'h': VIEW_H, 'paths': paths, 'labels': labels, 'walls': ''.join(walls),
    'contacts': contacts, 'lanes': lanes, 'graticule': ''.join(grat), 'equator': round(eq, 1),
    'contLabels': {c: [round(v, 1) for v in proj(*ll)] for c, ll in CONT_LABELS.items()},
}
out = ROOT / 'js/geo.js'
out.write_text('// Generated by tools/build-map.py from Natural Earth 1:50m (public domain). Do not edit.\n'
               'export const GEO = ' + json.dumps(geo, separators=(',', ':')) + ';\n')
print(f'{out} {out.stat().st_size / 1024:.0f} KB, view {VIEW_W}x{VIEW_H}')

# ---------- relief: Natural Earth shaded relief (SR_50M.tif) reprojected to the board, land only ----------
sr = NE / 'sr' / 'SR_50M.tif'
if sr.exists():
    import numpy as np
    from PIL import Image, ImageDraw
    Image.MAX_IMAGE_PIXELS = None
    S = 2  # output pixels per board unit
    W, H = VIEW_W * S, VIEW_H * S
    src_img = Image.open(sr).convert('L')
    src_img = src_img.resize((src_img.width * 2 // 5, src_img.height * 2 // 5), Image.LANCZOS)  # anti-alias first
    src = np.asarray(src_img, dtype=np.float32)
    SH, SW = src.shape
    xs = (np.arange(W) + 0.5) / S
    ys = (np.arange(H) + 0.5) / S
    lon = LON_MIN + np.degrees(xs / K)
    lat = np.degrees(2.5 * np.arctan(np.exp(0.8 * (Y_TOP - (ys - PAD) / K))) - 0.625 * math.pi)
    fx = ((lon + 180) % 360) / 360 * SW - 0.5
    fy = np.clip((90 - lat) / 180 * SH - 0.5, 0, SH - 1.001)
    x0 = np.floor(fx).astype(int); tx = (fx - x0)[None, :]
    y0 = np.floor(fy).astype(int); ty = (fy - y0)[:, None]
    x0 %= SW; x1 = (x0 + 1) % SW; y1 = y0 + 1
    v = ((src[y0[:, None], x0[None, :]] * (1 - tx) + src[y0[:, None], x1[None, :]] * tx) * (1 - ty)
         + (src[y1[:, None], x0[None, :]] * (1 - tx) + src[y1[:, None], x1[None, :]] * tx) * ty)
    mask = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(mask)
    for g in terr.values():
        for p in g.geoms:
            dr.polygon([(x * S, y * S) for x, y in p.exterior.coords], fill=255)
            for r in p.interiors: dr.polygon([(x * S, y * S) for x, y in r.coords], fill=0)
    m = np.asarray(mask) > 0
    flat = np.median(v[m])
    d = (v - flat) / flat
    # grey around 128 = no change under soft-light blending; darker = shadow, lighter = sunlit slope
    g = 128 + np.clip(d * 2.4, -0.85, 0.6) * 127 * m
    rel = ROOT / 'img/relief.jpg'
    rel.parent.mkdir(exist_ok=True)
    Image.fromarray(g.astype(np.uint8), 'L').save(rel, 'JPEG', quality=78, optimize=True, progressive=True)
    print(f'{rel} {rel.stat().st_size / 1024:.0f} KB, flat level {flat:.0f}')

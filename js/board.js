// SVG board: rendering, highlights, pan / pinch-zoom, taps.
import { buildBoard, TERRITORIES, TERR, CONTINENTS, VIEW_W, VIEW_H } from './map.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

const RELIEF_URL = new URL('../img/relief.jpg', import.meta.url).href;
const SEIGAIHA = 'M0 20a20 20 0 0 1 40 0M6 20a14 14 0 0 1 28 0M12 20a8 8 0 0 1 16 0M-20 10a20 20 0 0 1 40 0M-14 10a14 14 0 0 1 28 0'
  + 'M-8 10a8 8 0 0 1 16 0M20 10a20 20 0 0 1 40 0M26 10a14 14 0 0 1 28 0M32 10a8 8 0 0 1 16 0';

export class Board {
  constructor(container, onTap) {
    this.container = container;
    this.onTap = onTap;
    const geo = buildBoard();
    const svg = (this.svg = el('svg', { class: 'board', 'aria-label': 'Game board' }));
    const defs = el('defs', {}, svg);
    defs.innerHTML = `
      <pattern id="seigaiha" width="20" height="10" patternUnits="userSpaceOnUse">
        <path d="${SEIGAIHA}" transform="scale(.5)" class="wave"/>
      </pattern>`;
    el('rect', { x: -3000, y: -3000, width: 7000, height: 7000, class: 'ocean' }, svg);
    this.world = el('g', {}, svg);
    el('rect', { x: -3000, y: -3000, width: 7000, height: 7000, fill: 'url(#seigaiha)', class: 'waves' }, this.world);
    el('path', { d: geo.graticule, class: 'grat' }, this.world);
    el('line', { x1: 0, x2: VIEW_W, y1: geo.equator, y2: geo.equator, class: 'equator' }, this.world);
    // all outlines in one path, drawn under the land: only the seaward half of each stroke shows, i.e. the coast
    const allD = TERRITORIES.map(t => geo.paths[t.id]).join('');
    el('path', { d: allD, class: 'shelf' }, this.world);
    el('path', { d: allD, class: 'coast' }, this.world);
    const terrG = el('g', { class: 'terrs' }, this.world);
    this.paths = {};
    for (const t of TERRITORIES) {
      const p = el('path', { d: geo.paths[t.id], class: 'terr', 'data-id': t.id, 'fill-rule': 'evenodd' }, terrG);
      this.paths[t.id] = p;
    }
    el('image', { href: RELIEF_URL, x: 0, y: 0, width: VIEW_W, height: VIEW_H, preserveAspectRatio: 'none', class: 'relief' }, this.world);
    el('path', { d: geo.walls, class: 'wall' }, this.world);
    el('path', { d: geo.walls, class: 'wall-teeth' }, this.world);
    const lanes = el('g', { class: 'lanes' }, this.world);
    for (const [x1, y1, x2, y2] of geo.lanes) el('line', { x1, y1, x2, y2 }, lanes);
    this.hl = el('g', { class: 'hl' }, this.world);
    const contG = el('g', { class: 'cont-labels' }, this.world);
    for (const c in geo.contLabels) {
      const [x, y] = geo.contLabels[c];
      const tx = el('text', { x, y }, contG);
      tx.textContent = `${CONTINENTS[c].name} +${CONTINENTS[c].bonus}`;
    }
    const badgeG = el('g', { class: 'badges' }, this.world);
    this.badges = {};
    for (const t of TERRITORIES) {
      const [x, y] = t.sites[0];
      const g = el('g', { class: 'badge', 'data-id': t.id }, badgeG);
      const inner = el('g', {}, g);
      const name = el('text', { class: 'tname', y: -15 }, inner);
      name.textContent = t.name;
      const circle = el('circle', { r: 9.5 }, inner);
      el('circle', { r: 10.6, class: 'rim' }, inner);
      const num = el('text', { class: 'num', y: 4 }, inner);
      g.setAttribute('transform', `translate(${x},${y})`);
      this.badges[t.id] = { g, inner, circle, num, x, y };
    }
    container.appendChild(svg);

    this.vb = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
    this.zoom = 1;
    this.center = { x: VIEW_W / 2, y: VIEW_H / 2 };
    this._bindInput();
    new ResizeObserver(() => this._applyView()).observe(container);
    this._applyView();
  }

  // state: game state; hl: { sel, targets:Set, from, to }
  render(state, hl = {}) {
    for (const t of TERRITORIES) {
      const o = state.territories[t.id];
      const color = state.players[o.owner].color;
      this.paths[t.id].style.fill = color;
      const b = this.badges[t.id];
      b.circle.style.fill = color;
      b.num.textContent = o.armies;
      const cls = ['terr'];
      if (hl.targets && hl.targets.has(t.id)) cls.push('target');
      if (hl.dim && !(hl.targets && hl.targets.has(t.id)) && hl.sel !== t.id) cls.push('dim');
      this.paths[t.id].setAttribute('class', cls.join(' '));
    }
    this.hl.innerHTML = '';
    const ring = (id, cls) => {
      if (!id) return;
      const p = el('path', { d: this.paths[id].getAttribute('d'), class: cls, 'fill-rule': 'evenodd' }, this.hl);
      return p;
    };
    if (hl.targets) for (const id of hl.targets) ring(id, 'ring-target');
    ring(hl.sel, 'ring-sel');
    ring(hl.to, 'ring-to');
    if (hl.sel && hl.to) {
      const a = TERR[hl.sel].sites[0], b = TERR[hl.to].sites[0];
      el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'arrow' }, this.hl);
    }
  }

  flash(id, cls = 'flash') {
    const b = this.badges[id];
    if (!b) return;
    b.g.classList.remove(cls);
    void b.g.getBBox();
    b.g.classList.add(cls);
    setTimeout(() => b.g.classList.remove(cls), 900);
  }

  // home view: the whole world, except on portrait screens, where the map fills the height and pans sideways
  fit() {
    const W = this.container.clientWidth || 1, H = this.container.clientHeight || 1;
    const r = (H / VIEW_H) / (W / VIEW_W);
    this.zoom = r > 1.8 ? Math.min(5, r * 0.9) : 1;
    this.center = { x: VIEW_W / 2, y: VIEW_H / 2 };
    this._applyView();
  }

  zoomBy(f, cx, cy) {
    const nz = Math.min(5, Math.max(1, this.zoom * f));
    const r = this.zoom / nz;
    if (cx == null) { cx = this.center.x; cy = this.center.y; }
    this.center.x = cx + (this.center.x - cx) * r;
    this.center.y = cy + (this.center.y - cy) * r;
    this.zoom = nz;
    this._applyView();
  }

  _applyView() {
    const W = this.container.clientWidth || 1, H = this.container.clientHeight || 1;
    // base scale: whole map fits
    const base = Math.min(W / VIEW_W, H / VIEW_H);
    const ppu = base * this.zoom; // screen px per board unit
    const w = W / ppu, h = H / ppu;
    // clamp center so the map stays in view
    const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
    this.center.x = clamp(this.center.x, w / 2, VIEW_W - w / 2);
    this.center.y = clamp(this.center.y, h / 2, VIEW_H - h / 2);
    this.vb = { x: this.center.x - w / 2, y: this.center.y - h / 2, w, h };
    this.svg.setAttribute('viewBox', `${this.vb.x} ${this.vb.y} ${w} ${h}`);
    this.ppu = ppu;
    // keep badges legible on small screens
    const bs = Math.min(2.3, Math.max(1, 0.95 / ppu));
    for (const id in this.badges) this.badges[id].inner.setAttribute('transform', `scale(${bs})`);
    this.svg.classList.toggle('show-names', ppu * bs >= 1.15);
    this.svg.classList.toggle('show-conts', ppu >= 0.55);
  }

  _toBoard(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return { x: this.vb.x + ((clientX - r.left) / r.width) * this.vb.w, y: this.vb.y + ((clientY - r.top) / r.height) * this.vb.h };
  }

  _bindInput() {
    const svg = this.svg;
    const pts = new Map();
    let moved = false, startDist = 0, startZoom = 1, last = null, downAt = null;
    svg.addEventListener('pointerdown', e => {
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = false; downAt = { x: e.clientX, y: e.clientY, target: e.target }; last = { x: e.clientX, y: e.clientY }; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        startDist = Math.hypot(a.x - b.x, a.y - b.y);
        startZoom = this.zoom;
        moved = true;
      }
    });
    svg.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) moved = true;
        if (moved && last) {
          this.center.x -= (e.clientX - last.x) / this.ppu;
          this.center.y -= (e.clientY - last.y) / this.ppu;
          this._applyView();
        }
        last = { x: e.clientX, y: e.clientY };
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = this._toBoard((a.x + b.x) / 2, (a.y + b.y) / 2);
        this.zoomBy((startZoom * d) / startDist / this.zoom, mid.x, mid.y);
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0 && !moved && downAt && e.type === 'pointerup') {
        const id = this._idAt(e.clientX, e.clientY);
        if (id) this.onTap(id);
      }
      if (pts.size === 1) { last = [...pts.values()][0]; }
      if (pts.size === 0) downAt = null;
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const p = this._toBoard(e.clientX, e.clientY);
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
  }

  _idAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const node = hit && hit.closest('[data-id]');
    if (node) return node.getAttribute('data-id');
    // tolerate taps slightly off a small territory: nearest badge within reach
    const p = this._toBoard(x, y);
    let best = null, bd = 22 / Math.min(1, this.ppu);
    for (const t of TERRITORIES) {
      const d = Math.hypot(t.sites[0][0] - p.x, t.sites[0][1] - p.y);
      if (d < bd) { bd = d; best = t.id; }
    }
    return best;
  }
}

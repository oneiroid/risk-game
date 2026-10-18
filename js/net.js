// Online play over public MQTT brokers (WebSocket). The host's browser is authoritative:
// clients send actions to the host, the host publishes the full game state (retained, so
// late joiners and reconnecting players get it immediately).
const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const PREFIX = 'risk-wc-v1/';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const netAvailable = () => typeof window !== 'undefined' && !!window.mqtt;

export function newCode(brokerIdx) {
  let c = '';
  for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c + (brokerIdx + 1);
}

export function parseCode(code) {
  const c = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 5) return null;
  const b = Number(c[4]) - 1;
  if (!(b >= 0 && b < BROKERS.length)) return null;
  return { code: c, broker: b };
}

function connectBroker(idx, opts, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const client = window.mqtt.connect(BROKERS[idx], { connectTimeout: timeout, reconnectPeriod: 2000, keepalive: 20, ...opts });
    const done = () => { clearTimeout(t); client.off('connect', onConnect); client.off('error', onError); };
    const fail = e => { done(); client.end(true); reject(e); };
    const onConnect = () => { done(); resolve(client); };
    const onError = e => fail(e);
    const t = setTimeout(() => fail(new Error('timeout')), timeout + 500);
    client.on('connect', onConnect);
    client.on('error', onError);
  });
}

export class Room {
  // role: 'host' | 'client'
  constructor({ code, broker, role, clientId }) {
    this.code = code;
    this.broker = broker;
    this.role = role;
    this.clientId = clientId;
    this.base = PREFIX + code + '/';
    this.handlers = {};
    this.onStatus = () => {};
  }

  // resume: { code, broker } of a previously hosted room
  // setup(room) runs before subscribing so handlers see retained messages.
  static async host(clientId, resume = null, setup = () => {}) {
    const order = resume ? [resume.broker] : BROKERS.map((_, i) => i);
    let lastErr;
    for (const b of order) {
      const room = new Room({ code: resume ? resume.code : newCode(b), broker: b, role: 'host', clientId });
      setup(room);
      try {
        await room._connect();
        return room;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No broker reachable');
  }

  async _connect() {
    const willTopic = this.role === 'host' ? this.base + 'host' : this.base + 'presence/' + this.clientId;
    const client = await connectBroker(this.broker, {
      clientId: 'rk_' + this.clientId.slice(0, 12) + '_' + Math.random().toString(36).slice(2, 6),
      will: { topic: willTopic, payload: JSON.stringify({ online: false, clientId: this.clientId }), qos: 1, retain: this.role === 'host' },
    });
    this.client = client;
    client.on('message', (topic, buf) => {
      const sub = topic.slice(this.base.length);
      const text = buf.toString();
      if (!text) return;
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      const key = sub.startsWith('presence/') ? 'presence' : sub;
      (this.handlers[key] || []).forEach(h => h(msg, sub));
    });
    client.on('connect', () => { this.onStatus('online'); this._announce(); });
    client.on('error', e => console.warn('mqtt', e && e.message));
    // Mobile browsers freeze background tabs; when the page returns, force a fresh connection.
    this._onVisible = () => {
      if (document.visibilityState !== 'visible' || !this.client) return;
      if (Date.now() - this._hiddenAt > 4000 || !this.client.connected) {
        this.onStatus('reconnecting');
        // the socket may be silently dead: drop it; mqtt.js auto-reconnects and resubscribes
        if (this.client.connected && this.client.stream) this.client.stream.destroy();
        else this.client.reconnect();
      }
    };
    this._onHidden = () => { if (document.visibilityState === 'hidden') this._hiddenAt = Date.now(); };
    this._hiddenAt = Date.now();
    document.addEventListener('visibilitychange', this._onHidden);
    document.addEventListener('visibilitychange', this._onVisible);
    client.on('reconnect', () => this.onStatus('reconnecting'));
    client.on('offline', () => this.onStatus('offline'));
    const subs = this.role === 'host'
      ? [this.base + 'to-host', this.base + 'presence/+']
      : [this.base + 'lobby', this.base + 'state', this.base + 'host', this.base + 'notice'];
    await new Promise((res, rej) => client.subscribe(subs, { qos: 1 }, e => (e ? rej(e) : res())));
    this._announce();
    return client;
  }

  _announce() {
    if (!this.client) return;
    if (this.role === 'host') this.publish('host', { online: true }, true);
    else this.client.publish(this.base + 'presence/' + this.clientId, JSON.stringify({ online: true, clientId: this.clientId }), { qos: 1 });
    this.onAnnounce && this.onAnnounce();
  }

  static async join(code, clientId, setup = () => {}) {
    const p = parseCode(code);
    if (!p) throw new Error('Invalid room code');
    const room = new Room({ code: p.code, broker: p.broker, role: 'client', clientId });
    setup(room);
    await room._connect();
    return room;
  }

  on(key, h) { (this.handlers[key] ||= []).push(h); }

  publish(sub, obj, retain = false) {
    if (!this.client) return;
    this.client.publish(this.base + sub, JSON.stringify(obj), { qos: 1, retain });
  }

  send(obj) { this.publish('to-host', { ...obj, clientId: this.clientId }); }

  close() {
    if (!this.client) return;
    document.removeEventListener('visibilitychange', this._onHidden);
    document.removeEventListener('visibilitychange', this._onVisible);
    if (this.role === 'host') this.publish('host', { online: false }, true);
    this.client.end();
    this.client = null;
  }
}

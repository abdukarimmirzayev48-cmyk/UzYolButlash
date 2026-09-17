import express from 'express';
import { config, ENDPOINTS } from './config.js';
import { smn } from './smnClient.js';
import { normalizeList, normalizeVehicle } from './normalize.js';
import { parseTrack } from './kml.js';
import { REPORT_TYPES, reportById, parseReportTable } from './reports.js';
import { toSmnDate } from './dates.js';

const app = express();
app.disable('x-powered-by');

// ── Ixtiyoriy API-key himoyasi (ikkinchi loyihangiz uchun) ──────────
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  if (!config.apiKey) return next();
  const key = req.get('x-api-key') || req.query.api_key;
  if (key !== config.apiKey) return res.status(401).json({ error: 'Noto\'g\'ri yoki yo\'q API kaliti' });
  next();
});

// ── Jonli ro'yxat uchun yengil kesh ─────────────────────────────────
let cache = { at: 0, data: null };
async function getLive() {
  if (cache.data && Date.now() - cache.at < config.cacheTtlMs) return cache.data;
  const res = await smn.authedGet(ENDPOINTS.liveList);
  const data = normalizeList(res.data);
  cache = { at: Date.now(), data };
  return data;
}

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const code = e.code || 'ERROR';
  const status = code === 'CAPTCHA_REQUIRED' ? 503
    : code === 'LOGIN_FAILED' ? 502
    : code === 'NOT_FOUND' ? 404
    : code === 'SESSION_LOST' ? 502 : 500;
  res.status(status).json({ error: e.message, code });
});

// ── Health ──────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, loggedIn: smn.loggedIn, time: new Date().toISOString() });
});

// ── Barcha avtomobillar (jonli) ─────────────────────────────────────
// GET /api/vehicles?online=true&moving=true
app.get('/api/vehicles', wrap(async (req, res) => {
  const live = await getLive();
  let list = live.vehicles;
  if (req.query.online != null) {
    const want = req.query.online === 'true';
    list = list.filter(v => v.status.online === want);
  }
  if (req.query.moving != null) {
    const want = req.query.moving === 'true';
    list = list.filter(v => v.status.moving === want);
  }
  res.json({ count: list.length, nextUpdateAt: live.nextUpdateAt, vehicles: list });
}));

// ── Bitta avtomobil (id = objectId) ─────────────────────────────────
app.get('/api/vehicles/:id', wrap(async (req, res) => {
  const live = await getLive();
  const v = live.vehicles.find(x => String(x.id) === String(req.params.id));
  if (!v) throw Object.assign(new Error('Avtomobil topilmadi'), { code: 'NOT_FOUND' });
  res.json(v);
}));

// ── Marshrut / tarix ────────────────────────────────────────────────
// GET /api/vehicles/:id/track?from=2026-09-08&to=2026-09-08&format=json|kml
app.get('/api/vehicles/:id/track', wrap(async (req, res) => {
  const objectId = req.params.id;
  const from = toSmnDate(req.query.from || startOfToday(), false);
  const to = toSmnDate(req.query.to || Date.now(), true);
  const format = (req.query.format || 'json').toLowerCase();

  const smnRes = await smn.authedGet(ENDPOINTS.fullTracks, {
    params: {
      'object-id': objectId,
      'start-date': from,
      'end-date': to,
      'line-width': 3,
      'track-type-color': 'speed',
      'color': '#ff0000',
      'track-view-type': 'line',
      'epsilon': config.trackEpsilon,
    },
    responseType: 'text',
  });

  const payload = smnRes.data;
  if (format === 'kml') {
    // SMN XHR so'rovga JSON qaytaradi; xom holicha nima kelgan bo'lsa shuni
    // beramiz, turi ham shunga qarab belgilanadi.
    const isJson = payload && typeof payload === 'object' || String(payload).trim().startsWith('{');
    res.type(isJson ? 'application/json' : 'application/vnd.google-earth.kml+xml').send(payload);
    return;
  }
  const parsed = parseTrack(payload);
  res.json({
    objectId: Number(objectId),
    from, to,
    distanceKm: parsed.meta.distanceKm,
    pointCount: parsed.meta.pointCount,
    points: parsed.points,
  });
}));

// ── Hisobotlar ──────────────────────────────────────────────────────
//
// SMN hisobotni tayyor HTML (yoki xls/pdf) sifatida beradi -- JSON varianti
// yo'q. Shuning uchun `type=html` da jadvalni o'zimiz o'qib, toza qatorlar
// qaytaramiz: ERP uni o'z uslubida ko'rsatadi va raqamlarni yig'indiga
// qo'shadi. `type=xls|pdf` da fayl o'zgartirilmasdan uzatiladi.

// Bizning boshqaruv parametrlarimiz -- ular SMN ga uzatilmaydi.
const OWN_PARAMS = new Set(['from', 'to', 'type', 'cid', 'api_key', 'salt']);

app.get('/api/reports', wrap(async (req, res) => {
  const all = req.query.all === 'true';
  res.json({ reports: all ? REPORT_TYPES : REPORT_TYPES.filter((r) => r.useful) });
}));

// Hisobot qanday maydonlarni so'raydi -- forma tarkibi.
app.get('/api/reports/:id/params', wrap(async (req, res) => {
  const smnRes = await smn.authedGet(ENDPOINTS.reportParam, {
    params: { id: req.params.id, cid: req.query.cid ?? 0 },
    responseType: 'text',
  });
  const html = String(smnRes.data || '');
  const fields = [...html.matchAll(/<(?:input|select)[^>]*name=["']([^"']+)["']/gi)].map((m) => m[1]);
  res.json({
    id: Number(req.params.id),
    report: reportById(req.params.id),
    fields: [...new Set(fields)],
    length: html.length,
  });
}));

// Hisobotni ishga tushirish.
// GET /api/reports/55?from=2026-09-10&to=2026-09-16&object-id=2308
app.get('/api/reports/:id', wrap(async (req, res) => {
  const type = String(req.query.type || 'html').toLowerCase();
  const params = {
    id: req.params.id,
    type,
    'start-date': toSmnDate(req.query.from || startOfToday(), false),
    'end-date': toSmnDate(req.query.to || Date.now(), true),
  };
  // Qolgan barcha parametrlar shundayligicha uzatiladi: har bir hisobot
  // o'z maydonlarini so'raydi va ularni bu yerda takrorlash -- qoidani
  // ikki joyda saqlash demak.
  for (const [key, value] of Object.entries(req.query)) {
    if (!OWN_PARAMS.has(key)) params[key] = value;
  }

  const smnRes = await smn.authedGet(ENDPOINTS.reportView, { params, responseType: 'text' });
  const payload = smnRes.data;

  if (type !== 'html') {
    res.type(type === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel').send(payload);
    return;
  }
  const table = parseReportTable(payload);
  res.json({
    id: Number(req.params.id),
    report: reportById(req.params.id),
    from: params['start-date'],
    to: params['end-date'],
    headers: table.headers,
    rowCount: table.rows.length,
    rows: table.rows,
  });
}));

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

// ── Ishga tushirish ─────────────────────────────────────────────────
app.listen(config.port, config.host, async () => {
  console.log(`SMN API → http://${config.host}:${config.port}`);
  try {
    await smn.login();
    console.log('SMN sessiyasi ochildi ✓');
  } catch (e) {
    console.error('Boshlang\'ich login xatosi:', e.message);
  }
  // Keep-alive: sessiyani tirik ushlab turadi
  setInterval(() => {
    smn.keepAlive().then(ok => { if (!ok) console.warn('keep-alive: sessiya yangilanmadi'); });
  }, config.keepaliveMs);
});

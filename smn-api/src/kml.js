import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,   // ns3:kml -> kml, gx:coord -> coord, gx:Track -> Track
});

/**
 * SMN'ning object-full-tracks KML (gx:Track) javobini toza JSON marshrutga aylantiradi.
 * - ExtraDataList ichida har segment uchun ExtraData bo'ladi (masofa, nuqta soni) — jamlaymiz.
 * - gx:Track ichida when[], coord[] ("lon lat alt"), speed[], angles[] massivlari.
 */
export function parseTrackKml(xml) {
  const doc = parser.parse(xml);
  const kml = doc.kml || doc;

  // ── Meta: bir nechta ExtraData bo'lishi mumkin ──────────────────
  const extraList = deepFind(kml, 'ExtraDataList');
  const segments = asArray(deepFind(extraList || {}, 'ExtraData'));
  const meta = {
    objectId: num(pick(segments, 'mObjectId')),
    objectName: str(pick(segments, 'mObjectName')),
    from: str(minStr(segments.map(s => str(s.fromDate)))),
    to: str(maxStr(segments.map(s => str(s.toDate)))),
    pointCount: sum(segments.map(s => num(s.kmlPointCount))),
    distanceKm: round(sum(segments.map(s => num(s.kmlDistance ?? s.distance))), 3),
    segments: segments.length,
  };

  // ── Nuqtalar: gx:Track ──────────────────────────────────────────
  const track = deepFind(kml, 'Track');
  const points = [];
  if (track) {
    const whens = asArray(track.when);
    const coords = asArray(track.coord);
    const speeds = asArray(track.speed);
    const angles = asArray(track.angles);
    const n = Math.max(whens.length, coords.length);
    for (let i = 0; i < n; i++) {
      const c = String(coords[i] ?? '').trim().split(/\s+/).map(Number);
      if (c.length < 2 || Number.isNaN(c[0]) || Number.isNaN(c[1])) continue;
      points.push({
        time: whens[i] ? new Date(whens[i]).toISOString() : null,
        lng: c[0],
        lat: c[1],
        altitude: c.length > 2 ? c[2] : null,
        speed: speeds[i] != null ? Number(speeds[i]) : null,
        angle: angles[i] != null ? Number(angles[i]) : null,
      });
    }
  }

  if (!meta.pointCount) meta.pointCount = points.length;
  return { meta, points };
}

function asArray(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function str(v) { return v == null ? null : String(v).trim() || null; }
function sum(a) { return a.reduce((s, x) => s + (Number(x) || 0), 0); }
function round(n, d) { const f = 10 ** d; return Math.round(n * f) / f; }
function pick(segs, k) { for (const s of segs) if (s && s[k] != null) return s[k]; return null; }
function minStr(a) { const f = a.filter(Boolean); return f.length ? f.sort()[0] : null; }
function maxStr(a) { const f = a.filter(Boolean); return f.length ? f.sort().slice(-1)[0] : null; }

function deepFind(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  if (key in obj) return obj[key];
  for (const k of Object.keys(obj)) {
    const r = deepFind(obj[k], key, depth + 1);
    if (r != null) return r;
  }
  return null;
}

/**
 * SMN XHR so'roviga KML emas, JSON qaytaradi (`X-Requested-With` sarlavhasi
 * bo'lganda). Tuzilma bir xil, faqat XML o'rniga obyekt: har segment
 * `kmlExtraDataList` da, nuqtalar esa `kmlFolder.kmlPlacemarkList[].kmlTrack`
 * ichida uchta parallel massivda.
 *
 * `kmlAngelsList` -- SMN tomonidagi imlo xatosi (Angles emas), shundayligicha
 * o'qiladi.
 */
export function parseTrackJson(json) {
  const segments = json?.kmlExtraDataList?.kmlExtraDataList || [];
  const meta = {
    objectId: num(segments[0]?.mObjectId),
    objectName: str(segments[0]?.mObjectName),
    from: str(segments[0]?.fromDate),
    to: str(segments[segments.length - 1]?.toDate),
    // Nuqtalar soni haqiqiy massivdan olinadi: segment metama'lumotidagi
    // son takrorlangan segmentlarda ikki hisoblanadi.
    pointCount: 0,
    distanceKm: round(sum(segments.map((s) => num(s.kmlDistance ?? s.distance))), 3),
    segments: segments.length,
  };

  const points = [];
  for (const placemark of json?.kmlFolder?.kmlPlacemarkList || []) {
    const track = placemark?.kmlTrack;
    if (!track) continue;
    const whens = track.kmlWhenList || [];
    const coords = track.kmlCoordList || [];
    const speeds = track.kmlSpeedList || [];
    const angles = track.kmlAngelsList || [];
    for (let i = 0; i < coords.length; i++) {
      const c = String(coords[i] ?? '').trim().split(/\s+/).map(Number);
      if (c.length < 2 || Number.isNaN(c[0]) || Number.isNaN(c[1])) continue;
      points.push({
        time: whens[i] != null ? new Date(Number(whens[i])).toISOString() : null,
        lng: c[0],
        lat: c[1],
        altitude: c.length > 2 ? c[2] : null,
        speed: speeds[i] != null ? Number(speeds[i]) : null,
        angle: angles[i] != null ? Number(angles[i]) : null,
      });
    }
  }
  meta.pointCount = points.length;
  return { meta, points };
}

/** Javob KML (XML) yoki JSON bo'lishi mumkin -- ikkalasini ham qabul qiladi. */
export function parseTrack(payload) {
  if (payload && typeof payload === 'object') return parseTrackJson(payload);
  const text = String(payload ?? '').trim();
  if (text.startsWith('{')) {
    try {
      return parseTrackJson(JSON.parse(text));
    } catch {
      return { meta: { pointCount: 0, distanceKm: 0, segments: 0 }, points: [] };
    }
  }
  return parseTrackKml(text);
}

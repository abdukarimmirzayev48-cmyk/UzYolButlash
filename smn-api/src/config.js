import 'dotenv/config';

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`.env da ${name} ko'rsatilmagan`);
  return v;
}

export const config = {
  baseUrl: (process.env.SMN_BASE_URL || 'https://smpo-yaat.uzavtoyul.uz').replace(/\/+$/, ''),
  username: req('SMN_USERNAME'),
  password: req('SMN_PASSWORD'),
  port: Number(process.env.PORT || 3000),
  apiKey: process.env.API_KEY || '',
  cacheTtlMs: Number(process.env.CACHE_TTL_SECONDS || 15) * 1000,
  keepaliveMs: Number(process.env.KEEPALIVE_MINUTES || 5) * 60 * 1000,
  trackEpsilon: process.env.TRACK_EPSILON || '0',
};

// SMN ichki endpointlari (saytdan aniqlangan)
export const ENDPOINTS = {
  loginPage: '/login.htm',
  // Kirgandan keyin ochiladigan asosiy sahifa: SMN xarita holatini shu
  // yerda sessiyaga yozadi. Usiz jonli ro'yxat NullPointer bilan yiqiladi.
  mainPage: '/main.htm',
  loginPost: '/j_security_login',
  liveList: '/map/monitoring-object-list-json.htm',
  fullTracks: '/map/object-full-tracks.htm',
  tracksTable: '/map/tracking-object-tracks-table.htm',
  timeout: '/access-timeout.htm',
};

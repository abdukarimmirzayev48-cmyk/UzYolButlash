/**
 * SMN'ning xom `monitorData` maydonlarini toza, tushunarli JSON'ga aylantiradi.
 * Xom maydon nomlari saytdan aniqlangan.
 */
export function normalizeVehicle(item) {
  const m = item?.monitorData || {};
  const name = (m.objectName || m.objectLabel || '').trim();

  return {
    id: m.objectId,
    name,
    plate: name,                       // odatda davlat raqami
    groupId: m.groupId,

    location: {
      lat: m.latitude,
      lng: m.longitude,
      altitude: m.altitude,
      angle: m.angle,                  // yo'nalish, gradus (0=shimol)
      satellites: m.satellites,
      hdop: m.hdop,
    },

    speed: m.speed,                    // km/soat
    speedometer: m.speedometer,
    odometer: m.odometer,              // probeg

    status: {
      online: toBool(m.online),
      moving: toBool(m.movement),
      engineOn: toBool(m.engineOn),
      gsmSignal: m.gsm_sl,             // GSM signal darajasi
      lastMessageAt: m.date ? new Date(m.date).toISOString() : null,
      lastMessageText: m.dstr || null, // sayt ko'rsatadigan "19:37" / "5 min" kabi
    },

    fuel: {
      tankLiters: m.bakTotalLitr,
      tank1Liters: m.bak1Litr,
      sensorTotal: m.totalIndicationDut,
    },

    inputs: { di1: m.di_1, di2: m.di_2, di3: m.di_3, analog: m.ai },

    driver: {
      id: m.staffId || null,
      name: (m.staffName || '').trim() || null,
      phone: m.staffPhone || m.staffPhoneMobile || null,
    },

    raw: m, // to'liq xom ma'lumot ham kerak bo'lsa
  };
}

function toBool(v) {
  if (v === 1 || v === true || v === '1') return true;
  if (v === 0 || v === false || v === '0') return false;
  return Boolean(v);
}

export function normalizeList(json) {
  const arr = Array.isArray(json?.data) ? json.data
            : Array.isArray(json?.objects) ? json.objects
            : Array.isArray(json) ? json : [];
  return {
    count: arr.length,
    nextUpdateAt: json?.nextUpdTime ? new Date(json.nextUpdTime).toISOString() : null,
    vehicles: arr.map(normalizeVehicle),
  };
}

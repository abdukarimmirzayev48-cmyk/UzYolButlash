# SMN API — O'zavtoyo'l monitoring uchun toza REST API

Bu Express (Node.js) xizmati `smpo-yaat.uzavtoyul.uz` (SMN monitoring tizimi) ma'lumotlarini
**toza, tushunarli JSON** ko'rinishida beradi. Ikkinchi loyihangiz to'g'ridan-to'g'ri shu API'ga
murojaat qiladi — SMN'ning login, cookie va KML tafsilotlari ichkarida yashiringan.

## Nima qiladi
- SMN'ga avtomatik kiradi (`/j_security_login`), sessiyani (JSESSIONID) ushlab turadi
- Sessiya tugasa **o'zi qayta kiradi**; keep-alive bilan tirik saqlaydi
- Xom maydonlarni (masalan `bakTotalLitr`, `di_1`) toza nomlarga aylantiradi
- Marshrut KML (gx:Track) ni koordinata+vaqt+tezlik massiviga aylantiradi

## O'rnatish
```bash
npm install
cp .env.example .env      # .env ni to'ldiring (login/parol)
npm start
```

## Sozlamalar (.env)
| O'zgaruvchi | Tavsif |
|---|---|
| `SMN_BASE_URL` | `https://smpo-yaat.uzavtoyul.uz` |
| `SMN_USERNAME` / `SMN_PASSWORD` | SMN hisobi (siz brauzerda kiradigan) |
| `PORT` | API porti (default 3000) |
| `API_KEY` | Ikkinchi loyihangiz uchun kalit. Bo'sh = himoya o'chiq |
| `CACHE_TTL_SECONDS` | Jonli ro'yxat keshi (default 15s) |
| `KEEPALIVE_MINUTES` | Sessiyani tirik ushlash oralig'i (default 5) |
| `TRACK_EPSILON` | Marshrut soddalashtirish (0 = barcha nuqta) |

## Endpointlar

Himoya yoqilgan bo'lsa har so'rovga sarlavha qo'shing: `x-api-key: <API_KEY>`
(yoki `?api_key=<API_KEY>`).

### `GET /api/health`
Xizmat holati (`loggedIn` — SMN sessiyasi bormi).

### `GET /api/vehicles`
Barcha avtomobillar (jonli). Filtrlar: `?online=true`, `?moving=true`.
```json
{
  "count": 83,
  "nextUpdateAt": "2026-09-08T14:57:00.000Z",
  "vehicles": [{
    "id": 4414, "plate": "01 199 VA",
    "location": { "lat": 41.306, "lng": 69.370, "angle": 284, "satellites": 14 },
    "speed": 0, "odometer": 0,
    "status": { "online": true, "moving": false, "engineOn": false,
                "gsmSignal": 4, "lastMessageAt": "…", "lastMessageText": "19:37" },
    "fuel": { "tankLiters": 1 },
    "driver": { "name": null, "phone": null },
    "raw": { … }
  }]
}
```

### `GET /api/vehicles/:id`
Bitta avtomobil (id = `objectId`). Topilmasa 404.

### `GET /api/vehicles/:id/track`
Marshrut / tarix. Parametrlar:
- `from`, `to` — `2026-09-08` yoki ISO (`2026-09-08T08:00:00`). Default: bugun.
- `format` — `json` (default) yoki `kml` (xom KML).
```json
{
  "objectId": 4414,
  "from": "08.09.2026 00:00:00", "to": "08.09.2026 23:59:59",
  "distanceKm": 42.7, "pointCount": 1500,
  "points": [{ "time": "…", "lat": 41.30, "lng": 69.37, "speed": 24, "angle": 347, "altitude": 455 }]
}
```

## Ikkinchi loyihada ishlatish (misol)
```js
const res = await fetch('http://localhost:3000/api/vehicles', {
  headers: { 'x-api-key': process.env.SMN_API_KEY }
});
const { vehicles } = await res.json();
```

## Muhim eslatmalar
- **Captcha:** SMN bir necha marta xato login'dan keyin captcha so'raydi. To'g'ri login/parol
  bilan bu chiqmaydi. Agar chiqsa, API `503 CAPTCHA_REQUIRED` qaytaradi — brauzerda bir marta
  qo'lda kirib, keyin API'ni qayta ishga tushiring.
- **Shaxsiy ma'lumot:** javobda haydovchi ismi/telefoni bo'lishi mumkin — ehtiyotkorona saqlang.
- Bu **norasmiy** proxy: SMN o'z ichki endpointlarini o'zgartirsa (`src/config.js` dagi
  `ENDPOINTS`), moslashtirish kerak bo'ladi.

## Fayl tuzilmasi
```
src/
  config.js      — .env va endpoint xaritasi
  smnClient.js   — login, cookie, avto qayta-kirish, keep-alive
  normalize.js   — xom monitorData -> toza JSON
  kml.js         — gx:Track KML -> nuqtalar massivi
  dates.js       — dd.MM.yyyy HH:mm:ss formati
  server.js      — Express endpointlar
```

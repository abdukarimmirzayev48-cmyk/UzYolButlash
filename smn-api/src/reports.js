/**
 * SMN «Отчеты» bo'limi.
 *
 * Saytda 22 xil hisobot bor, lekin ularning hammasi bizga kerak emas: PoI/ZoI
 * (nuqta va zona tashriflari) va guruh kesimlari bitum tashishda ishlatilmaydi.
 * Shuning uchun har biriga `useful` belgisi qo'yilgan -- ERP ro'yxatda faqat
 * shularni ko'rsatadi, qolganlari esa to'liqlik uchun katalogda qoladi.
 *
 * Shartnoma (saytdagi chaqiruv shakli, `report.js` dan aniqlangan):
 *     GET /report/param.htm?id=<reportId>&cid=<contractId>
 *     GET /report/view.htm?type=html|pdf|xls&id=<reportId>&<forma maydonlari>
 *                          &start-date=<dd.MM.yyyy HH:mm:ss>&end-date=<...>
 *
 * Diqqat: parametr nomi `id`, `reportId` emas. Ilgari `reportId` bilan
 * chaqirilganda sayt xato bermasdan butun bosh sahifani qaytarardi -- ya'ni
 * javob 200 bo'ladi, lekin ichida hisobot yo'q.
 */

const RU = {
  56: 'Общий по объекту',
  58: 'Ежедневный пробег объекта',
  9: 'Превышения скорости объекта',
  6: 'Поездки и стоянки объекта',
  10: 'События объекта',
  7: 'Посещение PoI объектом',
  8: 'Посещение ZoI объектом',
  33: 'Отчет по PoI',
  34: 'Отчет по ZoI',
  3: 'Персонал (водители)',
  4: 'Общий по группе',
  57: 'Общий по всем объектам',
  51: 'Ежедневный пробег всех объектов',
  36: 'Расход топлива между заправками',
  38: 'График расхода топлива',
  55: 'Заправка / слив',
  91: 'Заправка / слив v.2.0',
  35: 'Расход топлива по нормам',
  67: 'Ежедневный расход топлива',
  68: 'Отчет по эффективности расхода топлива',
  85: 'Ежедневный отчет по пробегу и расходу топлива',
  100: 'Отчет по эко-вождению',
};

/**
 * Bizga mos hisobotlar. `useful: true` bo'lganlari ERP da ko'rsatiladi.
 *
 * Tanlov mezoni -- bitum tashishda javob beradigan savol bormi:
 * «necha km yurdi», «qancha yoqilg'i ketdi», «bak qachon kamaydi»,
 * «qayerda turdi», «tezlikni oshirdimi». PoI/ZoI zona tashriflari va guruh
 * kesimlari bizda ishlatilmaydi: guruh bitta -- butun park.
 */
export const REPORT_TYPES = [
  { id: 51, uz: 'Kunlik probeg -- barcha mashinalar', useful: true, group: 'probeg', scope: 'all' },
  { id: 58, uz: 'Kunlik probeg -- bitta mashina', useful: true, group: 'probeg', scope: 'object' },
  { id: 85, uz: 'Kunlik probeg va yoqilg’i sarfi', useful: true, group: 'probeg', scope: 'all' },
  { id: 55, uz: 'Quyish / sliv', useful: true, group: 'fuel', scope: 'object' },
  { id: 91, uz: 'Quyish / sliv (v2)', useful: true, group: 'fuel', scope: 'object' },
  { id: 67, uz: 'Kunlik yoqilg’i sarfi', useful: true, group: 'fuel', scope: 'all' },
  { id: 36, uz: 'Quyishlar orasidagi sarf', useful: true, group: 'fuel', scope: 'object' },
  { id: 35, uz: 'Norma bo’yicha yoqilg’i sarfi', useful: true, group: 'fuel', scope: 'object' },
  { id: 38, uz: 'Yoqilg’i grafigi', useful: true, group: 'fuel', scope: 'object' },
  { id: 68, uz: 'Yoqilg’i sarfi samaradorligi', useful: true, group: 'fuel', scope: 'all' },
  { id: 6, uz: 'Reyslar va to’xtashlar', useful: true, group: 'trips', scope: 'object' },
  { id: 9, uz: 'Tezlikni oshirish', useful: true, group: 'safety', scope: 'object' },
  { id: 100, uz: 'Eko-haydash', useful: true, group: 'safety', scope: 'all' },
  { id: 10, uz: 'Mashina hodisalari', useful: true, group: 'trips', scope: 'object' },
  { id: 3, uz: 'Xodimlar (haydovchilar)', useful: true, group: 'drivers', scope: 'all' },
  { id: 56, uz: 'Umumiy -- bitta mashina', useful: true, group: 'general', scope: 'object' },
  { id: 57, uz: 'Umumiy -- barcha mashinalar', useful: true, group: 'general', scope: 'all' },
  // Quyidagilar bizda ishlatilmaydi, lekin katalog to'liq bo'lsin.
  { id: 7, uz: 'PoI tashrifi (mashina)', useful: false, group: 'zones', scope: 'object' },
  { id: 8, uz: 'ZoI tashrifi (mashina)', useful: false, group: 'zones', scope: 'object' },
  { id: 33, uz: 'PoI hisoboti', useful: false, group: 'zones', scope: 'all' },
  { id: 34, uz: 'ZoI hisoboti', useful: false, group: 'zones', scope: 'all' },
  { id: 4, uz: 'Umumiy -- guruh', useful: false, group: 'general', scope: 'group' },
].map((r) => ({ ...r, ru: RU[r.id] || '' }));

export function reportById(id) {
  return REPORT_TYPES.find((r) => String(r.id) === String(id)) || null;
}

/**
 * HTML jadvalni qatorlarga aylantiradi.
 *
 * SMN hisobotni tayyor HTML sifatida beradi -- JSON varianti yo'q. Jadvalni
 * o'zimiz o'qiymiz, chunki ERP da uni o'z uslubimizda ko'rsatamiz va
 * raqamlarni yig'indiga qo'shamiz. Sayt HTMLi oddiy: `<table>` ichida `<tr>`
 * va `<td>`, birlashtirilgan katak yo'q.
 */
export function parseReportTable(html) {
  const text = String(html || '');
  const tables = [...text.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  if (!tables.length) return { headers: [], rows: [] };

  // Eng ko'p qatorli jadval -- hisobotning o'zi. Sahifada sarlavha va
  // tugmalar uchun ham kichik jadvallar bo'ladi.
  const body = tables.reduce((best, t) => {
    const n = (t.match(/<tr[\s>]/gi) || []).length;
    return n > best.n ? { t, n } : best;
  }, { t: '', n: 0 }).t;

  const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cellText(c[1])),
  ).filter((cells) => cells.length);

  if (!rows.length) return { headers: [], rows: [] };
  // Birinchi qator sarlavha bo'lsa, uni ajratamiz: unda raqam bo'lmaydi.
  const first = rows[0];
  const looksLikeHeader = first.every((c) => !/^-?[\d\s.,]+$/.test(c) || c === '');
  return looksLikeHeader
    ? { headers: first, rows: rows.slice(1) }
    : { headers: [], rows };
}

function cellText(raw) {
  return String(raw)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

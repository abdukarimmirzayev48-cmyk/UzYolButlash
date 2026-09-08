/**
 * SMN sana formati: "dd.MM.yyyy HH:mm:ss"
 * Kirish: ISO string, Date, yoki millisekund.
 */
export function toSmnDate(input, endOfDay = false) {
  let d;
  if (input instanceof Date) d = input;
  else if (typeof input === 'number') d = new Date(input);
  else if (typeof input === 'string') {
    // "2026-09-08" kabi sof sana ham qabul qilinadi
    d = /^\d{4}-\d{2}-\d{2}$/.test(input)
      ? new Date(input + (endOfDay ? 'T23:59:59' : 'T00:00:00'))
      : new Date(input);
  } else {
    d = new Date();
  }
  if (Number.isNaN(d.getTime())) throw new Error('Noto\'g\'ri sana: ' + input);

  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

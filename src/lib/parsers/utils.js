// Utilidades compartidas por los lectores de extractos.

// "1,234,567.89" (formato BBVA) → 1234567.89
export function parseUSNumber(str) {
  if (str == null) return null;
  const clean = String(str).replace(/[^\d.\-]/g, '');
  if (!clean || clean === '-' || clean === '.') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

// "2.304.996,00" o "1,83" (formato Bancolombia) → 2304996 / 1.83
export function parseCONumber(str) {
  if (str == null) return null;
  const clean = String(str).replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
  if (!clean || clean === '-') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

// dd-mm-yyyy, dd/mm/yyyy o ddmmyyyy → yyyy-mm-dd (o null si no es una fecha real)
export function toISODate(d, m, y) {
  const dd = Number(d), mm = Number(m), yy = Number(y);
  if (!dd || !mm || !yy || mm > 12 || dd > 31) return null;
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1) return null;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
export function monthFromName(name) {
  return MONTHS[String(name || '').toLowerCase().slice(0, 3)] || null;
}

// Algunos PDFs (Bancolombia) repiten el mismo texto tres veces por el efecto de "negrilla".
export function collapseRepeats(text) {
  let out = text;
  // Nunca se colapsan números ("000000", "111.111"): solo texto repetido
  for (let i = 0; i < 3; i++) out = out.replace(/(.{2,}?)\1\1/g, (m, unit) => (/^[\d\s.,$-]+$/.test(unit) ? m : unit));
  return out;
}

export const MONTH_LABELS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// "2026-10" → "octubre 2026"
export function periodLabel(period) {
  if (!period) return 'Periodo sin identificar';
  const [y, m] = period.split('-');
  return `${MONTH_LABELS[Number(m) - 1] || m} ${y}`;
}

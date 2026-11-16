/**
 * Antes de mandar texto a un servicio de IA externo, se tapan los datos personales:
 * números de cédula, cuentas y tarjetas (se dejan solo los últimos 4), correos,
 * direcciones y el nombre de la persona si lo conocemos.
 */
export function redactLine(text, { names = [] } = {}) {
  let t = text;
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]');
  // Números largos (cédulas, cuentas, tarjetas): solo quedan los últimos 4 dígitos
  t = t.replace(/\b\d[\d*]{6,}\d\b/g, m => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 7) return m;
    // No tapar montos con separadores de miles (1.234.567 o 1,234,567.00)
    if (/^\d{1,3}([.,]\d{3})+([.,]\d{2})?$/.test(m.trim())) return m;
    return `••••${digits.slice(-4)}`;
  });
  t = t.replace(/\b(CC|C\.C\.|NIT|CEDULA|CÉDULA)[-:\s]*[\d.]+/gi, '$1 [oculto]');
  t = t.replace(/\b(CALLE|CL|CLL|CARRERA|CRA|KR|AV|AVENIDA|DIAGONAL|TRANSVERSAL)\.?\s+\d+[^,\n]{0,40}/gi, '[dirección]');
  for (const n of names.filter(n => n && n.length > 3)) {
    t = t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[nombre]');
  }
  return t;
}

export function redactLines(lines, opts) {
  return lines.map((l, i) => ({ i, page: l.page, text: redactLine(l.text, opts) }));
}

/**
 * Verificación anti-invento: un movimiento que devuelve la IA solo se acepta
 * si su valor aparece escrito en la línea del extracto que la IA citó.
 */
export function verifyAgainstLine(tx, line) {
  if (!line) return false;
  const digits = String(Math.abs(Math.round(Number(tx.amount) * 100))).replace(/0+$/, '');
  const lineDigits = line.text.replace(/\D/g, '');
  const intPart = String(Math.trunc(Math.abs(Number(tx.amount))));
  return lineDigits.includes(intPart) || (digits.length > 2 && lineDigits.includes(digits));
}

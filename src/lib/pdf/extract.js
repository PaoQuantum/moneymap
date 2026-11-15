/**
 * Extracción de texto de PDFs, línea por línea, con número de página.
 *
 * Funciona igual en el navegador y en Node: recibe la librería pdfjs ya cargada.
 * El PDF nunca sale del dispositivo: se abre y se lee aquí mismo.
 *
 * Devuelve: { pages, lines: [{ page, text }] }
 * Errores con código:
 *   - PASSWORD_REQUIRED: el PDF tiene clave y no se dio ninguna
 *   - PASSWORD_INCORRECT: la clave no abrió el PDF
 */

export class PdfPasswordError extends Error {
  constructor(code) {
    super(code === 'PASSWORD_REQUIRED' ? 'Este extracto tiene clave' : 'La clave no abrió este extracto');
    this.code = code;
  }
}

// Agrupa los fragmentos de texto de una página en líneas, según su altura (y).
// Cuando hay un espacio grande entre fragmentos deja dos espacios, para que
// las columnas del extracto (fecha, descripción, valor) se puedan separar.
function itemsToLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const h = Math.abs(it.transform[3]) || it.height || 8;
    let row = rows.find(r => Math.abs(r.y - y) <= Math.max(2, h * 0.45));
    if (!row) { row = { y, h, items: [] }; rows.push(row); }
    row.items.push({ x, w: it.width || 0, str: it.str, h });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.items.sort((a, b) => a.x - b.x);
    let text = '';
    let lastEnd = null;
    for (const it of r.items) {
      if (lastEnd !== null) {
        const gap = it.x - lastEnd;
        const charW = (it.h || 8) * 0.5;
        if (gap > charW * 2.2) text += '   ';
        else if (gap > charW * 0.25 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      }
      text += it.str;
      lastEnd = it.x + it.w;
    }
    return text.replace(/\s+$/, '');
  }).filter(t => t.trim());
}

export async function extractPdfLines(pdfjsLib, data, password) {
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data,
      password: password || undefined,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  } catch (err) {
    if (err && err.name === 'PasswordException') {
      // code 1 = falta la clave, code 2 = clave incorrecta
      throw new PdfPasswordError(err.code === 2 ? 'PASSWORD_INCORRECT' : 'PASSWORD_REQUIRED');
    }
    throw err;
  }

  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const text of itemsToLines(content.items)) lines.push({ page: p, text });
  }
  const pages = pdf.numPages;
  await pdf.destroy();
  return { pages, lines };
}

/**
 * Intenta abrir el PDF con varias claves (por ejemplo, la cédula guardada).
 * Devuelve el resultado y cuál clave funcionó.
 */
export async function extractWithPasswords(pdfjsLib, bytes, passwords = []) {
  const tries = [undefined, ...passwords.filter(Boolean)];
  let lastError;
  for (const pw of tries) {
    try {
      // pdfjs consume el buffer: se pasa una copia en cada intento
      const result = await extractPdfLines(pdfjsLib, bytes.slice(0), pw);
      return { ...result, passwordUsed: pw || null };
    } catch (err) {
      lastError = err;
      if (!(err instanceof PdfPasswordError)) throw err;
    }
  }
  throw lastError;
}

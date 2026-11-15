'use client';
import { extractWithPasswords, PdfPasswordError } from './pdf/extract.js';
import { processLines } from './parsers/index.js';
import { makeAiFallback } from './engine/ai-fallback.js';

let pdfjsPromise = null;
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/build/pdf.min.mjs').then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return lib;
    });
  }
  return pdfjsPromise;
}

/**
 * Procesa un PDF de principio a fin: lo abre (probando las claves guardadas),
 * reconoce el banco, lee los movimientos y los comprueba.
 * Devuelve { status, ... } con status: 'done' | 'needs_password' | 'unsupported' | 'error'
 */
export async function importPdf({ bytes, filename, origin, passwords, names }) {
  // Algunos bancos mandan el "extracto" como página web (HTML) aunque el archivo diga .pdf
  const head = new TextDecoder().decode(bytes.slice(0, 1024));
  if (!head.includes('%PDF')) {
    return {
      status: 'unsupported',
      message: /<html|<!doctype/i.test(head)
        ? 'Este archivo no es un PDF sino una página web del banco (normalmente trae un enlace para descargar el extracto real).'
        : 'Este archivo no es un PDF.',
    };
  }
  const pdfjs = await loadPdfjs();
  let extracted;
  try {
    extracted = await extractWithPasswords(pdfjs, bytes, passwords);
  } catch (err) {
    if (err instanceof PdfPasswordError) {
      return { status: 'needs_password', wrong: err.code === 'PASSWORD_INCORRECT' || passwords.length > 0 };
    }
    return { status: 'error', message: 'No pude abrir este PDF. Puede estar dañado.' };
  }
  try {
    const result = await processLines({
      lines: extracted.lines,
      pages: extracted.pages,
      filename,
      origin,
      llm: makeAiFallback({ names }),
    });
    if (!result.ok) return { status: 'unsupported', message: result.message };
    return { status: 'done', passwordUsed: extracted.passwordUsed, ...result };
  } catch (err) {
    if (err.code === 'AI_NOT_CONFIGURED') {
      return { status: 'unsupported', message: 'Todavía no sé leer este banco y la lectura con IA no está activada.' };
    }
    return { status: 'error', message: err.message || 'Algo falló al leer este extracto.' };
  }
}

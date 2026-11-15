/**
 * Extractos SINTÉTICOS que imitan el formato de cada banco (datos 100 % inventados).
 * Si un cambio en un lector rompe alguno, las pruebas fallan antes de llegar a usuarios.
 * Para agregar un banco: copia la estructura de su PDF con datos falsos y anota lo esperado.
 */
const L = arr => arr.map((text, i) => ({ page: 1 + Math.floor(i / 40), text }));

export const FIXTURES = [
  {
    name: 'BBVA · cuenta de ahorros',
    lines: L([
      'CUENTA DE AHORROS',
      'PERIODO DESDE: 01-09-2026 HASTA: 30-09-2026',
      'SALDO CIERRE MES ANTERIOR 500,000.00',
      '1 02-09-2026 02-09-2026 COMPRA EN TIENDA DEMO NORTE   80,000.00   420,000.00',
      '2 15-09-2026 15-09-2026 NC ABONO NOMINAS EMPRESA DEMO   3,000,000.00   3,420,000.00',
      '3 16-09-2026 16-09-2026 PAGO DE TARJETA DE CREDITO *1111   400,000.00   3,020,000.00',
      '4 20-09-2026 20-09-2026 CARGO CLIENTE PRIM SEG. SEGURO DEMO   30,000.00   2,990,000.00',
      'SALDO FINAL 2,990,000.00',
    ]),
    expect: { parserId: 'bbva-cuenta', count: 4, checkOk: true, period: '2026-09', kinds: { income: 1, card_payment: 1, insurance: 1, expense: 1 } },
  },
  {
    name: 'BBVA · tarjeta de crédito (2 tarjetas, cuotas y pago)',
    lines: L([
      'ESTADO DE CUENTA',
      'FECHA DE CORTE 30-09-2026   PAGO HASTA 18-10-2026',
      'TASA MAXIMA 28.76% E.A.',
      'MOVIMIENTOS DE ESTE MES',
      'TARJETA 450000******1111',
      '14092026   000000   CUOTA DE MANEJO AL 09-2026   1.00   01 DE 01   34,700.00   34,700.00   0.00',
      '12092026   000000   TIENDA DEMO CENTRO   28.76   00 DE 36   120,000.00   120,000.00   0.00   120,000.00',
      '20092026   000000   PAGO TARJETA DE CRED   -   200,000.00',
      'TARJETA 450000******2222',
      '14092026   000000   CUOTA DE MANEJO AL 09-2026   1.00   01 DE 01   17,350.00   17,350.00   0.00',
    ]),
    expect: { parserId: 'bbva-tarjeta', count: 4, period: '2026-09', cards: ['1111', '2222'], kinds: { fee: 2, expense: 1, card_payment: 1 } },
  },
  {
    name: 'Bancolombia · tarjeta (pesos, cuotas, compras de meses anteriores y dólares)',
    lines: L([
      'Bancolombia',
      'Tarjeta: ****9999',
      'Periodo facturado 15 sep - 15 oct. 2026',
      'Pagar antes de oct. 31, 2026',
      'Compras del mes $ 150.000,00',
      'Intereses de mora $ 5.000,00',
      'Moneda: PESOS',
      'Nuevos movimientos',
      '123456 20/09/2026 SUPERMERCADO DEMO   $ 100.000,00   1/1   $ 0,00',
      '123457 25/09/2026 FARMACIA DEMO   $ 50.000,00   1/3   1,90 %   25,34 %   $ 33.333,33',
      '000000 30/09/2026 ABONO SUCURSAL VIRTUAL   $ -300.000,00',
      '000000 15/10/2026 INTERESES MORA   $ 5.000,00',
      'Movimientos antes de 15 sep.',
      '111111 10/08/2026 TIENDA ANTERIOR   $ 20.000,00   2/6   $ 13.333,33',
      'Moneda: DOLARES',
      'Nuevos movimientos',
      '222222 01/10/2026 SERVICIO DIGITAL   $ 10,00   1/1   $ 0,00',
    ]),
    expect: { parserId: 'bancolombia-tarjeta', count: 6, checkOk: true, period: '2026-10', due: '2026-10-31', previous: 1, usd: 1 },
  },
  {
    name: 'BBVA · crédito hipotecario',
    lines: L([
      '1111   2222   Oficina: 0001   HIPOTECARIO CAMPAÑA DEMO',
      'En cumplimiento de la Ley 2300/23,',
      '0013   0001   03   9600001234   comunicación son:Llamadas telefónicas,',
      '13 DE 240   y WhatsApp.',
      '9.79 E.A   29-09-2026 AL 28-10-2026',
    ]),
    expect: { parserId: 'bbva-credito', count: 0, checkOk: true, period: '2026-10', last4: '1234' },
  },
];

# MoneyMap

Sube tus extractos bancarios (o tráelos directo de Gmail) y entiende en qué se va tu plata, qué cobros puedes reclamar y de dónde sale cada número.

**Privacidad primero:** los PDF se abren y se leen en tu navegador. Tus movimientos se guardan solo en tu dispositivo (localStorage). Ningún servidor ve tus extractos ni tu clave.

## Qué hace

1. **Abre PDF con clave.** Escribes tu cédula una vez y se usa para abrir todos los extractos. Puedes elegir que se recuerde en ese dispositivo.
2. **Trae extractos de Gmail.** Con permiso de solo lectura busca correos con extractos en PDF y los descarga. Desde tu navegador, sin servidor de por medio.
3. **Los nombra y ordena.** Cada extracto queda como, por ejemplo, `BBVA · Tarjeta de crédito *1234 · octubre 2026`. También guarda de dónde llegó (cuenta de correo, remitente y fecha, o el archivo subido).
4. **Comprueba los números.**
   - Cuenta: saldo inicial + movimientos = saldo final.
   - Tarjeta: suma de compras = "Compras del mes".
   - Si algo no cuadra, lo dice.
5. **Muestra de dónde sale cada número.** Cada movimiento y cada hallazgo muestran la línea exacta del PDF, la página y el extracto. Así nada es inventado.
6. **Encuentra cobros:**
   - cuotas de manejo (con tabla lista para el reclamo)
   - intereses de mora
   - compras diferidas a muchas cuotas
   - avances
   - seguros en la tarjeta
   - suscripciones
7. **Unifica comercios.** "COMPRA EN MERCAR SEDE NORTE" (BBVA) y "MERCAR SEDE SUR" (Bancolombia) quedan como **Mercar**. Así ves dónde más gastas, sin importar el banco ni la sede.
8. **Aprende de tus correcciones.** Si cambias la categoría o el tipo de un movimiento, puedes aplicarlo a todo ese comercio. Se usa también en los extractos que importes después, y la regla se puede quitar.
9. **No cuenta dos veces.** Los pagos a la tarjeta, los movimientos entre tus cuentas y las inversiones no se suman como gasto. Una compra a cuotas que aparece en varios extractos se muestra y se cuenta una sola vez.

## Bancos que lee hoy

| Banco | Producto | Detalle |
|---|---|---|
| BBVA | Cuenta de ahorros | Movimientos con signo confirmado por saldo, y conciliación |
| BBVA | Tarjeta de crédito | Varias tarjetas por extracto, cuotas y tasas |
| BBVA | Créditos (hipotecario, consumo) | Reconoce y ordena; muestra en qué cuota vas |
| Bancolombia | Tarjeta de crédito (Amex/Visa/Master) | Pesos y dólares, cuotas, conciliación con "Compras del mes" |
| Bancolombia | Cuenta de ahorros | Movimientos |
| Nu | Cuenta | Reconoce el extracto (meses sin movimientos) |

Si un extracto no es de estos bancos, la app lo dice claramente. Si activas la lectura con IA (opcional, ver abajo), intenta leerlo. Cada movimiento que devuelve la IA tiene que aparecer escrito en el PDF; si no aparece, se descarta.

## Correr en tu computador

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # pruebas con datos inventados
```

## Activar "Buscar en mi Gmail" (opcional)

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) y crea un proyecto.
2. Ve a **APIs y servicios → Biblioteca** y activa **Gmail API**.
3. En **Pantalla de consentimiento OAuth**:
   - Tipo: Externo.
   - Agrega el scope `https://www.googleapis.com/auth/gmail.readonly`.
   - En **Usuarios de prueba**, agrega los correos que van a usar la app (hasta 100 mientras esté en modo prueba).
4. En **Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo: Aplicación web.
   - En **Orígenes autorizados de JavaScript**, agrega `http://localhost:3000` y tu dominio.
5. Crea un archivo `.env.local`:
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=tu-id.apps.googleusercontent.com
   ```

> `gmail.readonly` es un permiso "restringido". Para abrir la app a cualquier persona (más de 100 usuarios), Google exige una verificación de seguridad. Para probar con tu equipo o con usuarios beta, el modo prueba es suficiente.

## Activar la lectura con IA para bancos no soportados (opcional)

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5   # opcional
```

Solo se envían a la IA las líneas del extracto **ya anonimizadas**: sin nombre, correo, cédula, dirección ni números de cuenta completos. Los movimientos leídos con IA quedan marcados "para revisar".

## Estructura

```
src/lib/pdf/extract.js       Abre el PDF (con o sin clave) y lo convierte en líneas
src/lib/parsers/             Un lector por banco y producto + processLines()
src/lib/engine/classify.js   Tipo (gasto, pago de tarjeta, transferencia…) y categoría
src/lib/engine/insights.js   Hallazgos con evidencia y resumen mensual
src/lib/engine/merchant.js   Nombre normalizado del comercio y reglas aprendidas
src/lib/engine/redact.js     Anonimización y verificación anti-invento
src/lib/gmail.js             Búsqueda y descarga de extractos desde el navegador
src/lib/store.js             Guardado local
src/components/              Importer, Findings (con reclamo), Summary, Transactions, Documents
```

## Agregar un banco nuevo

Crea un archivo en `src/lib/parsers/` que exporte `{ id, bank, product, detect(lines), parse(lines) }`. Luego regístralo en `PARSERS` en `index.js`. `parse` debe devolver:
- los movimientos, cada uno con su `line` y `page` originales;
- un `check` que diga si los totales cuadran.

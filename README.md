# MoneyMap

**Recupera lo que el banco te cobró de más.** Sube tus extractos, reenvíalos desde tu correo o tráelos de Gmail. MoneyMap encuentra los cobros que puedes reclamar (cuotas de manejo, seguros que no pediste, compras diferidas sin autorización, intereses de mora) y te deja el reclamo listo, con la prueba de cada cobro.

**Privacidad:** los PDF se abren y se leen en tu navegador, y tus movimientos se guardan solo en tu dispositivo. El buzón de reenvío guarda los PDF tal como llegan (protegidos con tu clave), sin abrirlos, y los borra apenas los importas o a los 30 días.

## Qué hace

1. **Te dice cuánta plata puedes pedir que te devuelvan.** En el inicio solo suma lo que de verdad se puede reclamar. El valor de las compras a cuotas o los seguros obligatorios de un crédito no se suman como si fueran plata perdida.
2. **Reclamos listos.** Para cada hallazgo arma una tabla de cobros con su extracto y su página, el texto para copiar, y lo que sigue: radicado, 15 días hábiles, Defensor del Consumidor Financiero o Superfinanciera.
3. **Seguimiento.** Cada reclamo tiene un estado: por reclamar, enviado, me devolvieron o no aceptaron. Puedes anotar el radicado y cuánto recuperaste.
4. **Tres formas de traer extractos:**
   - subir PDF;
   - **buzón de reenvío**: una dirección personal a la que reenvías los correos del banco, y llegan solos cada mes;
   - Gmail con permiso de solo lectura.
5. **Abre PDF con clave.** Tu cédula se escribe una vez.
6. **Lectura verificada.** Los lectores propios comprueban los totales del banco (saldo inicial + movimientos = saldo final, o suma de compras = "Compras del mes").
   - Para bancos sin lector propio, o cuando el lector no cuadra, se usa la IA. Su resultado pasa por un **juez**: cada movimiento tiene que estar escrito en el PDF y los totales tienen que cuadrar. Si no cuadra, todo queda marcado "para revisar".
7. **De dónde sale cada número.** Cada cobro muestra la línea exacta del PDF, la página, el extracto y cómo llegó (correo, buzón o archivo).
8. **Comercios unificados** entre bancos y sedes, y **reglas que aprenden** de tus correcciones.
9. **No cuenta dos veces:**
   - los pagos a tarjetas, las transferencias propias y las inversiones no son gasto;
   - una compra a cuotas que aparece en varios extractos se cuenta una vez.
10. **Copia cifrada** (AES-256 con tu contraseña) para pasar tus datos a otro dispositivo o no perderlos.

## Bancos con lector propio

| Banco | Producto | Comprobación |
|---|---|---|
| BBVA | Cuenta de ahorros | Saldo inicial + movimientos = saldo final |
| BBVA | Tarjeta de crédito | Varias tarjetas, cuotas y tasas |
| BBVA | Créditos (hipotecario, consumo) | Reconoce el crédito y la cuota en que vas |
| Bancolombia | Tarjeta de crédito | Pesos y dólares; suma de compras = "Compras del mes" |
| Bancolombia | Cuenta de ahorros | Movimientos |
| Banco de Occidente | Cuenta de ahorros o corriente | Saldo anterior + créditos − débitos = saldo actual |
| Nu | Cuenta | Meses sin movimientos |

Cualquier otro banco se lee con el lector universal con IA (si está activado) y pasa por el juez.

## Correr en tu computador

```bash
npm install
cp .env.example .env.local   # todo es opcional
npm run dev                  # http://localhost:3000
npm test                     # 30 pruebas con datos inventados (también corren en GitHub Actions)
```

## Buzón de reenvío (opcional, recomendado)

Necesitas un dominio, una cuenta de [Postmark](https://postmarkapp.com) (correo entrante) y una base [Upstash Redis](https://upstash.com). Ambas tienen plan gratis.

1. **Postmark:**
   - Crea un *Inbound stream*.
   - Apunta el registro MX de un subdominio (por ejemplo `buzon.tudominio.co`) a `inbound.postmarkapp.com`.
   - En *Webhook URL* pon `https://tu-app.vercel.app/api/inbound?secret=TU_INBOUND_SECRET`.
2. **Upstash:** crea una base Redis y copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
3. **Variables:**
   ```
   NEXT_PUBLIC_INBOX_ADDRESS=extractos@buzon.tudominio.co
   INBOUND_SECRET=una-clave-larga-y-aleatoria
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   ```

Cada persona crea su dirección en la app (`extractos+<código-secreto>@buzon.tudominio.co`). Luego pone un filtro en su correo para reenviar ahí los correos del banco. El código de confirmación que manda Gmail al activar el reenvío aparece dentro de la app.

> **Antes de abrirlo a usuarios reales:** el buzón guarda archivos de terceros. Los PDF siguen cifrados con la clave del banco, pero igual debes:
> - publicar una política de tratamiento de datos (Ley 1581 de 2012);
> - registrar la base de datos ante la SIC si aplica;
> - agregar límite de solicitudes a `/api/inbox`.

## Gmail (opcional)

1. En [Google Cloud Console](https://console.cloud.google.com/):
   - Crea un proyecto y activa **Gmail API**.
   - En la **Pantalla de consentimiento OAuth**, elige tipo Externo, agrega el scope `gmail.readonly` y los usuarios de prueba (hasta 100).
2. En **Credenciales**, crea un **ID de cliente OAuth** de tipo Aplicación web y agrega tus dominios en *Orígenes autorizados*.
3. `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...`

> `gmail.readonly` es un permiso restringido: abrirlo a cualquier persona exige una verificación de seguridad de Google. Para empezar, el buzón de reenvío no tiene esa limitación.

## Lector universal con IA (opcional)

```
ANTHROPIC_API_KEY=sk-ant-...
```

Solo se envían líneas **anonimizadas**: sin nombre, correo, cédula, dirección ni números completos. Ver `src/lib/engine/judge.js` para las reglas del juez.

## Estructura

```
src/lib/pdf/extract.js        Abre el PDF (con o sin clave) y lo convierte en líneas
src/lib/parsers/              Lectores propios por banco + processLines()
src/lib/engine/judge.js       Juez de la lectura con IA (líneas citadas + totales que cuadran)
src/lib/engine/classify.js    Tipo (gasto, pago de tarjeta, transferencia…) y categoría
src/lib/engine/merchant.js    Comercio normalizado y reglas aprendidas
src/lib/engine/insights.js    Hallazgos con evidencia y resumen mensual
src/lib/engine/claims.js      Texto y tabla de cada reclamo
src/lib/engine/redact.js      Anonimización
src/lib/backup.js             Copia cifrada
src/lib/gmail.js, inbox.js    Traer extractos del correo
src/lib/server/inbox-store.js Buzón temporal (Upstash o memoria)
src/app/api/                  extract (IA), inbound (webhook), inbox (buzón)
tests/fixtures/               Extractos sintéticos por banco
docs/validacion.md            Plan para validar con 10 personas
```

## Agregar un banco

1. Crea un extracto sintético en `tests/fixtures/statements.js` con la estructura real del PDF y datos falsos.
2. Escribe el lector en `src/lib/parsers/`, con `detect`, `parse` y un `check` que compruebe los totales del banco.
3. Regístralo en `PARSERS` y corre `npm test`.

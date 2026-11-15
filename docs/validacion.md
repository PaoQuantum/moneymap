# Plan de validación: 10 personas, 4 semanas

La pregunta que hay que responder antes de construir más: **¿la gente reclama la plata que la app le encuentra?**
Si nadie reclama, el problema no es el código.

## A quién buscar
- 10 personas con al menos una tarjeta de crédito, de 2 o más bancos distintos si se puede.
- Mezcla: 5 cercanas (amigos, familia) y 5 que no te deban favores (compañeros de compañeros, un grupo de LinkedIn o WhatsApp).
- Evita a perfiles técnicos: buscas a quien nunca le pediría esto a un chatbot.

## Qué hacer
| Semana | Acción |
|---|---|
| 1 | Sesión de 20 min con cada persona (en persona o en videollamada). Que importe sus extractos sin ayuda; tú solo miras y anotas dónde se traba. |
| 1 | Al final pregunta: "¿Qué harías ahora con esto?" (sin sugerir el reclamo). |
| 2–3 | No hagas nada. Mira si vuelven solas y si cambian el estado de algún reclamo. |
| 4 | Llamada de 10 min: ¿reclamó?, ¿qué le respondió el banco?, ¿cuánto le devolvieron?, ¿pagaría por esto? ¿cuánto? |

## Métricas (anótalas en una tabla)
| Métrica | Meta para seguir |
|---|---|
| Importa al menos 1 extracto sin ayuda | 8 de 10 |
| La app le encuentra al menos 1 cobro reclamable | 6 de 10 |
| **Envía al menos 1 reclamo** | **3 de 10** |
| Le devuelven plata | 1 de 10 |
| Activa el buzón de reenvío | 3 de 10 |

**Si menos de 3 de 10 reclaman:** el valor no está en "recuperar". Prueba el ángulo de "dejar de perder" (diferidos, mora) o replantea antes de escribir más código.

## Prueba por WhatsApp (sin código)
Antes de construir un bot, haz la prueba a mano ("mago de Oz"):
1. Crea un número de WhatsApp Business solo para esto.
2. Mensaje para compartir: "Mándame tu extracto en PDF y te digo gratis qué te cobró de más tu banco".
3. Cuando llegue un PDF, tú lo pasas por MoneyMap y respondes con el resultado y el texto del reclamo.
4. Mide: cuántas personas mandan el PDF, cuánto tardan en responder y si reclaman.

Si WhatsApp convierte mucho mejor que la web, ese es tu canal y vale la pena automatizarlo (API de WhatsApp Business + el mismo lector de MoneyMap).

## Lo que NO debes hacer en esta etapa
- Pedir la cédula por WhatsApp o guardar extractos de otras personas sin su autorización por escrito (Ley 1581 de habeas data).
- Prometer que el banco va a devolver la plata: lo correcto es "te ayudamos a pedirla".

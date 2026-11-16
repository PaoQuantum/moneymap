'use client';
import s from '../app/app.module.css';
import { fmt } from '../lib/engine/insights.js';
import Findings from './Findings.js';

/**
 * Pantalla principal: cuánta plata puedes recuperar y dejar de perder,
 * y en qué van tus reclamos. Lo demás (gastos, movimientos) es secundario.
 */
export default function Home({ insights, txById, docById, claims, onClaim, docsCount, periodText }) {
  const status = id => claims[id]?.status || 'todo';
  const recoverable = insights.filter(f => f.type === 'recover' && !['won', 'lost'].includes(status(f.id)));
  const toRecover = recoverable.reduce((a, f) => a + (f.amount || 0), 0);
  // Solo cuenta plata que de verdad se pierde (intereses, mora), no el valor de las compras a cuotas
  const toSave = insights.filter(f => f.type === 'save' && !f.notLost).reduce((a, f) => a + (f.amount || 0), 0);
  const sent = Object.values(claims).filter(c => c.status === 'sent').length;
  const recovered = Object.values(claims).filter(c => c.status === 'won').reduce((a, c) => a + (c.recovered || 0), 0);
  const pending = insights.filter(f => f.claim && status(f.id) === 'todo').length;

  return (
    <div>
      <div className={s.homeHero}>
        <div>
          <div className={s.tileLabel}>Plata que puedes pedir que te devuelvan</div>
          <div className={s.homeBig}>{fmt(toRecover)}</div>
          {toSave > 0 && <div className={s.small}>y {fmt(toSave)} en intereses que puedes dejar de pagar</div>}
          <div className={s.small} style={{ marginTop: 6 }}>Revisé {docsCount} extracto{docsCount === 1 ? '' : 's'}{periodText ? ` · ${periodText}` : ''}.</div>
        </div>
        <div className={s.homeStats}>
          <div><div className={s.tileValue}>{pending}</div><div className={s.small}>por reclamar</div></div>
          <div><div className={s.tileValue}>{sent}</div><div className={s.small}>enviados</div></div>
          <div><div className={`${s.tileValue} ${s.pos}`}>{fmt(recovered)}</div><div className={s.small}>recuperado</div></div>
        </div>
      </div>
      <Findings insights={insights} txById={txById} docById={docById} claims={claims} onClaim={onClaim} />
    </div>
  );
}

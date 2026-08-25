import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../lib/api';

export default function Admin() {
  const [view, setView] = useState('list'); // 'list' | 'detail'
  const [usuarios, setUsuarios] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null); // { id, nombre, email }
  const [datos, setDatos] = useState(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const navigate = useNavigate();
  const adminName = localStorage.getItem('adminName') || 'Contador';

  function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    navigate('/');
  }

  // Search users
  const buscar = useCallback(async () => {
    const data = await api(`/api/admin/usuarios?q=${encodeURIComponent(query)}`);
    if (data.error) { logout(); return; }
    setUsuarios(data.usuarios || []);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(buscar, 250);
    return () => clearTimeout(t);
  }, [buscar]);

  // Load user detail
  async function verUsuario(u) {
    setSelected(u);
    setView('detail');
    setDesde(''); setHasta('');
    const data = await api(`/api/admin/usuarios/${u.id}/datos`);
    setDatos(data);
  }

  async function refresh() {
    if (!selected) return;
    const data = await api(`/api/admin/usuarios/${selected.id}/datos`);
    setDatos(data);
  }

  function filteredTxs() {
    if (!datos?.transactions) return [];
    return datos.transactions.filter(t => {
      if (desde && t.fecha < desde) return false;
      if (hasta && t.fecha > hasta) return false;
      return true;
    });
  }

  function exportCSV() {
    const txs = filteredTxs();
    if (!txs.length) { alert('No hay movimientos para exportar.'); return; }
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Fecha', 'Descripcion', 'Cuenta', 'Tipo', 'Monto']];
    txs.forEach(t => {
      const accName = datos.accounts?.find(a => a.id === t.cuenta)?.nombre || '';
      rows.push([t.fecha, t.descripcion, accName, t.tipo, t.monto.toFixed(2)]);
    });
    const csv = '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n');
    const nombre = (selected?.nombre || 'user').replace(/[^a-z0-9]+/gi, '_');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `movimientos_${nombre}_${desde || 'inicio'}_${hasta || 'hoy'}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // LIST VIEW
  if (view === 'list') {
    return (
      <div className="max-w-[940px] mx-auto px-5 py-8 pb-16">
        <div className="flex justify-between items-center">
          <div className="flex items-end gap-2">
            <svg width="27" height="24" viewBox="0 0 24 24" fill="#1f3a52">
              <rect x="2" y="13" width="4.6" height="8" rx="2.3"/>
              <rect x="9.7" y="8" width="4.6" height="13" rx="2.3"/>
              <rect x="17.4" y="3" width="4.6" height="18" rx="2.3"/>
            </svg>
            <span className="font-serif text-[23px] font-semibold tracking-tight leading-none">
              Bluema<span className="text-brand-600">x</span>p
            </span>
            <span className="text-xs text-brand-600 bg-brand-50 rounded-full px-2.5 py-0.5 font-semibold self-center ml-1">Contador</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
            Salir
          </button>
        </div>

        <div className="mt-7">
          <div className="text-xs tracking-widest uppercase text-gray-400">Panel del contador</div>
          <h1 className="font-serif text-[38px] font-medium tracking-tight mt-1 capitalize">Hola, {adminName}</h1>
        </div>

        <div className="relative mt-6">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" className="absolute left-3.5 top-3.5">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <input
            className="w-full pl-11 pr-4 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
            placeholder="Buscar usuario por nombre o email..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="text-xs tracking-wider uppercase text-gray-400 mt-5">Tus clientes</div>
        <div className="mt-2 space-y-3">
          {usuarios.length === 0 && <p className="text-gray-400 text-sm mt-4">No hay usuarios que coincidan.</p>}
          {usuarios.map(u => (
            <div
              key={u.id}
              onClick={() => verUsuario(u)}
              className="flex justify-between items-center gap-3 p-5 bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[14px] shadow-sm cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3.5">
                <span className="w-[38px] h-[38px] rounded-full bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 flex items-center justify-center font-semibold text-[15px] shadow-inner">
                  {(u.nombre[0] || '?').toUpperCase()}
                </span>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold text-[15px] capitalize">{u.nombre}</span>
                    {u.conectado
                      ? <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-50 text-pos border border-pos/20">Conectado</span>
                      : <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">Sin banco</span>
                    }
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{u.email} &middot; {u.cantidadCuentas} cuentas &middot; {u.cantidadTransacciones} movimientos</div>
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300 group-hover:text-brand-600 transition-colors">
                <path d="M9 6l6 6-6 6"/>
              </svg>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // DETAIL VIEW
  const txs = filteredTxs();
  const totalDeb = txs.filter(t => t.tipo === 'debito').reduce((s, t) => s + t.monto, 0);
  const totalCred = txs.filter(t => t.tipo === 'credito').reduce((s, t) => s + t.monto, 0);
  const saldoTotal = (datos?.accounts || []).reduce((s, a) => s + (a.saldo || 0), 0);

  return (
    <div className="max-w-[940px] mx-auto px-5 py-8 pb-16">
      <button onClick={() => { setView('list'); setDatos(null); }} className="text-brand-600 text-sm underline">
        &larr; Volver a usuarios
      </button>

      <div className="flex justify-between items-center mt-4 pb-5 border-b border-gray-200">
        <div className="flex items-center gap-3.5">
          <span className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center font-semibold text-[22px]">
            {(selected?.nombre?.[0] || '?').toUpperCase()}
          </span>
          <div>
            <h1 className="font-serif text-[30px] font-medium tracking-tight capitalize">{selected?.nombre}</h1>
            <div className="text-xs text-gray-400 mt-0.5">{selected?.email}</div>
            {datos && (
              <div className="mt-2">
                {datos.conectado
                  ? <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-50 text-pos border border-pos/20">Banco conectado</span>
                  : <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">Sin banco conectado</span>
                }
              </div>
            )}
          </div>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md transition-all">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>
          Actualizar
        </button>
      </div>

      {!datos ? (
        <p className="text-gray-400 text-sm mt-6">Cargando...</p>
      ) : (
        <>
          {/* Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
            <MiniTile label="Cuentas" value={datos.accounts?.length || 0} />
            <MiniTile label="Saldo total" value={fmt(saldoTotal)} />
            <MiniTile label="Movimientos" value={txs.length} />
            <MiniTile label="Debitos" value={fmt(totalDeb)} className="text-neg" />
            <MiniTile label="Creditos" value={fmt(totalCred)} className="text-pos" />
          </div>

          {/* Accounts table */}
          <h3 className="font-serif text-xl font-semibold mt-8">Cuentas</h3>
          {datos.accounts?.length ? (
            <div className="mt-3 border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Cuenta</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Tipo</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">N°</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.accounts.map(a => (
                    <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">{a.nombre}</td>
                      <td className="px-4 py-3">{a.tipo}</td>
                      <td className="px-4 py-3">{a.mask}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium">{fmt(a.saldo)} {a.moneda}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm mt-3">Sin cuentas todavia.</p>
          )}

          {/* Transactions */}
          <h3 className="font-serif text-xl font-semibold mt-8">Movimientos</h3>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <label className="text-xs text-gray-400">Desde
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="ml-1.5 px-3 py-2 border border-gray-200 rounded-[10px] text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10" />
            </label>
            <label className="text-xs text-gray-400">Hasta
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="ml-1.5 px-3 py-2 border border-gray-200 rounded-[10px] text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10" />
            </label>
            <button onClick={() => { setDesde(''); setHasta(''); }} className="px-3 py-2 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 transition-all">Limpiar</button>
            <button onClick={exportCSV} className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-b from-brand-500 to-brand-600 text-white font-semibold text-sm rounded-[11px] shadow-lg shadow-brand-600/25 hover:brightness-110 hover:-translate-y-0.5 transition-all">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg>
              Exportar CSV
            </button>
          </div>
          <div className="text-xs text-gray-400 mt-2">{txs.length} movimiento(s)</div>

          {txs.length ? (
            <div className="mt-3 border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Fecha</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Descripcion</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Cuenta</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Tipo</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.slice(0, 50).map((t, i) => {
                    const accName = datos.accounts?.find(a => a.id === t.cuenta)?.nombre || '';
                    return (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">{t.fecha}</td>
                        <td className="px-4 py-3">{t.descripcion}</td>
                        <td className="px-4 py-3">{accName}</td>
                        <td className={`px-4 py-3 ${t.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>{t.tipo}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium">{fmt(t.monto)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {txs.length > 50 && (
                <div className="text-center py-3 text-xs text-gray-400 border-t border-gray-100">
                  Mostrando 50 de {txs.length}. Exporta a CSV para ver todos.
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm mt-3">No hay movimientos con esos filtros.</p>
          )}
        </>
      )}
    </div>
  );
}

function MiniTile({ label, value, className = '' }) {
  return (
    <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[14px] p-4 shadow-sm">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className={`font-mono text-lg font-semibold mt-1.5 tracking-tight tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

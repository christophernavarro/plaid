import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../lib/api';

export default function Admin() {
  const [view, setView] = useState('list');
  const [usuarios, setUsuarios] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [datos, setDatos] = useState(null);
  const [recurring, setRecurring] = useState([]);
  const [liabilities, setLiabilities] = useState(null);
  const [investments, setInvestments] = useState(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [adminTxVisible, setAdminTxVisible] = useState(50);
  const [activeTab, setActiveTab] = useState('cuentas');
  // Tile modal
  const [tileModal, setTileModal] = useState(null);
  // Selected accounts for filtering transactions
  const [selectedAccounts, setSelectedAccounts] = useState(new Set()); // null | 'cuentas' | 'saldo' | 'movimientos' | 'debitos' | 'creditos'
  // Consolidated overview
  const [resumen, setResumen] = useState(null);
  const [overviewModal, setOverviewModal] = useState(null); // null | 'all' | 'connected' | 'nobank'
  // Global search
  const [globalSearch, setGlobalSearch] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const navigate = useNavigate();
  const adminName = localStorage.getItem('adminName') || 'Contador';

  function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    navigate('/');
  }

  const buscar = useCallback(async () => {
    const data = await api(`/api/admin/usuarios?q=${encodeURIComponent(query)}`);
    if (data.error) { logout(); return; }
    setUsuarios(data.usuarios || []);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(buscar, 250);
    return () => clearTimeout(t);
  }, [buscar]);

  // Load consolidated overview
  useEffect(() => {
    api('/api/admin/resumen').then(data => {
      if (!data.error) setResumen(data);
    });
  }, []);

  // Global transaction search
  useEffect(() => {
    if (globalSearch.length < 2) { setGlobalResults([]); return; }
    const t = setTimeout(async () => {
      const data = await api(`/api/admin/buscar-transacciones?q=${encodeURIComponent(globalSearch)}`);
      if (data.resultados) setGlobalResults(data.resultados);
    }, 300);
    return () => clearTimeout(t);
  }, [globalSearch]);

  async function verUsuario(u) {
    setSelected(u);
    setView('detail');
    setDesde(''); setHasta('');
    setActiveTab('cuentas');
    setSelectedAccounts(new Set());
    setRecurring([]); setLiabilities(null); setInvestments(null);
    const data = await api(`/api/admin/usuarios/${u.id}/datos`);
    setDatos(data);
    // Fetch extra data
    const [recRes, liabRes, invRes] = await Promise.all([
      api(`/api/admin/usuarios/${u.id}/recurring`),
      api(`/api/admin/usuarios/${u.id}/liabilities`),
      api(`/api/admin/usuarios/${u.id}/investments`),
    ]);
    if (recRes.recurring) setRecurring(recRes.recurring);
    if (liabRes.liabilities) setLiabilities(liabRes);
    if (invRes.holdings) setInvestments(invRes);
  }

  async function refresh() {
    if (!selected) return;
    const data = await api(`/api/admin/usuarios/${selected.id}/datos`);
    setDatos(data);
  }

  function filteredTxs() {
    if (!datos?.transactions) return [];
    if (selectedAccounts.size === 0) return [];
    return datos.transactions.filter(t => {
      if (desde && t.fecha < desde) return false;
      if (hasta && t.fecha > hasta) return false;
      if (!selectedAccounts.has(t.cuenta)) return false;
      return true;
    });
  }

  function exportCSV() {
    const txs = filteredTxs();
    if (!txs.length) { alert('No transactions to export.'); return; }
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Date', 'Description', 'Account', 'Type', 'Category', 'Channel', 'Status', 'Amount']];
    txs.forEach(t => {
      const accName = datos.accounts?.find(a => a.id === t.cuenta)?.nombre || '';
      rows.push([t.fecha, t.descripcion, accName, t.tipo, t.categoria || '', t.canal || '', t.pendiente ? 'Pending' : 'Confirmed', t.monto.toFixed(2)]);
    });
    const csv = '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\r\n');
    const nombre = (selected?.nombre || 'user').replace(/[^a-z0-9]+/gi, '_');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transactions_${nombre}_${desde || 'start'}_${hasta || 'today'}.csv`;
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
            <span className="text-xs text-brand-600 bg-brand-50 rounded-full px-2.5 py-0.5 font-semibold self-center ml-1">Accountant</span>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md transition-all">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
            Logout
          </button>
        </div>

        <div className="mt-7">
          <div className="text-xs tracking-widest uppercase text-gray-400">Accountant panel</div>
          <h1 className="font-serif text-[38px] font-medium tracking-tight mt-1 capitalize">Hi, {adminName}</h1>
        </div>

        {/* Consolidated Overview */}
        {resumen && (
          <div className="grid grid-cols-3 gap-3 mt-6">
            <MiniTile label="Total clients" value={resumen.totalClientes} onClick={() => setOverviewModal('all')} />
            <MiniTile label="Connected" value={resumen.conectados} className="text-pos" onClick={() => setOverviewModal('connected')} />
            <MiniTile label="No bank" value={resumen.sinBanco} className="text-amber-600" onClick={() => setOverviewModal('nobank')} />
          </div>
        )}

        {/* Overview Modal */}
        {overviewModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-5" onClick={() => setOverviewModal(null)}>
            <div className="bg-white border border-gray-200 rounded-[18px] w-full max-w-[500px] max-h-[75vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start p-5 pb-3">
                <div>
                  <div className="text-[11px] tracking-widest uppercase text-gray-400">Clients</div>
                  <h3 className="font-serif text-2xl font-semibold mt-1">
                    {overviewModal === 'all' && 'All clients'}
                    {overviewModal === 'connected' && 'Connected clients'}
                    {overviewModal === 'nobank' && 'Clients without bank'}
                  </h3>
                </div>
                <button onClick={() => setOverviewModal(null)} className="text-2xl text-gray-400 hover:text-gray-900 px-1.5 rounded-lg hover:bg-gray-100 transition-colors">&times;</button>
              </div>
              <div className="overflow-y-auto px-5 pb-5">
                {usuarios
                  .filter(u => {
                    if (overviewModal === 'connected') return u.conectado;
                    if (overviewModal === 'nobank') return !u.conectado;
                    return true;
                  })
                  .map(u => (
                    <div
                      key={u.id}
                      onClick={() => { setOverviewModal(null); verUsuario(u); }}
                      className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded px-2 transition-colors"
                    >
                      <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 flex items-center justify-center font-semibold text-xs">
                        {(u.nombre[0] || '?').toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium capitalize truncate">{u.nombre}</div>
                        <div className="text-[11px] text-gray-400">{u.email}</div>
                      </div>
                      {u.conectado
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-50 text-pos border border-pos/20">Connected</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">No bank</span>
                      }
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* Alerts */}
        {resumen?.alertas?.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs tracking-wider uppercase text-gray-400">Alerts</div>
            {resumen.alertas.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-[12px]">
                <span className="text-lg">⚠️</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium capitalize">{a.usuario}</span>
                  <span className="text-xs text-gray-500 ml-2">{a.email}</span>
                </div>
                <span className="text-xs text-amber-700 font-medium whitespace-nowrap">{a.mensaje}</span>
              </div>
            ))}
          </div>
        )}

        {/* User list */}
        <div className="mt-6">
          <div className="text-xs tracking-wider uppercase text-gray-400 mb-2">Your clients</div>
          <div className="relative mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" className="absolute left-3.5 top-3.5">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input
              className="w-full pl-11 pr-4 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
              placeholder="Search user by name or email..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="space-y-3">
            {usuarios.length === 0 && <p className="text-gray-400 text-sm mt-4">No users match.</p>}
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
                        ? <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-50 text-pos border border-pos/20">Connected</span>
                        : <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">No bank</span>
                      }
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{u.email} &middot; {u.cantidadCuentas} accounts &middot; {u.cantidadTransacciones} transactions</div>
                  </div>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300">
                  <path d="M9 6l6 6-6 6"/>
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity + Top spenders */}
        {resumen && (resumen.recentActivity?.length > 0 || resumen.topSpenders?.length > 0) && (
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 mt-6">
            {/* Recent activity */}
            {resumen.recentActivity?.length > 0 && (
              <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[16px] p-5 shadow-sm">
                <div className="text-xs tracking-wider uppercase text-gray-400 mb-3">Recent activity</div>
                <div className="space-y-0">
                  {resumen.recentActivity.map((tx, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {tx.logo ? (
                          <img src={tx.logo} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <span className="text-[10px] font-semibold text-gray-400">{(tx.descripcion || '?')[0].toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{tx.descripcion}</div>
                        <div className="text-[11px] text-gray-400">{tx.usuario} &middot; {tx.fecha}</div>
                      </div>
                      <span className={`font-mono text-xs font-medium whitespace-nowrap ${tx.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>
                        {tx.tipo === 'credito' ? '+' : '-'}{fmt(tx.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top spenders */}
            {resumen.topSpenders?.length > 0 && (
              <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[16px] p-5 shadow-sm">
                <div className="text-xs tracking-wider uppercase text-gray-400 mb-3">Top clients by expenses</div>
                <div className="space-y-0">
                  {resumen.topSpenders.map((u, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded transition-colors" onClick={() => verUsuario({ id: u.id, nombre: u.nombre, email: u.email })}>
                      <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium capitalize truncate">{u.nombre}</div>
                        <div className="text-[11px] text-gray-400">{u.cuentas} accounts</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs font-medium text-neg">{fmt(u.gastos)}</div>
                        <div className="font-mono text-[10px] text-pos">+{fmt(u.ingresos)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global transaction search */}
        <div className="mt-6">
          <div className="text-xs tracking-wider uppercase text-gray-400 mb-2">Search transactions across all users</div>
          <div className="relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" className="absolute left-3.5 top-3.5">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input
              className="w-full pl-11 pr-4 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
              placeholder="Search by description (e.g. Netflix, Uber, Walmart)..."
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
            />
          </div>
          {globalResults.length > 0 && (
            <div className="mt-3 border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2.5 text-xs uppercase tracking-wider text-gray-400 font-semibold">User</th>
                    <th className="px-3 py-2.5 text-xs uppercase tracking-wider text-gray-400 font-semibold">Date</th>
                    <th className="px-3 py-2.5 text-xs uppercase tracking-wider text-gray-400 font-semibold">Description</th>
                    <th className="px-3 py-2.5 text-xs uppercase tracking-wider text-gray-400 font-semibold">Type</th>
                    <th className="px-3 py-2.5 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {globalResults.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => verUsuario({ id: r.usuarioId, nombre: r.usuario, email: r.usuarioEmail })}>
                      <td className="px-3 py-2.5 capitalize">{r.usuario}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.fecha}</td>
                      <td className="px-3 py-2.5">{r.descripcion}</td>
                      <td className={`px-3 py-2.5 ${r.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>{r.tipo}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmt(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {globalResults.length >= 50 && (
                <div className="text-center py-2 text-xs text-gray-400 border-t border-gray-100">Showing max 50 results</div>
              )}
            </div>
          )}
          {globalSearch.length >= 2 && globalResults.length === 0 && (
            <p className="text-gray-400 text-sm mt-3">No transactions found for "{globalSearch}".</p>
          )}
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
    <div className="max-w-[1000px] mx-auto px-5 py-8 pb-16">
      <button onClick={() => { setView('list'); setDatos(null); }} className="text-brand-600 text-sm underline">
        &larr; Back to users
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
                  ? <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-green-50 text-pos border border-pos/20">Bank connected</span>
                  : <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200">No bank connected</span>
                }
              </div>
            )}
          </div>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md transition-all">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/></svg>
          Refresh
        </button>
      </div>

      {!datos ? (
        <p className="text-gray-400 text-sm mt-6">Loading...</p>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
            <MiniTile label="Accounts" value={datos.accounts?.length || 0} onClick={() => setTileModal('cuentas')} />
            <MiniTile label="Total balance" value={fmt(saldoTotal)} onClick={() => setTileModal('saldo')} />
            <MiniTile label="Transactions" value={txs.length} onClick={() => setTileModal('movimientos')} />
            <MiniTile label="Debits" value={fmt(totalDeb)} className="text-neg" onClick={() => setTileModal('debitos')} />
            <MiniTile label="Credits" value={fmt(totalCred)} className="text-pos" onClick={() => setTileModal('creditos')} />
          </div>

          {/* Tile Modal */}
          {tileModal && (
            <AdminTileModal type={tileModal} datos={datos} txs={txs} onClose={() => setTileModal(null)} />
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-6 border-b border-gray-200 overflow-x-auto">
            {[
              { key: 'cuentas', label: 'Accounts' },
              { key: 'movimientos', label: 'Transactions' },
              { key: 'recurrentes', label: 'Recurring' },
              { key: 'deudas', label: 'Liabilities' },
              { key: 'inversiones', label: 'Investments' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-brand-600 text-gray-900'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB: Movimientos */}
          {activeTab === 'movimientos' && (
            <div className="mt-4">
              {selectedAccounts.size > 0 && (
                <div className="text-xs text-gray-500 mb-3 flex items-center gap-2">
                  <span>Showing transactions for {selectedAccounts.size} selected account{selectedAccounts.size !== 1 ? 's' : ''}</span>
                  <button onClick={() => setActiveTab('cuentas')} className="text-brand-600 hover:underline">Edit selection</button>
                </div>
              )}
              {selectedAccounts.size === 0 && datos?.accounts?.length > 0 && (
                <div className="text-center py-12">
                  <div className="text-3xl mb-3">🏦</div>
                  <p className="text-gray-500 text-sm">No accounts selected.</p>
                  <p className="text-gray-400 text-xs mt-1">Go to the Accounts tab and select at least one account to see transactions.</p>
                  <button onClick={() => setActiveTab('cuentas')} className="mt-4 px-4 py-2 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md transition-all">
                    Go to Accounts
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-gray-400">From
                  <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="ml-1.5 px-3 py-2 border border-gray-200 rounded-[10px] text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10" />
                </label>
                <label className="text-xs text-gray-400">To
                  <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="ml-1.5 px-3 py-2 border border-gray-200 rounded-[10px] text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10" />
                </label>
                <button onClick={() => { setDesde(''); setHasta(''); setAdminTxVisible(50); }} className="px-3 py-2 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 transition-all">Clear</button>
                <button onClick={exportCSV} className="ml-auto flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-b from-brand-500 to-brand-600 text-white font-semibold text-sm rounded-[11px] shadow-lg shadow-brand-600/25 hover:brightness-110 hover:-translate-y-0.5 transition-all">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg>
                  Export CSV
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-2">{txs.length} transaction(s)</div>

              {txs.length ? (
                <div className="mt-3 border border-gray-200 rounded-[14px] overflow-hidden shadow-sm overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Date</th>
                        <th className="px-3 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Description</th>
                        <th className="px-3 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Category</th>
                        <th className="px-3 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Channel</th>
                        <th className="px-3 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Status</th>
                        <th className="px-3 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Type</th>
                        <th className="px-3 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txs.slice(0, adminTxVisible).map((t, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 whitespace-nowrap">{t.fecha}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {t.logo && <img src={t.logo} alt="" className="w-5 h-5 rounded-full" />}
                              <span className="truncate max-w-[180px]">{t.descripcion}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{formatCategory(t.categoria)}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">
                            {t.canal === 'in store' && 'In store'}
                            {t.canal === 'online' && 'Online'}
                            {t.canal === 'other' && 'Other'}
                            {!t.canal && '-'}
                          </td>
                          <td className="px-3 py-2.5">
                            {t.pendiente
                              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-semibold border border-amber-200">Pend.</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-pos font-semibold border border-green-200">Conf.</span>
                            }
                          </td>
                          <td className={`px-3 py-2.5 ${t.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>{t.tipo}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium">{fmt(t.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {txs.length > adminTxVisible && (
                    <div className="text-center py-4 border-t border-gray-100">
                      <button
                        onClick={() => setAdminTxVisible(v => v + 50)}
                        className="px-5 py-2.5 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
                      >
                        Show more ({txs.length - adminTxVisible} remaining)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-400 text-sm mt-3">No transactions match those filters.</p>
              )}
            </div>
          )}

          {/* TAB: Cuentas */}
          {activeTab === 'cuentas' && (
            <div className="mt-4">
              {datos.accounts?.length ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs text-gray-400">
                      {selectedAccounts.size === 0
                        ? 'Select accounts to filter transactions'
                        : `${selectedAccounts.size} of ${datos.accounts.length} accounts selected`}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedAccounts(new Set(datos.accounts.map(a => a.id)))}
                        className="text-xs text-brand-600 hover:underline"
                      >Select all</button>
                      <button
                        onClick={() => setSelectedAccounts(new Set())}
                        className="text-xs text-gray-400 hover:underline"
                      >Clear</button>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-3 w-10">
                            <input
                              type="checkbox"
                              checked={datos.accounts.length > 0 && selectedAccounts.size === datos.accounts.length}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedAccounts(new Set(datos.accounts.map(a => a.id)));
                                else setSelectedAccounts(new Set());
                              }}
                              className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                            />
                          </th>
                          <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Account</th>
                          <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Type</th>
                          <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">No.</th>
                          <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.accounts.map(a => (
                          <tr
                            key={a.id}
                            className={`border-t border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${selectedAccounts.has(a.id) ? 'bg-brand-50/40' : ''}`}
                            onClick={() => {
                              setSelectedAccounts(prev => {
                                const next = new Set(prev);
                                if (next.has(a.id)) next.delete(a.id);
                                else next.add(a.id);
                                return next;
                              });
                            }}
                          >
                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedAccounts.has(a.id)}
                                onChange={() => {
                                  setSelectedAccounts(prev => {
                                    const next = new Set(prev);
                                    if (next.has(a.id)) next.delete(a.id);
                                    else next.add(a.id);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 rounded accent-brand-600 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3">{a.nombre}</td>
                            <td className="px-4 py-3">{a.tipo}</td>
                            <td className="px-4 py-3">{a.mask}</td>
                            <td className="px-4 py-3 text-right font-mono font-medium">{fmt(a.saldo)} {a.moneda}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-gray-400 text-sm mt-3">No accounts yet.</p>
              )}
            </div>
          )}

          {/* TAB: Recurrentes */}
          {activeTab === 'recurrentes' && (
            <div className="mt-4">
              {recurring.length ? (
                <div className="border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Description</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Frequency</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Category</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Status</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Type</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Last date</th>
                        <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recurring.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">{r.descripcion}</td>
                          <td className="px-4 py-3 text-xs">{formatFreq(r.frecuencia)}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{formatCategory(r.categoria)}</td>
                          <td className="px-4 py-3">
                            {r.estado === 'MATURE'
                              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-pos font-semibold border border-green-200">Active</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-400 font-semibold border border-gray-200">{r.estado || '-'}</span>
                            }
                          </td>
                          <td className={`px-4 py-3 ${r.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>{r.tipo}</td>
                          <td className="px-4 py-3 text-xs">{r.ultimaFecha || '-'}</td>
                          <td className="px-4 py-3 text-right font-mono font-medium">{fmt(r.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-400 text-sm mt-3">No recurring transactions detected.</p>
              )}
            </div>
          )}

          {/* TAB: Deudas */}
          {activeTab === 'deudas' && (
            <AdminLiabilitiesTab liabilities={liabilities} accounts={datos?.accounts || []} />
          )}

          {/* TAB: Inversiones */}
          {activeTab === 'inversiones' && (
            <AdminInvestmentsTab investments={investments} />
          )}
        </>
      )}
    </div>
  );
}

// Helper functions
function formatCategory(cat) {
  if (!cat) return '-';
  return cat.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function formatFreq(freq) {
  const map = { WEEKLY: 'Weekly', BIWEEKLY: 'Biweekly', SEMI_MONTHLY: 'Twice a month', MONTHLY: 'Monthly', ANNUALLY: 'Yearly' };
  return map[freq] || freq || '-';
}

function MiniTile({ label, value, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[14px] p-4 shadow-sm transition-all ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className="text-[11px] text-gray-400">{label}</div>
        {onClick && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2"><path d="M7 17L17 7M9 7h8v8"/></svg>
        )}
      </div>
      <div className={`font-mono text-lg font-semibold mt-1.5 tracking-tight tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

function AdminTileModal({ type, datos, txs, onClose }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('desc');

  let title = '', items = [], mode = 'tx';

  if (type === 'cuentas' || type === 'saldo') {
    title = type === 'saldo' ? 'Total balance' : 'Accounts';
    mode = 'acc';
    items = datos?.accounts || [];
  } else if (type === 'debitos') {
    title = 'Debits';
    mode = 'tx';
    items = txs.filter(t => t.tipo === 'debito');
  } else if (type === 'creditos') {
    title = 'Credits';
    mode = 'tx';
    items = txs.filter(t => t.tipo === 'credito');
  } else {
    title = 'Transactions';
    mode = 'tx';
    items = txs;
  }

  let filtered = items;
  if (search) {
    const q = search.toLowerCase();
    if (mode === 'tx') filtered = filtered.filter(t => (t.descripcion || '').toLowerCase().includes(q) || t.fecha.includes(q));
    else filtered = filtered.filter(a => (a.nombre || '').toLowerCase().includes(q));
  }
  if (mode === 'tx') filtered = [...filtered].sort((a, b) => sort === 'desc' ? b.monto - a.monto : a.monto - b.monto);
  else filtered = [...filtered].sort((a, b) => sort === 'desc' ? (b.saldo || 0) - (a.saldo || 0) : (a.saldo || 0) - (b.saldo || 0));

  const total = mode === 'tx'
    ? filtered.reduce((s, t) => s + t.monto, 0)
    : filtered.reduce((s, a) => s + (a.saldo || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-5" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-[18px] w-full max-w-[560px] max-h-[82vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start p-5 pb-3">
          <div>
            <div className="text-[11px] tracking-widest uppercase text-gray-400">{mode === 'tx' ? 'Transactions' : 'Accounts'}</div>
            <h3 className="font-serif text-2xl font-semibold mt-1">{title}</h3>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-900 px-1.5 rounded-lg hover:bg-gray-100 transition-colors">&times;</button>
        </div>
        <div className="flex gap-2 px-5 pb-3">
          <div className="relative flex-1">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" className="absolute left-3 top-2.5">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white">
            <option value="desc">Highest first</option>
            <option value="asc">Lowest first</option>
          </select>
        </div>
        <div className="px-5 pb-2 text-xs text-gray-400">
          {filtered.length} {mode === 'tx' ? 'transactions' : 'accounts'} &middot; {fmt(total)}
        </div>
        <div className="overflow-y-auto px-5 pb-5">
          {filtered.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">No results.</p>}
          {mode === 'tx' ? filtered.map((t, i) => (
            <div key={i} className="flex justify-between items-center gap-3 py-3 border-b border-gray-100 last:border-0">
              <div className="min-w-0">
                <div className="text-sm">{t.descripcion}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.fecha}{t.categoria && <> &middot; {formatCategory(t.categoria)}</>}</div>
              </div>
              <div className={`font-mono text-sm font-medium whitespace-nowrap ${t.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>
                {t.tipo === 'credito' ? '+' : '-'}{fmt(t.monto)}
              </div>
            </div>
          )) : filtered.map((a, i) => (
            <div key={i} className="flex justify-between items-center gap-3 py-3 border-b border-gray-100 last:border-0">
              <div className="min-w-0">
                <div className="text-sm">{a.nombre}</div>
                <div className="text-xs text-gray-400 mt-0.5">{a.tipo}{a.mask ? ` ·••${a.mask}` : ''}</div>
              </div>
              <div className="font-mono text-sm font-medium whitespace-nowrap">{fmt(a.saldo)} {a.moneda || ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminLiabilitiesTab({ liabilities, accounts }) {
  if (!liabilities || (!liabilities.liabilities?.credit?.length && !liabilities.liabilities?.student?.length && !liabilities.liabilities?.mortgage?.length)) {
    return <p className="text-gray-400 text-sm mt-6">No liabilities found for this user.</p>;
  }

  const { credit = [], student = [], mortgage = [] } = liabilities.liabilities;
  const getAccName = (id) => {
    const a = (liabilities.accounts || accounts || []).find(x => x.id === id);
    return a ? a.nombre : '';
  };

  return (
    <div className="mt-4 space-y-6">
      {credit.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Credit cards</h4>
          <div className="border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Account</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Balance</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Min. payment</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Next payment</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">APR</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {credit.map((c, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">{getAccName(c.accountId) || 'Tarjeta'}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(c.ultimoEstado)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(c.pagoMinimo)}</td>
                    <td className="px-4 py-3 text-xs">{c.proximoPago || '-'}</td>
                    <td className="px-4 py-3 text-xs font-mono">{c.aprs?.[0]?.apr_percentage ? `${c.aprs[0].apr_percentage}%` : '-'}</td>
                    <td className="px-4 py-3">
                      {c.sobreVencido
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-neg font-semibold border border-red-200">Overdue</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-pos font-semibold border border-green-200">Current</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {student.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Student loans</h4>
          <div className="border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Loan</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Status</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Original</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Rate</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Min. payment</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Next payment</th>
                </tr>
              </thead>
              <tbody>
                {student.map((s, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">{s.nombre || 'Loan'}</td>
                    <td className="px-4 py-3 text-xs">{s.estado || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(s.balanceOriginal)}</td>
                    <td className="px-4 py-3 text-xs font-mono">{s.tasaInteres != null ? `${s.tasaInteres}%` : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(s.pagoMinimo)}</td>
                    <td className="px-4 py-3 text-xs">{s.proximoPago || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mortgage.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">Mortgages</h4>
          <div className="border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Type</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Rate</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Original amount</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Last payment</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Next payment</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Since</th>
                </tr>
              </thead>
              <tbody>
                {mortgage.map((m, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">{m.tipo || 'Mortgage'}</td>
                    <td className="px-4 py-3 text-xs font-mono">{m.tasaInteres != null ? `${m.tasaInteres}%` : '-'}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(m.montoOriginal)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(m.ultimoPago)}</td>
                    <td className="px-4 py-3 text-xs">{m.proximoPago || '-'}</td>
                    <td className="px-4 py-3 text-xs">{m.plazoOriginal || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminInvestmentsTab({ investments }) {
  if (!investments || !investments.holdings?.length) {
    return <p className="text-gray-400 text-sm mt-6">No investments found for this user.</p>;
  }

  const { holdings } = investments;
  const totalValue = holdings.reduce((s, h) => s + (h.valorTotal || 0), 0);
  const totalCost = holdings.reduce((s, h) => s + (h.costoBase || 0), 0);

  return (
    <div className="mt-4">
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <MiniTile label="Total value" value={fmt(totalValue)} />
        <MiniTile label="Cost basis" value={fmt(totalCost)} />
        <MiniTile label="Gain/Loss" value={fmt(totalValue - totalCost)} className={totalValue - totalCost >= 0 ? 'text-pos' : 'text-neg'} />
      </div>

      <div className="border border-gray-200 rounded-[14px] overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Security</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Ticker</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold">Type</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Quantity</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Price</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Value</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider text-gray-400 font-semibold text-right">Cost basis</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => (
              <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3">{h.security?.nombre || '-'}</td>
                <td className="px-4 py-3 font-mono text-xs">{h.security?.ticker || '-'}</td>
                <td className="px-4 py-3 text-xs">{h.security?.tipo || '-'}</td>
                <td className="px-4 py-3 text-right font-mono">{h.cantidad}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(h.precioUnitario)}</td>
                <td className="px-4 py-3 text-right font-mono font-medium">{fmt(h.valorTotal)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(h.costoBase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

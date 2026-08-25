import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../lib/api';

const MESES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CATEGORY_COLORS = {
  FOOD_AND_DRINK: '#e67e22',
  TRANSPORTATION: '#3498db',
  SHOPPING: '#9b59b6',
  ENTERTAINMENT: '#e74c3c',
  GENERAL_MERCHANDISE: '#1abc9c',
  RENT_AND_UTILITIES: '#34495e',
  PERSONAL_CARE: '#f39c12',
  GENERAL_SERVICES: '#2980b9',
  TRAVEL: '#16a085',
  LOAN_PAYMENTS: '#8e44ad',
  TRANSFER_OUT: '#7f8c8d',
  TRANSFER_IN: '#27ae60',
  INCOME: '#2f6d4f',
  OTHER: '#95a5a6',
};

function getCategoryColor(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.OTHER;
}

function getCategoryLabel(cat) {
  if (!cat) return 'Other';
  return cat.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [recurring, setRecurring] = useState([]);
  const [liabilities, setLiabilities] = useState(null);
  const [investments, setInvestments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();
  const nombre = localStorage.getItem('userName') || '';

  const cargar = useCallback(async () => {
    const res = await api('/api/mi/datos');
    if (res.error) {
      localStorage.removeItem('userToken');
      navigate('/');
      return;
    }
    setData(res);
    setLoading(false);
    if (res.conectado) {
      const recRes = await api('/api/mi/recurring');
      if (recRes.recurring) setRecurring(recRes.recurring);
      const liabRes = await api('/api/mi/liabilities');
      if (liabRes.liabilities) setLiabilities(liabRes);
      const invRes = await api('/api/mi/investments');
      if (invRes.holdings) setInvestments(invRes);
    }
  }, [navigate]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function logout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userName');
    navigate('/');
  }

  async function connectBank() {
    setConnectStatus('Opening secure connection...');
    const res = await api('/api/mi/create_link_token', { method: 'POST' });
    if (!res.link_token) {
      setConnectStatus('Could not start. Please try again.');
      return;
    }
    const handler = window.Plaid.create({
      token: res.link_token,
      onSuccess: async (public_token) => {
        setConnectStatus('Connecting, one moment...');
        await api('/api/mi/exchange', { method: 'POST', body: JSON.stringify({ public_token }) });
        await cargar();
        let n = 0;
        const poll = setInterval(async () => {
          n++;
          await cargar();
          if (n >= 12) clearInterval(poll);
        }, 5000);
      },
      onExit: (err) => {
        setConnectStatus(err ? 'Closed without connecting.' : '');
      },
    });
    handler.open();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  const txs = data?.transactions || [];
  const accounts = data?.accounts || [];
  const income = txs.filter(t => t.tipo === 'credito').reduce((s, t) => s + t.monto, 0);
  const expenses = txs.filter(t => t.tipo === 'debito').reduce((s, t) => s + t.monto, 0);
  const balance = accounts.reduce((s, a) => s + (a.saldo || 0), 0);

  return (
    <div className="max-w-[960px] mx-auto px-5 py-8 pb-16">
      {/* Top bar */}
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
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 rounded-[11px] text-sm font-medium hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
          Log out
        </button>
      </div>

      {/* Greeting */}
      <div className="mt-8">
        <div className="text-xs tracking-widest uppercase text-gray-400">Your finances</div>
        <h1 className="font-serif text-[40px] font-medium tracking-tight mt-1 capitalize">
          Hi, {data?.nombre || nombre}
        </h1>
      </div>

      {!data?.conectado ? (
        <div className="border border-gray-200 bg-gradient-to-b from-white to-gray-50 rounded-[22px] p-12 text-center max-w-[560px] mx-auto mt-8 shadow-xl shadow-gray-900/[0.09]">
          <span className="inline-flex items-center justify-center w-[70px] h-[70px] rounded-[20px] bg-gradient-to-br from-brand-50 to-brand-100 shadow-inner">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1f3a52" strokeWidth="1.7"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
          </span>
          <h2 className="font-serif text-[28px] font-medium mt-5">Connect your bank</h2>
          <p className="text-[15px] text-gray-500 leading-relaxed max-w-[400px] mx-auto mt-1.5">
            Securely link your account so your accountant can keep your finances up to date. We never see your credentials.
          </p>
          <button onClick={connectBank} className="mt-6 px-7 py-3.5 bg-gradient-to-b from-brand-500 to-brand-600 text-white font-semibold text-[15px] rounded-xl shadow-lg shadow-brand-600/30 hover:brightness-110 hover:-translate-y-0.5 transition-all">
            Connect bank
          </button>
          {connectStatus && <p className="text-gray-400 text-sm mt-3">{connectStatus}</p>}
        </div>
      ) : (
        <div>
          {/* Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <Tile label="Total balance" value={fmt(balance)} />
            <Tile label="Income" value={fmt(income)} className="text-pos" />
            <Tile label="Expenses" value={fmt(expenses)} className="text-neg" />
            <Tile label="Accounts" value={accounts.length} />
          </div>

          {/* Navigation tabs */}
          <div className="flex gap-1 mt-7 border-b border-gray-200 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'subscriptions', label: 'Subscriptions' },
              { key: 'liabilities', label: 'Liabilities' },
              { key: 'investments', label: 'Investments' },
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

          {activeTab === 'overview' && (
            <div className="mt-5">
              <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
                {/* Monthly chart */}
                <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm">
                  <div className="flex justify-between items-baseline">
                    <span className="font-serif text-xl font-semibold">Income vs Expenses</span>
                    <span className="text-xs text-gray-400">Last 6 months</span>
                  </div>
                  <MonthlyChart txs={txs} />
                  <div className="flex gap-5 text-xs text-gray-400 mt-1.5">
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-pos mr-1.5 align-middle" />Income</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-neg mr-1.5 align-middle" />Expenses</span>
                  </div>
                </div>

                {/* Category donut */}
                <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm">
                  <span className="font-serif text-xl font-semibold">Spending by category</span>
                  <CategoryDonut txs={txs} />
                </div>
              </div>

              {/* Recent transactions with logos and badges */}
              <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm mt-5">
                <div className="flex justify-between items-baseline">
                  <span className="font-serif text-xl font-semibold">Recent transactions</span>
                  <button onClick={cargar} className="text-xs text-brand-600 hover:underline">Refresh</button>
                </div>
                <div className="mt-4 space-y-0">
                  {txs.slice(0, 12).map((t, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
                      {/* Logo or fallback */}
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {t.logo ? (
                          <img src={t.logo} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <span className="text-xs font-semibold text-gray-400">
                            {(t.descripcion || '?')[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{t.descripcion}</span>
                          {t.pendiente && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-semibold border border-amber-200">Pending</span>
                          )}
                          {t.canal && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-400 border border-gray-200">
                              {t.canal === 'in store' ? '🏪' : t.canal === 'online' ? '🌐' : '💳'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {t.fecha}
                          {t.categoria && <> &middot; {getCategoryLabel(t.categoria)}</>}
                        </div>
                      </div>
                      <span className={`font-mono text-sm font-medium whitespace-nowrap ${t.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>
                        {t.tipo === 'credito' ? '+' : '-'}{fmt(t.monto)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-gray-400 text-xs mt-3">{txs.length} transactions total.</p>
              </div>
            </div>
          )}

          {activeTab === 'subscriptions' && (
            <SubscriptionsTab recurring={recurring} />
          )}

          {activeTab === 'liabilities' && (
            <LiabilitiesTab data={liabilities} accounts={data?.accounts || []} />
          )}

          {activeTab === 'investments' && (
            <InvestmentsTab data={investments} />
          )}
        </div>
      )}
    </div>
  );
}

// === Components ===

function Tile({ label, value, className = '' }) {
  return (
    <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-5 shadow-sm">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`font-mono text-2xl font-semibold mt-2 tracking-tight tabular-nums ${className}`}>
        {value}
      </div>
    </div>
  );
}

function MonthlyChart({ txs }) {
  const meses = {};
  txs.forEach(t => {
    const m = t.fecha.slice(0, 7);
    if (!meses[m]) meses[m] = { ing: 0, gas: 0 };
    if (t.tipo === 'credito') meses[m].ing += t.monto;
    else meses[m].gas += t.monto;
  });
  const claves = Object.keys(meses).sort().slice(-6);
  if (!claves.length) return <p className="text-gray-400 text-sm mt-3">No data to chart yet.</p>;

  const max = Math.max(...claves.flatMap(k => [meses[k].ing, meses[k].gas]), 1);
  const W = 480, H = 200, padB = 30, padT = 10;
  const anchoGrupo = W / claves.length;
  const wBarra = Math.min(20, anchoGrupo / 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-3">
      <defs>
        <linearGradient id="gpos" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3f8563"/><stop offset="1" stopColor="#2f6d4f"/></linearGradient>
        <linearGradient id="gneg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c66c52"/><stop offset="1" stopColor="#b0553f"/></linearGradient>
      </defs>
      <line x1="0" y1={H - padB} x2={W} y2={H - padB} stroke="#e8e8ec" />
      {claves.map((k, i) => {
        const cx = i * anchoGrupo + anchoGrupo / 2;
        const hIng = (meses[k].ing / max) * (H - padB - padT);
        const hGas = (meses[k].gas / max) * (H - padB - padT);
        const label = MESES[parseInt(k.slice(5, 7), 10) - 1];
        return (
          <g key={k}>
            <rect x={cx - wBarra - 2} y={H - padB - hIng} width={wBarra} height={hIng} fill="url(#gpos)" rx="4" />
            <rect x={cx + 2} y={H - padB - hGas} width={wBarra} height={hGas} fill="url(#gneg)" rx="4" />
            <text x={cx} y={H - padB + 16} fontSize="11" fill="#8a8271" textAnchor="middle" fontFamily="Archivo, sans-serif">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function CategoryDonut({ txs }) {
  const debits = txs.filter(t => t.tipo === 'debito' && t.categoria);
  const byCategory = {};
  debits.forEach(t => {
    byCategory[t.categoria] = (byCategory[t.categoria] || 0) + t.monto;
  });
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!entries.length) return <p className="text-gray-400 text-sm mt-3">No category data yet.</p>;

  // Build SVG donut
  const R = 70, cx = 90, cy = 90, stroke = 22;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="flex items-center gap-5 mt-3">
      <svg viewBox="0 0 180 180" className="w-[140px] h-[140px] flex-shrink-0">
        {entries.slice(0, 8).map(([cat, val]) => {
          const pct = val / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const segment = (
            <circle
              key={cat}
              cx={cx} cy={cy} r={R}
              fill="none"
              stroke={getCategoryColor(cat)}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += dash;
          return segment;
        })}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="16" fontWeight="600" fill="#1a1a1c" fontFamily="IBM Plex Mono, monospace">{fmt(total)}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#6b7075" fontFamily="Archivo, sans-serif">total spent</text>
      </svg>
      <div className="flex-1 space-y-1.5 overflow-hidden">
        {entries.slice(0, 6).map(([cat, val]) => (
          <div key={cat} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: getCategoryColor(cat) }} />
            <span className="truncate text-gray-600">{getCategoryLabel(cat)}</span>
            <span className="ml-auto font-mono text-gray-500 whitespace-nowrap">{fmt(val)}</span>
          </div>
        ))}
        {entries.length > 6 && (
          <div className="text-[10px] text-gray-400">+{entries.length - 6} more</div>
        )}
      </div>
    </div>
  );
}

function SubscriptionsTab({ recurring }) {
  const outflows = recurring.filter(r => r.tipo === 'debito');
  const inflows = recurring.filter(r => r.tipo === 'credito');
  const totalMonthly = outflows.reduce((s, r) => s + (r.monto || 0), 0);

  if (!recurring.length) {
    return (
      <div className="mt-8 text-center py-12">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-gray-500 text-sm">No recurring transactions detected yet.</p>
        <p className="text-gray-400 text-xs mt-1">Plaid needs a few days of history to identify patterns.</p>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[16px] p-5 shadow-sm">
          <div className="text-xs text-gray-400">Monthly subscriptions</div>
          <div className="font-mono text-2xl font-semibold mt-1.5 text-neg tracking-tight">{fmt(totalMonthly)}</div>
          <div className="text-xs text-gray-400 mt-1">{outflows.length} recurring payments</div>
        </div>
        <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[16px] p-5 shadow-sm">
          <div className="text-xs text-gray-400">Recurring income</div>
          <div className="font-mono text-2xl font-semibold mt-1.5 text-pos tracking-tight">{fmt(inflows.reduce((s, r) => s + (r.monto || 0), 0))}</div>
          <div className="text-xs text-gray-400 mt-1">{inflows.length} income streams</div>
        </div>
      </div>

      {outflows.length > 0 && (
        <>
          <h3 className="font-serif text-lg font-semibold mb-3">Recurring payments</h3>
          <div className="space-y-2">
            {outflows.map(r => (
              <RecurringCard key={r.id} item={r} />
            ))}
          </div>
        </>
      )}

      {inflows.length > 0 && (
        <>
          <h3 className="font-serif text-lg font-semibold mt-6 mb-3">Recurring income</h3>
          <div className="space-y-2">
            {inflows.map(r => (
              <RecurringCard key={r.id} item={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RecurringCard({ item }) {
  const freqLabel = {
    WEEKLY: 'Weekly',
    BIWEEKLY: 'Every 2 weeks',
    SEMI_MONTHLY: 'Twice a month',
    MONTHLY: 'Monthly',
    ANNUALLY: 'Yearly',
  };

  return (
    <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-[14px] shadow-sm">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <span className="text-sm">🔄</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.descripcion}</span>
          {item.estado === 'MATURE' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-pos font-semibold border border-green-200">Active</span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {freqLabel[item.frecuencia] || item.frecuencia}
          {item.categoria && <> &middot; {getCategoryLabel(item.categoria)}</>}
          {item.ultimaFecha && <> &middot; Last: {item.ultimaFecha}</>}
        </div>
      </div>
      <span className={`font-mono text-sm font-medium whitespace-nowrap ${item.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>
        {item.tipo === 'credito' ? '+' : '-'}{fmt(item.monto)}
      </span>
    </div>
  );
}

function LiabilitiesTab({ data, accounts }) {
  if (!data || (!data.liabilities?.credit?.length && !data.liabilities?.student?.length && !data.liabilities?.mortgage?.length)) {
    return (
      <div className="mt-8 text-center py-12">
        <div className="text-4xl mb-3">💳</div>
        <p className="text-gray-500 text-sm">No liabilities found for your connected accounts.</p>
        <p className="text-gray-400 text-xs mt-1">This shows credit cards, student loans, and mortgages if available.</p>
      </div>
    );
  }

  const { credit = [], student = [], mortgage = [] } = data.liabilities;
  const getAccName = (id) => {
    const a = (data.accounts || accounts || []).find(x => x.id === id);
    return a ? a.nombre : '';
  };

  return (
    <div className="mt-5 space-y-6">
      {credit.length > 0 && (
        <div>
          <h3 className="font-serif text-lg font-semibold mb-3">Credit Cards</h3>
          <div className="space-y-3">
            {credit.map((c, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-[14px] p-5 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium">{getAccName(c.accountId) || 'Credit Card'}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {c.sobreVencido && <span className="text-neg font-semibold">Overdue &middot; </span>}
                      Min. payment: {fmt(c.pagoMinimo)}
                      {c.proximoPago && <> &middot; Due: {c.proximoPago}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold text-neg">{fmt(c.ultimoEstado)}</div>
                    <div className="text-xs text-gray-400">Statement balance</div>
                  </div>
                </div>
                {c.aprs?.length > 0 && (
                  <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100">
                    {c.aprs.slice(0, 3).map((apr, j) => (
                      <div key={j} className="text-xs">
                        <span className="text-gray-400">{(apr.apr_type || '').replace(/_/g, ' ')}: </span>
                        <span className="font-mono font-medium">{apr.apr_percentage}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {student.length > 0 && (
        <div>
          <h3 className="font-serif text-lg font-semibold mb-3">Student Loans</h3>
          <div className="space-y-3">
            {student.map((s, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-[14px] p-5 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium">{s.nombre || 'Student Loan'}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {s.estado && <>{s.estado} &middot; </>}
                      Rate: {s.tasaInteres != null ? `${s.tasaInteres}%` : '-'}
                      {s.proximoPago && <> &middot; Due: {s.proximoPago}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold">{fmt(s.balanceOriginal)}</div>
                    <div className="text-xs text-gray-400">Original balance</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mortgage.length > 0 && (
        <div>
          <h3 className="font-serif text-lg font-semibold mb-3">Mortgages</h3>
          <div className="space-y-3">
            {mortgage.map((m, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-[14px] p-5 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium">{m.tipo || 'Mortgage'}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Rate: {m.tasaInteres != null ? `${m.tasaInteres}%` : '-'}
                      {m.proximoPago && <> &middot; Due: {m.proximoPago}</>}
                      {m.plazoOriginal && <> &middot; Since: {m.plazoOriginal}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold">{fmt(m.montoOriginal)}</div>
                    <div className="text-xs text-gray-400">Original amount</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvestmentsTab({ data }) {
  if (!data || !data.holdings?.length) {
    return (
      <div className="mt-8 text-center py-12">
        <div className="text-4xl mb-3">📈</div>
        <p className="text-gray-500 text-sm">No investment holdings found.</p>
        <p className="text-gray-400 text-xs mt-1">This shows stocks, funds, and other securities if available.</p>
      </div>
    );
  }

  const { holdings } = data;
  const totalValue = holdings.reduce((s, h) => s + (h.valorTotal || 0), 0);
  const totalCost = holdings.reduce((s, h) => s + (h.costoBase || 0), 0);
  const totalGain = totalValue - totalCost;

  return (
    <div className="mt-5">
      {/* Summary tiles */}
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[16px] p-5 shadow-sm">
          <div className="text-xs text-gray-400">Portfolio value</div>
          <div className="font-mono text-2xl font-semibold mt-1.5 tracking-tight">{fmt(totalValue)}</div>
        </div>
        <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[16px] p-5 shadow-sm">
          <div className="text-xs text-gray-400">Cost basis</div>
          <div className="font-mono text-2xl font-semibold mt-1.5 tracking-tight">{fmt(totalCost)}</div>
        </div>
        <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[16px] p-5 shadow-sm">
          <div className="text-xs text-gray-400">Total gain/loss</div>
          <div className={`font-mono text-2xl font-semibold mt-1.5 tracking-tight ${totalGain >= 0 ? 'text-pos' : 'text-neg'}`}>
            {totalGain >= 0 ? '+' : ''}{fmt(totalGain)}
          </div>
        </div>
      </div>

      {/* Holdings list */}
      <h3 className="font-serif text-lg font-semibold mb-3">Holdings</h3>
      <div className="space-y-2">
        {holdings.map((h, i) => {
          const gain = h.costoBase ? h.valorTotal - h.costoBase : null;
          return (
            <div key={i} className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-[14px] shadow-sm">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-brand-600">
                  {h.security?.ticker ? h.security.ticker.slice(0, 3) : '📊'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {h.security?.nombre || 'Unknown Security'}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {h.security?.ticker && <>{h.security.ticker} &middot; </>}
                  {h.cantidad} shares
                  {h.security?.tipo && <> &middot; {h.security.tipo}</>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-medium">{fmt(h.valorTotal)}</div>
                {gain != null && (
                  <div className={`text-xs font-mono ${gain >= 0 ? 'text-pos' : 'text-neg'}`}>
                    {gain >= 0 ? '+' : ''}{fmt(gain)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

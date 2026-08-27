import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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
  // Filters
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [dateRange, setDateRange] = useState('all'); // 'all', 'month', '3months', 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Modal
  const [modal, setModal] = useState(null); // null | 'balance' | 'income' | 'expenses' | 'accounts'
  const [chartModal, setChartModal] = useState(null); // null | 'monthly' | 'category'
  const [txVisible, setTxVisible] = useState(20);
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

  // Filtered transactions
  const filteredTxs = txs.filter(t => {
    if (search && !(t.descripcion || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter && t.categoria !== catFilter) return false;
    if (dateRange === 'month') {
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      if (t.fecha < start) return false;
    } else if (dateRange === '3months') {
      const d = new Date(); d.setMonth(d.getMonth() - 3);
      const start = d.toISOString().slice(0, 10);
      if (t.fecha < start) return false;
    } else if (dateRange === 'custom') {
      if (customFrom && t.fecha < customFrom) return false;
      if (customTo && t.fecha > customTo) return false;
    }
    return true;
  });

  // Unique categories for filter
  const categories = [...new Set(txs.map(t => t.categoria).filter(Boolean))].sort();

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
        <button onClick={logout} className="flex items-center gap-1.5 px-4 py-2.5 border border-red-200 bg-red-50 rounded-[11px] text-sm font-medium text-red-600 hover:bg-red-100 hover:border-red-300 transition-all">
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
          {/* Tiles - 2x2 clickable */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <Tile label="Total balance" value={fmt(balance)} onClick={() => setModal('balance')} />
            <Tile label="Income" value={fmt(income)} className="text-pos" onClick={() => setModal('income')} />
            <Tile label="Expenses" value={fmt(expenses)} className="text-neg" onClick={() => setModal('expenses')} />
            <Tile label="Accounts" value={accounts.length} onClick={() => setModal('accounts')} />
          </div>

          {/* Modal */}
          {modal && (
            <TileModal
              type={modal}
              accounts={accounts}
              txs={txs}
              onClose={() => setModal(null)}
            />
          )}

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
                <div
                  className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all"
                  onClick={() => setChartModal('monthly')}
                >
                  <div className="flex justify-between items-baseline">
                    <span className="font-serif text-xl font-semibold">Income vs Expenses</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" className="flex-shrink-0"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                  </div>
                  <MonthlyChart txs={txs} />
                  <div className="flex gap-5 text-xs text-gray-400 mt-1.5">
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-pos mr-1.5 align-middle" />Income</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-neg mr-1.5 align-middle" />Expenses</span>
                  </div>
                </div>

                {/* Category donut */}
                <div
                  className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all"
                  onClick={() => setChartModal('category')}
                >
                  <div className="flex justify-between items-baseline">
                    <span className="font-serif text-xl font-semibold">Spending by category</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" className="flex-shrink-0"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                  </div>
                  <CategoryDonut txs={txs} onCategoryClick={(cat) => { setCatFilter(cat === catFilter ? '' : cat); }} activeCat={catFilter} />
                </div>
              </div>

              {/* Chart Modal */}
              {chartModal && (
                <ChartModal type={chartModal} txs={txs} catFilter={catFilter} setCatFilter={setCatFilter} onClose={() => setChartModal(null)} />
              )}

              {/* Spending Insights */}
              <SpendingInsights txs={txs} recurring={recurring} />

              {/* Transactions with search + filters */}
              <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm mt-5">
                <div className="flex justify-between items-baseline mb-4">
                  <span className="font-serif text-xl font-semibold">Transactions</span>
                  <button onClick={cargar} className="text-xs text-brand-600 hover:underline">Refresh</button>
                </div>

                {/* Filters bar */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <div className="relative flex-1 min-w-[180px]">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2" className="absolute left-3 top-2.5">
                      <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
                    </svg>
                    <input
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
                      placeholder="Search transactions..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    value={catFilter}
                    onChange={e => setCatFilter(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400"
                  >
                    <option value="">All categories</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{getCategoryLabel(c)}</option>
                    ))}
                  </select>
                  <select
                    value={dateRange}
                    onChange={e => setDateRange(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400"
                  >
                    <option value="all">All time</option>
                    <option value="month">This month</option>
                    <option value="3months">Last 3 months</option>
                    <option value="custom">Custom range</option>
                  </select>
                  {(search || catFilter || dateRange !== 'all') && (
                    <button
                      onClick={() => { setSearch(''); setCatFilter(''); setDateRange('all'); setCustomFrom(''); setCustomTo(''); setTxVisible(20); }}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                {dateRange === 'custom' && (
                  <div className="flex items-center gap-2 mb-4">
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
                    <span className="text-xs text-gray-400">to</span>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
                  </div>
                )}

                <div className="text-xs text-gray-400 mb-2">{filteredTxs.length} transaction{filteredTxs.length !== 1 ? 's' : ''}</div>

                <div className="space-y-0">
                  {filteredTxs.slice(0, txVisible).map((t, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
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
                  {filteredTxs.length > txVisible && (
                    <div className="text-center pt-4">
                      <button
                        onClick={() => setTxVisible(v => v + 20)}
                        className="px-5 py-2.5 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5 transition-all"
                      >
                        Show more ({filteredTxs.length - txVisible} remaining)
                      </button>
                    </div>
                  )}
                  {filteredTxs.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-6">No transactions match your filters.</p>
                  )}
                </div>
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

function Tile({ label, value, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-5 shadow-sm transition-all ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className="text-xs text-gray-400">{label}</div>
        {onClick && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-300">
            <path d="M7 17L17 7M9 7h8v8"/>
          </svg>
        )}
      </div>
      <div className={`font-mono text-2xl font-semibold mt-2 tracking-tight tabular-nums ${className}`}>
        {value}
      </div>
    </div>
  );
}

function ChartModal({ type, txs, catFilter, setCatFilter, onClose }) {
  if (type === 'monthly') {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-5" onClick={onClose}>
        <div className="bg-white border border-gray-200 rounded-[18px] w-full max-w-[750px] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 pb-2">
            <div>
              <h3 className="font-serif text-2xl font-semibold">Income vs Expenses</h3>
              <p className="text-xs text-gray-400 mt-1">Last 6 months</p>
            </div>
            <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-900 px-1.5 rounded-lg hover:bg-gray-100 transition-colors">&times;</button>
          </div>
          <div className="px-6 pb-6" style={{ height: 360 }}>
            <MonthlyChart txs={txs} height={320} />
          </div>
          <div className="flex gap-5 text-xs text-gray-400 px-6 pb-5">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-pos mr-1.5 align-middle" />Income</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-neg mr-1.5 align-middle" />Expenses</span>
          </div>
        </div>
      </div>
    );
  }

  // Category
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-5" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-[18px] w-full max-w-[700px] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-6 pb-2">
          <h3 className="font-serif text-2xl font-semibold">Spending by category</h3>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-900 px-1.5 rounded-lg hover:bg-gray-100 transition-colors">&times;</button>
        </div>
        <div className="px-6 pb-6">
          <CategoryDonut txs={txs} onCategoryClick={(cat) => setCatFilter(cat === catFilter ? '' : cat)} activeCat={catFilter} large />
        </div>
      </div>
    </div>
  );
}

function TileModal({ type, accounts, txs, onClose }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('desc');

  let title = '', eyebrow = '', items = [], mode = 'tx';

  if (type === 'income') {
    title = 'Income'; eyebrow = 'Credits'; mode = 'tx';
    items = txs.filter(t => t.tipo === 'credito');
  } else if (type === 'expenses') {
    title = 'Expenses'; eyebrow = 'Debits'; mode = 'tx';
    items = txs.filter(t => t.tipo === 'debito');
  } else if (type === 'accounts' || type === 'balance') {
    title = type === 'balance' ? 'Total balance' : 'Accounts';
    eyebrow = 'Your accounts'; mode = 'acc';
    items = accounts;
  }

  // Filter
  let filtered = items;
  if (search) {
    const q = search.toLowerCase();
    if (mode === 'tx') filtered = filtered.filter(t => (t.descripcion || '').toLowerCase().includes(q) || t.fecha.includes(q));
    else filtered = filtered.filter(a => (a.nombre || '').toLowerCase().includes(q) || (a.tipo || '').toLowerCase().includes(q));
  }
  // Sort
  if (mode === 'tx') filtered.sort((a, b) => sort === 'desc' ? b.monto - a.monto : a.monto - b.monto);
  else filtered.sort((a, b) => sort === 'desc' ? (b.saldo || 0) - (a.saldo || 0) : (a.saldo || 0) - (b.saldo || 0));

  const total = mode === 'tx'
    ? filtered.reduce((s, t) => s + t.monto, 0)
    : filtered.reduce((s, a) => s + (a.saldo || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-5" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-[18px] w-full max-w-[560px] max-h-[82vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start p-5 pb-3">
          <div>
            <div className="text-[11px] tracking-widest uppercase text-gray-400">{eyebrow}</div>
            <h3 className="font-serif text-2xl font-semibold mt-1">{title}</h3>
          </div>
          <button onClick={onClose} className="text-2xl text-gray-400 hover:text-gray-900 px-1.5 rounded-lg hover:bg-gray-100 transition-colors">&times;</button>
        </div>

        {/* Controls */}
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

        {/* Summary */}
        <div className="px-5 pb-2 text-xs text-gray-400">
          {filtered.length} {mode === 'tx' ? 'movements' : 'accounts'} &middot; {fmt(total)}
        </div>

        {/* List */}
        <div className="overflow-y-auto px-5 pb-5">
          {filtered.length === 0 && <p className="text-gray-400 text-sm py-4 text-center">No matches.</p>}
          {mode === 'tx' ? filtered.map((t, i) => (
            <div key={i} className="flex justify-between items-center gap-3 py-3 border-b border-gray-100 last:border-0">
              <div className="min-w-0">
                <div className="text-sm">{t.descripcion}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t.fecha}</div>
              </div>
              <div className={`font-mono text-sm font-medium whitespace-nowrap ${type === 'income' ? 'text-pos' : 'text-neg'}`}>
                {type === 'income' ? '+' : '-'}{fmt(t.monto)}
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

function MonthlyChart({ txs, height = 200 }) {
  const meses = {};
  txs.forEach(t => {
    const m = t.fecha.slice(0, 7);
    if (!meses[m]) meses[m] = { ing: 0, gas: 0 };
    if (t.tipo === 'credito') meses[m].ing += t.monto;
    else meses[m].gas += t.monto;
  });
  const claves = Object.keys(meses).sort().slice(-6);
  if (!claves.length) return <p className="text-gray-400 text-sm mt-3">No data to chart yet.</p>;

  const data = claves.map(k => ({
    name: MESES[parseInt(k.slice(5, 7), 10) - 1],
    Income: Math.round(meses[k].ing * 100) / 100,
    Expenses: Math.round(meses[k].gas * 100) / 100,
  }));

  return (
    <div className="mt-4" style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7075', fontSize: 12 }} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: '1px solid #e8e8ec', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 13 }}
            formatter={(value) => ['$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })]}
          />
          <Bar dataKey="Income" fill="#2f6d4f" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Expenses" fill="#b0553f" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryDonut({ txs, onCategoryClick, activeCat, large }) {
  const debits = txs.filter(t => t.tipo === 'debito' && t.categoria);
  const byCategory = {};
  debits.forEach(t => {
    byCategory[t.categoria] = (byCategory[t.categoria] || 0) + t.monto;
  });
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!entries.length) return <p className="text-gray-400 text-sm mt-3">No category data yet.</p>;

  const pieData = entries.slice(0, 8).map(([cat, val]) => ({
    name: getCategoryLabel(cat),
    value: val,
    key: cat,
    color: getCategoryColor(cat),
  }));

  return (
    <div className={`flex items-center gap-5 mt-3 ${large ? 'flex-col sm:flex-row' : ''}`}>
      <div className={`flex-shrink-0 ${large ? 'w-[260px] h-[260px]' : 'w-[150px] h-[150px]'}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={large ? 75 : 45}
              outerRadius={large ? 115 : 68}
              paddingAngle={2}
              dataKey="value"
              onClick={(entry) => onCategoryClick && onCategoryClick(entry.key)}
              style={{ cursor: 'pointer' }}
            >
              {pieData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={entry.color}
                  opacity={activeCat && activeCat !== entry.key ? 0.35 : 1}
                  stroke={activeCat === entry.key ? entry.color : 'none'}
                  strokeWidth={activeCat === entry.key ? 3 : 0}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #e8e8ec', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 13 }}
              formatter={(value) => ['$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 overflow-hidden">
        <div className="mb-2">
          <div className="font-mono text-lg font-semibold">{fmt(total)}</div>
          <div className="text-[10px] text-gray-400">total spent</div>
        </div>
        {(large ? entries : entries.slice(0, 6)).map(([cat, val]) => (
          <div
            key={cat}
            className={`flex items-center gap-2 text-xs cursor-pointer rounded px-1.5 py-1 transition-colors ${activeCat === cat ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
            onClick={() => onCategoryClick && onCategoryClick(cat)}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: getCategoryColor(cat) }} />
            <span className="truncate text-gray-600">{getCategoryLabel(cat)}</span>
            <span className="ml-auto font-mono text-gray-500 whitespace-nowrap">{fmt(val)}</span>
          </div>
        ))}
        {!large && entries.length > 6 && (
          <div className="text-[10px] text-gray-400">+{entries.length - 6} more</div>
        )}
      </div>
    </div>
  );
}

function ChannelIcon({ canal }) {
  const props = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: '#1f3a52', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (canal === 'in store') {
    // Store/shop icon
    return <svg {...props}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  }
  if (canal === 'online') {
    // Globe icon
    return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
  }
  // Card/other
  return <svg {...props}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
}

function InsightIcon({ name }) {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#1f3a52', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'category':
      return <svg {...props}><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>;
    case 'trending-up':
      return <svg {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>;
    case 'trending-down':
      return <svg {...props}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>;
    case 'repeat':
      return <svg {...props}><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="10"/></svg>;
  }
}

function SpendingInsights({ txs, recurring }) {
  const debits = txs.filter(t => t.tipo === 'debito');
  if (!debits.length) return null;

  // Top category this month
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthDebits = debits.filter(t => t.fecha.startsWith(thisMonth));
  const byCat = {};
  monthDebits.forEach(t => { if (t.categoria) byCat[t.categoria] = (byCat[t.categoria] || 0) + t.monto; });
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

  // Last month comparison
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthTotal = debits.filter(t => t.fecha.startsWith(lastMonthStr)).reduce((s, t) => s + t.monto, 0);
  const thisMonthTotal = monthDebits.reduce((s, t) => s + t.monto, 0);
  const diff = thisMonthTotal - lastMonthTotal;

  // Biggest subscription
  const outflows = recurring.filter(r => r.tipo === 'debito');
  const biggest = outflows.sort((a, b) => (b.monto || 0) - (a.monto || 0))[0];

  const insights = [];
  if (topCat) insights.push({ icon: 'category', text: `You spent most on ${getCategoryLabel(topCat[0]).toLowerCase()} this month`, detail: fmt(topCat[1]) });
  if (lastMonthTotal > 0) insights.push({ icon: diff > 0 ? 'trending-up' : 'trending-down', text: diff > 0 ? `You're spending more than last month` : `You're spending less than last month`, detail: `${diff > 0 ? '+' : ''}${fmt(Math.abs(diff))}` });
  if (biggest) insights.push({ icon: 'repeat', text: `Your biggest subscription is ${biggest.descripcion}`, detail: fmt(biggest.monto) + '/mo' });

  if (!insights.length) return null;

  return (
    <div className="grid sm:grid-cols-3 gap-3 mt-5">
      {insights.map((ins, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-[14px] p-4 shadow-sm flex items-start gap-3 transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300">
          <span className="w-9 h-9 rounded-[10px] bg-brand-50 flex items-center justify-center flex-shrink-0">
            <InsightIcon name={ins.icon} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 leading-snug">{ins.text}</p>
            <p className="font-mono text-sm font-semibold text-gray-900 mt-1">{ins.detail}</p>
          </div>
        </div>
      ))}
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
      <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center flex-shrink-0">
        <span className="text-sm font-semibold text-brand-600">
          {(item.descripcion || '?')[0].toUpperCase()}
        </span>
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
                  {h.security?.ticker ? h.security.ticker.slice(0, 3) : (h.security?.nombre || '?')[0].toUpperCase()}
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

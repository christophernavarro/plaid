import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../lib/api';

const MESES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState('');
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
        // Poll for transaction data
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
    <div className="max-w-[900px] mx-auto px-5 py-8 pb-16">
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
        /* Not connected */
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
        /* Connected dashboard */
        <div>
          {/* Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <Tile label="Total balance" value={fmt(balance)} />
            <Tile label="Income" value={fmt(income)} className="text-pos" />
            <Tile label="Expenses" value={fmt(expenses)} className="text-neg" />
            <Tile label="Accounts" value={accounts.length} />
          </div>

          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5 mt-5">
            {/* Chart */}
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

            {/* Recent transactions */}
            <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm">
              <span className="font-serif text-xl font-semibold">Recent transactions</span>
              <ul className="mt-3.5 space-y-0">
                {txs.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex justify-between py-2.5 border-b border-gray-100 last:border-0 text-sm">
                    <span>{t.fecha} &middot; {t.descripcion}</span>
                    <span className={`font-mono font-medium ${t.tipo === 'credito' ? 'text-pos' : 'text-neg'}`}>
                      {t.tipo === 'credito' ? '+' : '-'}{fmt(t.monto)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-gray-400 text-xs mt-3">{txs.length} transactions in your account.</p>
              <button onClick={cargar} className="mt-2 px-4 py-2 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow transition-all">
                Refresh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const W = 640, H = 220, padB = 30, padT = 10;
  const anchoGrupo = W / claves.length;
  const wBarra = Math.min(24, anchoGrupo / 3);

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
            <text x={cx} y={H - padB + 16} fontSize="12" fill="#8a8271" textAnchor="middle" fontFamily="Archivo, sans-serif">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

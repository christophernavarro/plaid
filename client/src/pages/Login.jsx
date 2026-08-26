import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Login() {
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (localStorage.getItem('adminToken')) navigate('/admin', { replace: true });
    else if (localStorage.getItem('userToken')) navigate('/dashboard', { replace: true });
  }, [navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      if (data.role === 'admin') {
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminName', data.nombre || 'Contador');
        navigate('/admin');
      } else {
        localStorage.setItem('userToken', data.token);
        localStorage.setItem('userName', data.nombre);
        navigate('/dashboard');
      }
    } else {
      setError(data.error || 'Something went wrong');
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    const data = await api('/api/registro', {
      method: 'POST',
      body: JSON.stringify({ nombre, email, password }),
    });
    if (data.token) {
      localStorage.setItem('userToken', data.token);
      localStorage.setItem('userName', data.nombre || nombre);
      navigate('/dashboard');
    } else {
      setError(data.error || 'Something went wrong');
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[0.72fr_1.28fr] grid-cols-1">
      {/* Brand panel */}
      <div className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 text-brand-50 p-14 flex-col justify-between">
        <div className="absolute w-[440px] h-[440px] rounded-[45%] bg-brand-400/50 -top-[120px] -left-[80px] blur-[58px] animate-pulse" />
        <div className="absolute w-[380px] h-[380px] rounded-[45%] bg-brand-700/50 -bottom-[150px] -right-[70px] blur-[58px] animate-pulse" />

        <div className="relative flex items-end gap-2">
          <svg width="29" height="26" viewBox="0 0 24 24" fill="#eef2f6">
            <rect x="2" y="13" width="4.6" height="8" rx="2.3"/>
            <rect x="9.7" y="8" width="4.6" height="13" rx="2.3"/>
            <rect x="17.4" y="3" width="4.6" height="18" rx="2.3"/>
          </svg>
          <span className="font-serif text-[23px] font-semibold tracking-tight leading-none text-brand-50">
            Bluema<span>x</span>p
          </span>
        </div>

        <div className="relative">
          <h1 className="font-serif text-[42px] font-medium leading-tight tracking-tight">
            Your finances, organized and up to date.
          </h1>
          <p className="text-[15px] leading-relaxed text-brand-200 mt-4 max-w-[380px]">
            Connect your bank once and let your accountant keep everything in order — no spreadsheets, no paperwork.
          </p>
        </div>

        <div className="relative text-xs text-brand-300">
          Bank-grade security &middot; Powered by Plaid
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center items-center p-14">
        <div className="w-full max-w-[400px]">
          <div className="flex items-end gap-2 mb-7 lg:hidden">
            <svg width="27" height="24" viewBox="0 0 24 24" fill="#1f3a52">
              <rect x="2" y="13" width="4.6" height="8" rx="2.3"/>
              <rect x="9.7" y="8" width="4.6" height="13" rx="2.3"/>
              <rect x="17.4" y="3" width="4.6" height="18" rx="2.3"/>
            </svg>
            <span className="font-serif text-[23px] font-semibold tracking-tight leading-none">
              Bluema<span className="text-brand-600">x</span>p
            </span>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-gray-200">
            <button
              className={`font-serif text-lg pb-2.5 border-b-2 transition-colors ${tab === 'login' ? 'font-semibold text-gray-900 border-brand-600' : 'text-gray-400 border-transparent'}`}
              onClick={() => { setTab('login'); setError(''); }}
            >
              Log in
            </button>
            <button
              className={`font-serif text-lg pb-2.5 border-b-2 transition-colors ${tab === 'register' ? 'font-semibold text-gray-900 border-brand-600' : 'text-gray-400 border-transparent'}`}
              onClick={() => { setTab('register'); setError(''); }}
            >
              Create account
            </button>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="mt-4">
              <label className="block text-xs text-gray-500 mt-3.5">Email</label>
              <input
                type="email"
                className="w-full mt-1 px-3.5 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="block text-xs text-gray-500 mt-3.5">Password</label>
              <input
                type="password"
                className="w-full mt-1 px-3.5 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="submit"
                className="w-full mt-5 py-3.5 bg-gradient-to-b from-brand-500 to-brand-600 text-white font-semibold text-[15px] rounded-xl shadow-lg shadow-brand-600/30 hover:brightness-110 hover:-translate-y-0.5 transition-all"
              >
                Log in
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="mt-4">
              <label className="block text-xs text-gray-500 mt-3.5">Full name</label>
              <input
                type="text"
                className="w-full mt-1 px-3.5 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
                placeholder="Jane Doe"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <label className="block text-xs text-gray-500 mt-3.5">Email</label>
              <input
                type="email"
                className="w-full mt-1 px-3.5 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="block text-xs text-gray-500 mt-3.5">Password</label>
              <input
                type="password"
                className="w-full mt-1 px-3.5 py-3 text-sm border border-gray-200 rounded-[10px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-600/10 transition"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="submit"
                className="w-full mt-5 py-3.5 bg-gradient-to-b from-brand-500 to-brand-600 text-white font-semibold text-[15px] rounded-xl shadow-lg shadow-brand-600/30 hover:brightness-110 hover:-translate-y-0.5 transition-all"
              >
                Create account
              </button>
            </form>
          )}

          {error && <p className="text-neg text-sm mt-3">{error}</p>}
          <p className="text-xs text-gray-400 text-center mt-4">
            One login for everyone — clients and accountants.
          </p>
        </div>
      </div>
    </div>
  );
}

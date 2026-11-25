import { useState, useEffect, useCallback } from 'react';
import { useTellerConnect } from 'teller-connect-react';
import { api } from '../lib/api';

// Everything Teller can return for an enrollment (payments is still in beta, so it is left out).
const TELLER_PRODUCTS = ['transactions', 'balance', 'identity', 'verify'];

// ---------------------------------------------------------------------------
// Connect button
// ---------------------------------------------------------------------------
export function TellerConnectButton({ applicationId, environment, onEnrolled, onStatus, className, children }) {
  const onSuccess = useCallback(async (enrollment) => {
    onStatus('Saving connection...');
    const res = await api('/api/mi/teller/enroll', {
      method: 'POST',
      body: JSON.stringify({
        accessToken: enrollment.accessToken,
        userId: enrollment.user?.id,
        enrollmentId: enrollment.enrollment?.id,
        institution: enrollment.enrollment?.institution,
      }),
    });
    if (res.error) {
      onStatus(res.error);
      return;
    }
    onStatus('');
    await onEnrolled();
  }, [onEnrolled, onStatus]);

  const onExit = useCallback(() => onStatus(''), [onStatus]);

  const { open, ready } = useTellerConnect({
    applicationId,
    environment,
    products: TELLER_PRODUCTS,
    onSuccess,
    onExit,
  });

  return (
    <button onClick={() => open()} disabled={!ready} className={className}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const isError = (x) => x && typeof x === 'object' && !Array.isArray(x) && x.error;
const isUnavailable = (x) => x && typeof x === 'object' && !Array.isArray(x) && x.unavailable;

const label = (k) => k.replace(/_/g, ' ');

function Note({ children, tone = 'gray' }) {
  const tones = {
    gray: 'text-gray-400',
    red: 'text-red-600',
  };
  return <p className={`text-xs mt-2 ${tones[tone]}`}>{children}</p>;
}

function Badge({ children, tone = 'gray' }) {
  const tones = {
    gray: 'bg-gray-50 text-gray-500 border-gray-200',
    brand: 'bg-brand-50 text-brand-600 border-brand-200',
    green: 'bg-green-50 text-pos border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${tones[tone]}`}>
      {children}
    </span>
  );
}

// Shows every field of an object exactly as it came back. Nested objects are printed as JSON.
function KeyValues({ obj, skip = ['links'] }) {
  const entries = Object.entries(obj || {}).filter(([k]) => !skip.includes(k));
  if (!entries.length) return <Note>Teller returned no fields.</Note>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-gray-400 capitalize">{label(k)}</dt>
          <dd className="font-mono text-[13px] break-all">
            {v !== null && typeof v === 'object'
              ? <pre className="text-xs bg-gray-50 border border-gray-100 rounded-lg p-2 overflow-auto">{JSON.stringify(v, null, 2)}</pre>
              : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-4">
      <div className="text-[11px] tracking-widest uppercase text-gray-400 mb-2">{title}</div>
      {children}
    </div>
  );
}

// Renders a resource that can be data, "not provided by this bank" or an error.
function Resource({ value, render, emptyText }) {
  if (isUnavailable(value)) return <Note>Not offered by this institution.</Note>;
  if (isError(value)) return <Note tone="red">Teller error: {value.error.message}</Note>;
  if (Array.isArray(value) && value.length === 0) return <Note>{emptyText || 'Empty.'}</Note>;
  return render(value);
}

// ---------------------------------------------------------------------------
// One account
// ---------------------------------------------------------------------------
function AccountCard({ item }) {
  const { account, balances, details, transactions } = item;
  const [visible, setVisible] = useState(25);

  return (
    <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-xl font-semibold mr-1">{account.name}</h3>
        {account.institution?.name && <Badge tone="brand">{account.institution.name}</Badge>}
        <Badge>{account.type}{account.subtype ? ` / ${account.subtype}` : ''}</Badge>
        <Badge tone={account.status === 'open' ? 'green' : 'amber'}>{account.status}</Badge>
        <Badge>{account.currency}</Badge>
        {account.last_four && <Badge>••{account.last_four}</Badge>}
      </div>

      <Section title="Balances">
        <Resource
          value={balances}
          render={(b) => <KeyValues obj={b} skip={['links', 'account_id']} />}
        />
      </Section>

      <Section title="Account details (verify)">
        <Resource
          value={details}
          render={(d) => <KeyValues obj={d} skip={['links', 'account_id']} />}
        />
      </Section>

      <Section title={`Transactions${Array.isArray(transactions) ? ` (${transactions.length} returned)` : ''}`}>
        <Resource
          value={transactions}
          emptyText="Teller returned no transactions for this account."
          render={(list) => (
            <>
              <div className="border border-gray-200 rounded-[14px] overflow-hidden overflow-x-auto bg-white">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Date', 'Description', 'Counterparty', 'Category', 'Type', 'Status', 'Amount', 'Running balance'].map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 text-[11px] uppercase tracking-wider text-gray-400 font-semibold ${i >= 6 ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.slice(0, visible).map((t) => (
                      <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap">{t.date}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate" title={t.description}>{t.description}</td>
                        <td className="px-3 py-2 text-gray-600">{t.details?.counterparty?.name || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{t.details?.category || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{t.type}</td>
                        <td className="px-3 py-2">
                          <Badge tone={t.status === 'posted' ? 'green' : 'amber'}>{t.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{t.amount}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">{t.running_balance ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {list.length > visible && (
                <div className="text-center pt-3">
                  <button
                    onClick={() => setVisible((v) => v + 25)}
                    className="px-5 py-2 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md transition-all"
                  >
                    Show more ({list.length - visible} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Teller view
// ---------------------------------------------------------------------------
export function TellerView({ onDisconnected }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    const res = await api('/api/mi/teller/datos');
    if (res.error) {
      setState({ loading: false, data: null, error: typeof res.error === 'string' ? res.error : (res.error.message || 'Request failed') });
    } else {
      setState({ loading: false, data: res, error: '' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function disconnect() {
    if (!window.confirm('Disconnect Teller? You will be able to connect again with Plaid or Teller.')) return;
    await api('/api/mi/teller/desconectar', { method: 'POST' });
    onDisconnected();
  }

  const { loading, data, error } = state;
  const txCount = (data?.accounts || []).reduce(
    (s, a) => s + (Array.isArray(a.transactions) ? a.transactions.length : 0),
    0
  );

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-2xl font-semibold mr-1">Connected with Teller</h2>
            {data?.institution?.name && <Badge tone="brand">{data.institution.name}</Badge>}
            {data?.environment && <Badge tone={data.environment === 'sandbox' ? 'amber' : 'green'}>{data.environment}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="px-4 py-2 border border-gray-200 rounded-[10px] text-sm font-medium hover:border-gray-300 hover:shadow-md transition-all">
              Refresh
            </button>
            <button onClick={disconnect} className="px-4 py-2 border border-brand-200 bg-brand-50 rounded-[10px] text-sm font-medium text-brand-600 hover:bg-brand-100 hover:border-brand-300 transition-all">
              Disconnect
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-3 leading-relaxed">
          This page shows the data exactly as Teller returns it. It is not converted to the Plaid dashboard,
          so categories, fields and amounts use Teller's own format.
        </p>
      </div>

      {loading && <p className="text-gray-400 text-sm mt-6">Loading data from Teller...</p>}

      {error && (
        <div className="mt-5 p-4 bg-red-50 border border-red-200 rounded-[14px] text-sm text-red-700">
          Could not load data from Teller: {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              ['Accounts', data.accounts.length],
              ['Transactions returned', txCount],
              ['Institution', data.institution?.name || '-'],
            ].map(([k, v]) => (
              <div key={k} className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[14px] p-4 shadow-sm">
                <div className="text-[11px] text-gray-400">{k}</div>
                <div className="font-mono text-lg font-semibold mt-1.5 truncate">{v}</div>
              </div>
            ))}
          </div>

          {/* Identity */}
          <div className="bg-gradient-to-b from-white to-gray-50 border border-gray-200 rounded-[18px] p-6 shadow-sm mt-5">
            <span className="font-serif text-xl font-semibold">Account holder (identity)</span>
            <Resource
              value={data.identity}
              emptyText="Teller returned no identity data."
              render={(list) => (
                <div className="mt-3 space-y-3">
                  {list.map((entry, i) => (
                    <div key={i} className="border border-gray-200 rounded-[14px] bg-white p-4">
                      <div className="text-xs text-gray-400 mb-2">
                        Account: {entry.account?.name} {entry.account?.last_four ? `••${entry.account.last_four}` : ''}
                      </div>
                      {(entry.owners || []).map((o, j) => (
                        <div key={j} className="mb-2 last:mb-0">
                          <KeyValues obj={o} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            />
          </div>

          {/* Accounts */}
          <div className="mt-5 space-y-5">
            {data.accounts.map((item) => (
              <AccountCard key={item.account.id} item={item} />
            ))}
            {data.accounts.length === 0 && <Note>Teller returned no accounts for this enrollment.</Note>}
          </div>

          {/* Raw JSON */}
          <details className="mt-5 bg-white border border-gray-200 rounded-[14px] p-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-600">Raw response from Teller (JSON)</summary>
            <pre className="mt-3 text-xs bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-auto max-h-[480px]">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

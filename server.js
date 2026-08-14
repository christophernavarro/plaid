require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { PlaidApi, Configuration, PlaidEnvironments, Products, CountryCode } = require('plaid');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- Config del cliente de Plaid ---
const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(configuration);

// ==========================================================================
// Estado en memoria (solo para este demo). En un producto real todo esto va
// en una base de datos.
// ==========================================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const sesiones = new Set();   // tokens de sesion del admin logueado
const clientes = {};          // clienteId -> datos del cliente (uno por cada cliente final)
const onboardTokens = {};     // token del link -> clienteId
const itemAcliente = {};      // plaid item_id -> clienteId (para saber a quien sincroniza cada webhook)

function nuevoId() {
  return crypto.randomBytes(8).toString('hex');
}

// ==========================================================================
// Auth del administrador
// ==========================================================================
function requiereAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!sesiones.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Clave incorrecta' });
  }
  const token = nuevoId();
  sesiones.add(token);
  res.json({ token });
});

// ==========================================================================
// Clientes (rutas protegidas: solo el admin logueado)
// ==========================================================================

// Lista de clientes con su estado
app.get('/api/clientes', requiereAdmin, (req, res) => {
  const lista = Object.values(clientes).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    email: c.email,
    conectado: c.conectado,
    cantidadCuentas: c.accounts.length,
    cantidadTransacciones: Object.keys(c.transactions).length,
  }));
  res.json({ clientes: lista });
});

// Crear un cliente nuevo
app.post('/api/clientes', requiereAdmin, (req, res) => {
  const { nombre, email } = req.body;
  if (!nombre) {
    return res.status(400).json({ error: 'Falta el nombre del cliente' });
  }
  const id = nuevoId();
  clientes[id] = {
    id,
    nombre,
    email: email || '',
    accessToken: null,
    itemId: null,
    cursor: null,
    transactions: {},
    accounts: [],
    conectado: false,
  };
  res.json({ cliente: { id, nombre, email: email || '' } });
});

// Generar (o reutilizar) el link de onboarding para que el cliente conecte su banco.
// La URL usa el host desde el que entraste: si abris el panel por la URL de ngrok,
// el link generado tambien sale con el dominio publico y se lo podes mandar al cliente.
app.post('/api/clientes/:id/link', requiereAdmin, (req, res) => {
  const c = clientes[req.params.id];
  if (!c) return res.status(404).json({ error: 'Cliente no existe' });

  let token = Object.keys(onboardTokens).find((t) => onboardTokens[t] === c.id);
  if (!token) {
    token = nuevoId();
    onboardTokens[token] = c.id;
  }
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({ url: `${base}/onboard.html?token=${token}` });
});

// Datos de un cliente: cuentas + transacciones (las trae el admin para verlas)
app.get('/api/clientes/:id/datos', requiereAdmin, async (req, res) => {
  const c = clientes[req.params.id];
  if (!c) return res.status(404).json({ error: 'Cliente no existe' });

  if (!c.accessToken) {
    return res.json({ conectado: false, accounts: [], transactions: [] });
  }

  try {
    await syncCliente(c);

    const accountsResp = await plaidClient.accountsGet({ access_token: c.accessToken });
    c.accounts = accountsResp.data.accounts.map(formatAccount);

    const transactions = Object.values(c.transactions)
      .map(formatTransaction)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    res.json({ conectado: true, accounts: c.accounts, transactions });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer los datos del cliente' });
  }
});

// ==========================================================================
// Onboarding del cliente final (rutas publicas: el cliente NO esta logueado,
// se identifica por el token del link que le mandaron)
// ==========================================================================

// Info basica para mostrar en la pagina del link
app.get('/api/onboard/:token', (req, res) => {
  const clienteId = onboardTokens[req.params.token];
  const c = clienteId && clientes[clienteId];
  if (!c) return res.status(404).json({ error: 'Link invalido o vencido' });
  res.json({ nombre: c.nombre, conectado: c.conectado });
});

// El cliente pide el link_token para abrir Plaid Link
app.post('/api/onboard/:token/create_link_token', async (req, res) => {
  const clienteId = onboardTokens[req.params.token];
  const c = clienteId && clientes[clienteId];
  if (!c) return res.status(404).json({ error: 'Link invalido o vencido' });

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: c.id },
      client_name: 'Bluemax',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'es',
      transactions: { days_requested: 730 },
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudo crear el link_token' });
  }
});

// Cuando el cliente termina el login, guardamos su access_token contra su registro
app.post('/api/onboard/:token/exchange', async (req, res) => {
  const clienteId = onboardTokens[req.params.token];
  const c = clienteId && clientes[clienteId];
  if (!c) return res.status(404).json({ error: 'Link invalido o vencido' });

  try {
    const { public_token } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({ public_token });

    c.accessToken = response.data.access_token;
    c.itemId = response.data.item_id;
    c.cursor = null;
    c.transactions = {};
    c.accounts = [];
    c.conectado = true;
    itemAcliente[c.itemId] = c.id;

    res.json({ ok: true });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudo intercambiar el public_token' });
  }
});

// ==========================================================================
// Webhook: Plaid nos avisa cuando hay transacciones nuevas/cambios.
// Usamos el item_id para sincronizar al CLIENTE correcto.
// ==========================================================================
app.post('/api/webhook', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;
  console.log('Webhook recibido:', webhook_type, webhook_code, 'item:', item_id);

  res.json({ ok: true }); // respondemos rapido para no bloquear el reintento de Plaid

  const codigosDeTransacciones = [
    'SYNC_UPDATES_AVAILABLE',
    'INITIAL_UPDATE',
    'HISTORICAL_UPDATE',
    'DEFAULT_UPDATE',
  ];

  if (webhook_type === 'TRANSACTIONS' && codigosDeTransacciones.includes(webhook_code)) {
    const clienteId = itemAcliente[item_id];
    const c = clienteId && clientes[clienteId];
    if (!c) return;
    try {
      await syncCliente(c);
      console.log('Cliente', c.nombre, 'sincronizado por webhook. Transacciones:', Object.keys(c.transactions).length);
    } catch (err) {
      console.error(err.response ? err.response.data : err);
    }
  }
});

// ==========================================================================
// Helpers
// ==========================================================================

// Sincroniza las transacciones de un cliente con /transactions/sync.
// Acumula added/modified/removed y recien aplica cuando la paginacion termino.
// Si los datos cambian a mitad de la paginacion, descarta lo parcial y reintenta.
async function syncCliente(c) {
  if (!c.accessToken) return;

  const MAX_REINTENTOS = 3;

  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    let cursor = c.cursor;
    const added = [];
    const modified = [];
    const removed = [];

    try {
      let hasMore = true;
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: c.accessToken,
          cursor: cursor || undefined,
        });
        const data = response.data;

        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);

        hasMore = data.has_more;
        cursor = data.next_cursor;
      }

      added.forEach((t) => { c.transactions[t.transaction_id] = t; });
      modified.forEach((t) => { c.transactions[t.transaction_id] = t; });
      removed.forEach((r) => { delete c.transactions[r.transaction_id]; });
      c.cursor = cursor;
      return;
    } catch (err) {
      const code = err.response && err.response.data && err.response.data.error_code;
      if (code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && intento < MAX_REINTENTOS - 1) {
        continue;
      }
      throw err;
    }
  }
}

// En cuentas "depository": amount > 0 = plata que SALE (debito/gasto)
//                          amount < 0 = plata que ENTRA (credito/deposito)
function formatTransaction(t) {
  return {
    fecha: t.date,
    descripcion: t.merchant_name || t.name,
    monto: Math.abs(t.amount),
    tipo: t.amount > 0 ? 'debito' : 'credito',
    cuenta: t.account_id,
  };
}

function formatAccount(a) {
  return {
    id: a.account_id,
    nombre: a.official_name || a.name,
    tipo: a.subtype || a.type,
    mask: a.mask || '',
    saldo: a.balances ? a.balances.current : null,
    moneda: (a.balances && a.balances.iso_currency_code) || 'USD',
  };
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Demo corriendo en http://localhost:${PORT}`));

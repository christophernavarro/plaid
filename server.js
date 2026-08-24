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
// Estado en memoria (solo para el demo). En produccion: base de datos.
// ==========================================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'contador@bluemaxp.com').trim().toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME || 'Contador';

const usuarios = {};          // userId -> datos del usuario final
const emailIndex = {};        // email (lower) -> userId
const sesionesUsuario = {};   // token de sesion -> userId
const sesionesAdmin = new Set(); // tokens de sesion del admin/contador
const itemAusuario = {};      // plaid item_id -> userId (para webhooks)

function nuevoId() {
  return crypto.randomBytes(12).toString('hex');
}
// Hash simple (demo). En produccion usar bcrypt/scrypt con salt por usuario.
function hashPass(pass) {
  return crypto.createHash('sha256').update(String(pass) + '|bluemax').digest('hex');
}

// ==========================================================================
// Auth
// ==========================================================================
function requiereUsuario(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = sesionesUsuario[token];
  if (!userId || !usuarios[userId]) return res.status(401).json({ error: 'No autorizado' });
  req.usuario = usuarios[userId];
  next();
}
function requiereAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!sesionesAdmin.has(token)) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ==========================================================================
// Registro / Login del usuario final
// ==========================================================================
app.post('/api/registro', (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Faltan datos (nombre, email y clave)' });
  }
  const key = email.trim().toLowerCase();
  if (emailIndex[key]) {
    return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
  }
  const id = nuevoId();
  usuarios[id] = {
    id,
    nombre: nombre.trim(),
    email: key,
    passwordHash: hashPass(password),
    accessToken: null,
    itemId: null,
    cursor: null,
    transactions: {},
    accounts: [],
    conectado: false,
  };
  emailIndex[key] = id;

  const token = nuevoId();
  sesionesUsuario[token] = id;
  res.json({ token, role: 'user', nombre: usuarios[id].nombre });
});

// Login unico: reconoce si el email/clave son de un contador (admin) o de un
// usuario final, y devuelve el rol para que el front redirija a la vista correcta.
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const key = (email || '').trim().toLowerCase();

  // Contador (admin)
  if (key === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = nuevoId();
    sesionesAdmin.add(token);
    return res.json({ token, role: 'admin', nombre: ADMIN_NAME });
  }

  // Usuario final
  const id = emailIndex[key];
  const u = id && usuarios[id];
  if (!u || u.passwordHash !== hashPass(password)) {
    return res.status(401).json({ error: 'Email o clave incorrectos' });
  }
  const token = nuevoId();
  sesionesUsuario[token] = id;
  res.json({ token, role: 'user', nombre: u.nombre });
});

// ==========================================================================
// Rutas del propio usuario (ve/gestiona SOLO su cuenta)
// ==========================================================================
app.post('/api/mi/create_link_token', requiereUsuario, async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.usuario.id },
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

app.post('/api/mi/exchange', requiereUsuario, async (req, res) => {
  try {
    const { public_token } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const u = req.usuario;
    u.accessToken = response.data.access_token;
    u.itemId = response.data.item_id;
    u.cursor = null;
    u.transactions = {};
    u.accounts = [];
    u.conectado = true;
    itemAusuario[u.itemId] = u.id;
    res.json({ ok: true });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudo conectar el banco' });
  }
});

app.get('/api/mi/datos', requiereUsuario, async (req, res) => {
  try {
    const datos = await obtenerDatos(req.usuario);
    res.json(Object.assign({ nombre: req.usuario.nombre }, datos));
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer tus datos' });
  }
});

// ==========================================================================
// Admin / contador: ve a TODOS los usuarios y su data completa
// ==========================================================================
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Clave incorrecta' });
  }
  const token = nuevoId();
  sesionesAdmin.add(token);
  res.json({ token });
});

app.get('/api/admin/usuarios', requiereAdmin, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const lista = Object.values(usuarios)
    .filter((u) => !q || u.nombre.toLowerCase().includes(q) || u.email.includes(q))
    .map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      conectado: u.conectado,
      cantidadCuentas: u.accounts.length,
      cantidadTransacciones: Object.keys(u.transactions).length,
    }));
  res.json({ usuarios: lista });
});

app.get('/api/admin/usuarios/:id/datos', requiereAdmin, async (req, res) => {
  const u = usuarios[req.params.id];
  if (!u) return res.status(404).json({ error: 'Usuario no existe' });
  try {
    const datos = await obtenerDatos(u);
    res.json(Object.assign({ nombre: u.nombre, email: u.email }, datos));
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer los datos del usuario' });
  }
});

// ==========================================================================
// Webhook: sincroniza al usuario dueño del item_id
// ==========================================================================
app.post('/api/webhook', async (req, res) => {
  const { webhook_type, webhook_code, item_id } = req.body;
  console.log('Webhook recibido:', webhook_type, webhook_code, 'item:', item_id);
  res.json({ ok: true });

  const codigos = ['SYNC_UPDATES_AVAILABLE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE'];
  if (webhook_type === 'TRANSACTIONS' && codigos.includes(webhook_code)) {
    const u = usuarios[itemAusuario[item_id]];
    if (!u) return;
    try {
      await syncUsuario(u);
      console.log('Usuario', u.nombre, 'sincronizado por webhook. Transacciones:', Object.keys(u.transactions).length);
    } catch (err) {
      console.error(err.response ? err.response.data : err);
    }
  }
});

// ==========================================================================
// Helpers
// ==========================================================================

// Sincroniza + devuelve cuentas y transacciones de un usuario.
async function obtenerDatos(u) {
  if (!u.accessToken) return { conectado: false, accounts: [], transactions: [] };
  await syncUsuario(u);
  const accountsResp = await plaidClient.accountsGet({ access_token: u.accessToken });
  u.accounts = accountsResp.data.accounts.map(formatAccount);
  const transactions = Object.values(u.transactions)
    .map(formatTransaction)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return { conectado: true, accounts: u.accounts, transactions };
}

// /transactions/sync con acumulacion y reintento ante mutacion durante la paginacion.
async function syncUsuario(u) {
  if (!u.accessToken) return;
  const MAX_REINTENTOS = 3;

  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    let cursor = u.cursor;
    const added = [];
    const modified = [];
    const removed = [];

    try {
      let hasMore = true;
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: u.accessToken,
          cursor: cursor || undefined,
        });
        const data = response.data;
        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);
        hasMore = data.has_more;
        cursor = data.next_cursor;
      }
      added.forEach((t) => { u.transactions[t.transaction_id] = t; });
      modified.forEach((t) => { u.transactions[t.transaction_id] = t; });
      removed.forEach((r) => { delete u.transactions[r.transaction_id]; });
      u.cursor = cursor;
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

// En cuentas "depository": amount > 0 = sale (debito/gasto), amount < 0 = entra (credito/ingreso)
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

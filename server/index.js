require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PlaidApi, Configuration, PlaidEnvironments, Products, CountryCode } = require('plaid');

const app = express();
app.use(express.json());
app.use(cors());

// In production, serve the React build
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
}

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
// Estado persistido en archivo JSON. Se carga al iniciar y se guarda en cada
// cambio relevante (registro, conexion de banco, sync de transacciones).
// ==========================================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'contador@bluemaxp.com').trim().toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME || 'Contador';

const DATA_FILE = path.join(__dirname, 'data.json');

let usuarios = {};          // userId -> datos del usuario final
let emailIndex = {};        // email (lower) -> userId
const sesionesUsuario = {};   // token de sesion -> userId (no se persisten)
const sesionesAdmin = new Set(); // tokens de sesion del admin/contador (no se persisten)
let itemAusuario = {};      // plaid item_id -> userId (para webhooks)

// --- Persistencia ---
function guardarDatos() {
  const state = { usuarios, emailIndex, itemAusuario };
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando data.json:', err.message);
  }
}

function cargarDatos() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const state = JSON.parse(raw);
      usuarios = state.usuarios || {};
      emailIndex = state.emailIndex || {};
      itemAusuario = state.itemAusuario || {};
      console.log(`Datos cargados: ${Object.keys(usuarios).length} usuario(s)`);
    }
  } catch (err) {
    console.error('Error cargando data.json (se inicia con estado vacio):', err.message);
  }
}

cargarDatos();

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
  guardarDatos();

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
      products: [Products.Transactions, Products.Liabilities, Products.Investments],
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
    guardarDatos();
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

// --- Recurring transactions ---
app.get('/api/mi/recurring', requiereUsuario, async (req, res) => {
  try {
    if (!req.usuario.accessToken) return res.json({ recurring: [] });
    const accountIds = (req.usuario.accounts || []).map(a => a.id);
    if (!accountIds.length) return res.json({ recurring: [] });
    const response = await plaidClient.transactionsRecurringGet({
      access_token: req.usuario.accessToken,
      account_ids: accountIds,
    });
    const format = (streams, tipo) => streams.map(s => ({
      id: s.stream_id,
      descripcion: s.merchant_name || s.description,
      monto: s.average_amount ? Math.abs(s.average_amount.amount) : null,
      moneda: s.average_amount ? s.average_amount.iso_currency_code : 'USD',
      frecuencia: s.frequency,
      categoria: s.personal_finance_category ? s.personal_finance_category.primary : null,
      ultimaFecha: s.last_date,
      estado: s.status,
      tipo,
    }));
    const recurring = [
      ...format(response.data.inflow_streams || [], 'credito'),
      ...format(response.data.outflow_streams || [], 'debito'),
    ];
    res.json({ recurring });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las transacciones recurrentes' });
  }
});

// --- Real-time balance ---
app.get('/api/mi/balance', requiereUsuario, async (req, res) => {
  try {
    if (!req.usuario.accessToken) return res.json({ accounts: [] });
    const response = await plaidClient.accountsBalanceGet({
      access_token: req.usuario.accessToken,
    });
    const accounts = response.data.accounts.map(a => ({
      id: a.account_id,
      nombre: a.official_name || a.name,
      tipo: a.subtype || a.type,
      mask: a.mask || '',
      saldoActual: a.balances.current,
      saldoDisponible: a.balances.available,
      limite: a.balances.limit,
      moneda: a.balances.iso_currency_code || 'USD',
    }));
    res.json({ accounts });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudo obtener el saldo en tiempo real' });
  }
});

// --- Liabilities ---
app.get('/api/mi/liabilities', requiereUsuario, async (req, res) => {
  try {
    if (!req.usuario.accessToken) return res.json({ liabilities: {} });
    const response = await plaidClient.liabilitiesGet({
      access_token: req.usuario.accessToken,
    });
    const data = response.data.liabilities;
    const liabilities = {
      credit: (data.credit || []).map(c => ({
        accountId: c.account_id,
        aprs: c.aprs || [],
        ultimoPago: c.last_payment_amount,
        fechaUltimoPago: c.last_payment_date,
        ultimoEstado: c.last_statement_balance,
        fechaEstado: c.last_statement_issue_date,
        pagoMinimo: c.minimum_payment_amount,
        proximoPago: c.next_payment_due_date,
        sobreVencido: c.is_overdue,
      })),
      student: (data.student || []).map(s => ({
        accountId: s.account_id,
        nombre: s.loan_name,
        estado: s.loan_status ? s.loan_status.type : null,
        balanceOriginal: s.origination_principal_amount,
        tasaInteres: s.interest_rate_percentage,
        pagoMinimo: s.minimum_payment_amount,
        proximoPago: s.next_payment_due_date,
        sobreVencido: s.is_overdue,
      })),
      mortgage: (data.mortgage || []).map(m => ({
        accountId: m.account_id,
        tipo: m.loan_type_description,
        tasaInteres: m.interest_rate ? m.interest_rate.percentage : null,
        ultimoPago: m.last_payment_amount,
        fechaUltimoPago: m.last_payment_date,
        proximoPago: m.next_payment_due_date,
        plazoOriginal: m.origination_date,
        montoOriginal: m.origination_principal_amount,
      })),
    };
    res.json({ liabilities, accounts: response.data.accounts.map(formatAccount) });
  } catch (err) {
    // If liabilities not supported for this item, return empty
    const code = err.response?.data?.error_code;
    if (code === 'PRODUCTS_NOT_SUPPORTED' || code === 'NO_LIABILITIES_ACCOUNTS') {
      return res.json({ liabilities: { credit: [], student: [], mortgage: [] }, accounts: [] });
    }
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las deudas' });
  }
});

// --- Investments ---
app.get('/api/mi/investments', requiereUsuario, async (req, res) => {
  try {
    if (!req.usuario.accessToken) return res.json({ holdings: [], securities: [], accounts: [] });
    const response = await plaidClient.investmentsHoldingsGet({
      access_token: req.usuario.accessToken,
    });
    const securities = {};
    (response.data.securities || []).forEach(s => {
      securities[s.security_id] = {
        id: s.security_id,
        nombre: s.name,
        ticker: s.ticker_symbol,
        tipo: s.type,
        precioActual: s.close_price,
        fechaPrecio: s.close_price_as_of,
        moneda: s.iso_currency_code || 'USD',
      };
    });
    const holdings = (response.data.holdings || []).map(h => ({
      accountId: h.account_id,
      securityId: h.security_id,
      cantidad: h.quantity,
      precioUnitario: h.institution_price,
      valorTotal: h.institution_value,
      costoBase: h.cost_basis,
      moneda: h.iso_currency_code || 'USD',
      security: securities[h.security_id] || null,
    }));
    res.json({
      holdings,
      securities: Object.values(securities),
      accounts: response.data.accounts.map(formatAccount),
    });
  } catch (err) {
    const code = err.response?.data?.error_code;
    if (code === 'PRODUCTS_NOT_SUPPORTED' || code === 'NO_INVESTMENT_ACCOUNTS') {
      return res.json({ holdings: [], securities: [], accounts: [] });
    }
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las inversiones' });
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

// Consolidated overview stats for all users
app.get('/api/admin/resumen', requiereAdmin, (req, res) => {
  const allUsers = Object.values(usuarios);
  const totalClientes = allUsers.length;
  const conectados = allUsers.filter(u => u.conectado).length;
  const sinBanco = totalClientes - conectados;
  let totalSaldo = 0;
  let totalTransacciones = 0;
  let totalDeudas = 0;
  const alertas = [];

  allUsers.forEach(u => {
    u.accounts.forEach(a => { totalSaldo += a.saldo || 0; });
    totalTransacciones += Object.keys(u.transactions).length;
    // Check for stale accounts (no transactions in last 30 days)
    const txDates = Object.values(u.transactions).map(t => t.date).sort();
    const lastTx = txDates[txDates.length - 1];
    if (u.conectado && lastTx) {
      const daysSince = Math.floor((Date.now() - new Date(lastTx).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 30) {
        alertas.push({ tipo: 'inactivo', usuario: u.nombre, email: u.email, mensaje: `Sin movimientos hace ${daysSince} dias` });
      }
    }
  });

  res.json({
    totalClientes,
    conectados,
    sinBanco,
    totalSaldo,
    totalTransacciones,
    alertas,
  });
});

// Global transaction search across all users
app.get('/api/admin/buscar-transacciones', requiereAdmin, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.json({ resultados: [] });

  const resultados = [];
  Object.values(usuarios).forEach(u => {
    Object.values(u.transactions).forEach(t => {
      const desc = (t.merchant_name || t.name || '').toLowerCase();
      if (desc.includes(q)) {
        resultados.push({
          usuario: u.nombre,
          usuarioEmail: u.email,
          usuarioId: u.id,
          fecha: t.date,
          descripcion: t.merchant_name || t.name,
          monto: Math.abs(t.amount),
          tipo: t.amount > 0 ? 'debito' : 'credito',
          categoria: t.personal_finance_category ? t.personal_finance_category.primary : null,
        });
      }
    });
  });

  resultados.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  res.json({ resultados: resultados.slice(0, 50) });
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

// Admin: recurring transactions for a specific user
app.get('/api/admin/usuarios/:id/recurring', requiereAdmin, async (req, res) => {
  const u = usuarios[req.params.id];
  if (!u) return res.status(404).json({ error: 'Usuario no existe' });
  try {
    if (!u.accessToken) return res.json({ recurring: [] });
    const accountIds = (u.accounts || []).map(a => a.id);
    if (!accountIds.length) return res.json({ recurring: [] });
    const response = await plaidClient.transactionsRecurringGet({
      access_token: u.accessToken,
      account_ids: accountIds,
    });
    const format = (streams, tipo) => streams.map(s => ({
      id: s.stream_id,
      descripcion: s.merchant_name || s.description,
      monto: s.average_amount ? Math.abs(s.average_amount.amount) : null,
      moneda: s.average_amount ? s.average_amount.iso_currency_code : 'USD',
      frecuencia: s.frequency,
      categoria: s.personal_finance_category ? s.personal_finance_category.primary : null,
      ultimaFecha: s.last_date,
      estado: s.status,
      tipo,
    }));
    const recurring = [
      ...format(response.data.inflow_streams || [], 'credito'),
      ...format(response.data.outflow_streams || [], 'debito'),
    ];
    res.json({ recurring });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las transacciones recurrentes' });
  }
});

// Admin: liabilities for a specific user
app.get('/api/admin/usuarios/:id/liabilities', requiereAdmin, async (req, res) => {
  const u = usuarios[req.params.id];
  if (!u) return res.status(404).json({ error: 'Usuario no existe' });
  try {
    if (!u.accessToken) return res.json({ liabilities: { credit: [], student: [], mortgage: [] }, accounts: [] });
    const response = await plaidClient.liabilitiesGet({ access_token: u.accessToken });
    const data = response.data.liabilities;
    const liabilities = {
      credit: (data.credit || []).map(c => ({
        accountId: c.account_id,
        aprs: c.aprs || [],
        ultimoPago: c.last_payment_amount,
        fechaUltimoPago: c.last_payment_date,
        ultimoEstado: c.last_statement_balance,
        fechaEstado: c.last_statement_issue_date,
        pagoMinimo: c.minimum_payment_amount,
        proximoPago: c.next_payment_due_date,
        sobreVencido: c.is_overdue,
      })),
      student: (data.student || []).map(s => ({
        accountId: s.account_id,
        nombre: s.loan_name,
        estado: s.loan_status ? s.loan_status.type : null,
        balanceOriginal: s.origination_principal_amount,
        tasaInteres: s.interest_rate_percentage,
        pagoMinimo: s.minimum_payment_amount,
        proximoPago: s.next_payment_due_date,
        sobreVencido: s.is_overdue,
      })),
      mortgage: (data.mortgage || []).map(m => ({
        accountId: m.account_id,
        tipo: m.loan_type_description,
        tasaInteres: m.interest_rate ? m.interest_rate.percentage : null,
        ultimoPago: m.last_payment_amount,
        fechaUltimoPago: m.last_payment_date,
        proximoPago: m.next_payment_due_date,
        plazoOriginal: m.origination_date,
        montoOriginal: m.origination_principal_amount,
      })),
    };
    res.json({ liabilities, accounts: response.data.accounts.map(formatAccount) });
  } catch (err) {
    const code = err.response?.data?.error_code;
    if (code === 'PRODUCTS_NOT_SUPPORTED' || code === 'NO_LIABILITIES_ACCOUNTS') {
      return res.json({ liabilities: { credit: [], student: [], mortgage: [] }, accounts: [] });
    }
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las deudas' });
  }
});

// Admin: investments for a specific user
app.get('/api/admin/usuarios/:id/investments', requiereAdmin, async (req, res) => {
  const u = usuarios[req.params.id];
  if (!u) return res.status(404).json({ error: 'Usuario no existe' });
  try {
    if (!u.accessToken) return res.json({ holdings: [], securities: [], accounts: [] });
    const response = await plaidClient.investmentsHoldingsGet({ access_token: u.accessToken });
    const securities = {};
    (response.data.securities || []).forEach(s => {
      securities[s.security_id] = {
        id: s.security_id,
        nombre: s.name,
        ticker: s.ticker_symbol,
        tipo: s.type,
        precioActual: s.close_price,
        fechaPrecio: s.close_price_as_of,
        moneda: s.iso_currency_code || 'USD',
      };
    });
    const holdings = (response.data.holdings || []).map(h => ({
      accountId: h.account_id,
      securityId: h.security_id,
      cantidad: h.quantity,
      precioUnitario: h.institution_price,
      valorTotal: h.institution_value,
      costoBase: h.cost_basis,
      moneda: h.iso_currency_code || 'USD',
      security: securities[h.security_id] || null,
    }));
    res.json({ holdings, securities: Object.values(securities), accounts: response.data.accounts.map(formatAccount) });
  } catch (err) {
    const code = err.response?.data?.error_code;
    if (code === 'PRODUCTS_NOT_SUPPORTED' || code === 'NO_INVESTMENT_ACCOUNTS') {
      return res.json({ holdings: [], securities: [], accounts: [] });
    }
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las inversiones' });
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
  guardarDatos();
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
      guardarDatos();
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
    categoria: t.personal_finance_category ? t.personal_finance_category.primary : null,
    categoriaDetalle: t.personal_finance_category ? t.personal_finance_category.detailed : null,
    categoriaIcono: t.personal_finance_category_icon_url || null,
    logo: t.logo_url || null,
    website: t.website || null,
    canal: t.payment_channel || null,
    pendiente: t.pending || false,
    ubicacion: t.location ? {
      ciudad: t.location.city,
      region: t.location.region,
      pais: t.location.country,
      lat: t.location.lat,
      lon: t.location.lon,
    } : null,
    merchantId: t.merchant_entity_id || null,
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

// SPA fallback: any non-API route serves the React app
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  const index = path.join(clientBuild, 'index.html');
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server corriendo en http://localhost:${PORT}`));

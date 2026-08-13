require('dotenv').config();
const express = require('express');
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

// Guardamos el access_token en memoria solo para efectos de este demo.
// En un producto real esto va en base de datos, uno por cliente/usuario final.
let ACCESS_TOKEN = null;
let CURSOR = null;

// Store de transacciones en memoria, indexado por transaction_id.
// Nos permite aplicar los cambios que trae /transactions/sync:
//   added    -> transaccion nueva      (la agregamos)
//   modified -> transaccion actualizada (la reemplazamos)
//   removed  -> transaccion eliminada   (la borramos)
// En un producto real esto es una tabla en la base de datos.
let TRANSACTIONS = {};

// 1) El frontend pide un link_token para abrir Plaid Link
app.post('/api/create_link_token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'demo-user-1' },
      client_name: 'Bluemax Demo',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'es',
      // Pedimos hasta 24 meses de historico (730 dias). Sin este parametro
      // Plaid trae solo 90 dias por defecto.
      transactions: { days_requested: 730 },
      // URL donde Plaid nos avisa (webhook) cuando hay transacciones nuevas.
      // En local necesitas exponer el puerto con ngrok y poner esa URL aca.
      // Si no esta seteada, el demo funciona igual (sin actualizaciones automaticas).
      webhook: process.env.PLAID_WEBHOOK_URL || undefined,
    });
    res.json(response.data);
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudo crear el link_token' });
  }
});

// 2) Cuando el usuario termina el login en Plaid Link, el frontend nos manda el public_token
app.post('/api/exchange_public_token', async (req, res) => {
  try {
    const { public_token } = req.body;
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    ACCESS_TOKEN = response.data.access_token;
    CURSOR = null;
    TRANSACTIONS = {};
    res.json({ ok: true });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudo intercambiar el public_token' });
  }
});

// Sincroniza el store en memoria con Plaid usando /transactions/sync.
// Pagina con el cursor y aplica added / modified / removed.
//
// Importante: acumulamos los cambios en memoria temporal y recien los aplicamos
// cuando la paginacion termino COMPLETA. Si Plaid avisa que los datos cambiaron
// a mitad de la paginacion (TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION),
// descartamos lo parcial y reintentamos desde el ultimo cursor guardado.
async function syncTransactions() {
  if (!ACCESS_TOKEN) return;

  const MAX_REINTENTOS = 3;

  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    // Arrancamos siempre desde el cursor persistido, no desde uno intermedio.
    let cursor = CURSOR;
    const added = [];
    const modified = [];
    const removed = [];

    try {
      let hasMore = true;
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: ACCESS_TOKEN,
          cursor: cursor || undefined,
        });
        const data = response.data;

        added.push(...data.added);
        modified.push(...data.modified);
        removed.push(...data.removed);

        hasMore = data.has_more;
        cursor = data.next_cursor;
      }

      // La paginacion termino OK: recien ahora aplicamos los cambios y guardamos el cursor.
      added.forEach((t) => {
        TRANSACTIONS[t.transaction_id] = t;
      });
      modified.forEach((t) => {
        TRANSACTIONS[t.transaction_id] = t;
      });
      removed.forEach((r) => {
        delete TRANSACTIONS[r.transaction_id];
      });
      CURSOR = cursor;
      return;
    } catch (err) {
      const code = err.response && err.response.data && err.response.data.error_code;
      // Los datos cambiaron durante la paginacion: descartamos lo parcial y reintentamos.
      if (code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && intento < MAX_REINTENTOS - 1) {
        continue;
      }
      throw err;
    }
  }
}

// Convierte una transaccion cruda de Plaid al formato simple del demo.
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

// 3) Traer transacciones: fecha, descripcion, monto, y si es debito o credito
app.get('/api/transactions', async (req, res) => {
  if (!ACCESS_TOKEN) {
    return res.status(400).json({ error: 'Todavia no hay una cuenta conectada' });
  }
  try {
    await syncTransactions();

    const transactions = Object.values(TRANSACTIONS)
      .map(formatTransaction)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    res.json({ transactions });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las transacciones' });
  }
});

// 4) Webhook: Plaid nos avisa aca cuando hay transacciones nuevas o cambios.
//    Con esto el sistema se mantiene al dia sin que el usuario tenga que
//    apretar "cargar". Requiere que esta ruta sea alcanzable por Plaid
//    (en local: ngrok apuntando a este puerto, y PLAID_WEBHOOK_URL seteada).
app.post('/api/webhook', async (req, res) => {
  const { webhook_type, webhook_code } = req.body;
  console.log('Webhook recibido:', webhook_type, webhook_code);

  // Respondemos rapido a Plaid para no bloquear su reintento.
  res.json({ ok: true });

  const codigosDeTransacciones = [
    'SYNC_UPDATES_AVAILABLE', // el recomendado con /transactions/sync
    'INITIAL_UPDATE',
    'HISTORICAL_UPDATE',
    'DEFAULT_UPDATE',
  ];

  if (webhook_type === 'TRANSACTIONS' && codigosDeTransacciones.includes(webhook_code)) {
    try {
      await syncTransactions();
      console.log('Transacciones sincronizadas por webhook. Total en memoria:', Object.keys(TRANSACTIONS).length);
    } catch (err) {
      console.error(err.response ? err.response.data : err);
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Demo corriendo en http://localhost:${PORT}`));

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

// 1) El frontend pide un link_token para abrir Plaid Link
app.post('/api/create_link_token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'demo-user-1' },
      client_name: 'Bluemax Demo',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'es',
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
    res.json({ ok: true });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudo intercambiar el public_token' });
  }
});

// 3) Traer transacciones: fecha, descripcion, monto, y si es debito o credito
app.get('/api/transactions', async (req, res) => {
  if (!ACCESS_TOKEN) {
    return res.status(400).json({ error: 'Todavia no hay una cuenta conectada' });
  }
  try {
    let added = [];
    let hasMore = true;

    // transactions/sync trae todo el historico disponible la primera vez
    // (en produccion normalmente se pagina con el cursor y se guarda para futuras consultas)
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: ACCESS_TOKEN,
        cursor: CURSOR || undefined,
      });
      added = added.concat(response.data.added);
      hasMore = response.data.has_more;
      CURSOR = response.data.next_cursor;
    }

    // En Plaid, para cuentas de tipo "depository": amount > 0 = plata que SALE (debito/gasto)
    //                                              amount < 0 = plata que ENTRA (credito/deposito)
    const transactions = added
      .map((t) => ({
        fecha: t.date,
        descripcion: t.merchant_name || t.name,
        monto: Math.abs(t.amount),
        tipo: t.amount > 0 ? 'debito' : 'credito',
        cuenta: t.account_id,
      }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

    res.json({ transactions });
  } catch (err) {
    console.error(err.response ? err.response.data : err);
    res.status(500).json({ error: 'No se pudieron traer las transacciones' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Demo corriendo en http://localhost:${PORT}`));

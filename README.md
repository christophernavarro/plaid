# Bluemax + Plaid

Platform with two roles for connecting US banks via Plaid and reading
transactions (date, description, amount, debit/credit) and account balances.

- **End user** (`/`): registers and logs in with email. Has a dashboard with
  balance, income vs expenses chart, and recent transactions.
- **Accountant / admin** (`/admin`): logs in with the accountant password,
  searches users and sees all their data (accounts, transactions, date filter,
  CSV export).

## Architecture

```
plaid/
├── server/          Express API (Node.js)
│   ├── index.js     All routes + Plaid SDK logic
│   ├── .env         Credentials (not committed)
│   └── data.json    Persisted state (not committed)
├── client/          React SPA (Vite + Tailwind)
│   ├── src/
│   │   ├── pages/   Login, Dashboard, Admin
│   │   ├── components/
│   │   └── lib/     API helper
│   └── dist/        Production build (not committed)
└── package.json     Root scripts (concurrently)
```

## Setup

1. Install all dependencies:
   ```
   npm run install:all
   ```

2. Configure `server/.env`:
   ```
   PLAID_CLIENT_ID=your_sandbox_client_id
   PLAID_SECRET=your_sandbox_secret
   PLAID_ENV=sandbox
   PORT=8080
   ADMIN_PASSWORD=admin123
   ADMIN_EMAIL=contador@bluemaxp.com
   ADMIN_NAME=Contador
   PLAID_WEBHOOK_URL=
   ```

3. Run in development (both server + client with hot reload):
   ```
   npm run dev
   ```
   - Server runs on `http://localhost:8080`
   - Client runs on `http://localhost:5173` (proxies `/api` to server)

4. For production:
   ```
   npm run build
   npm start
   ```
   The server serves the built React app from `client/dist/`.

## Test credentials (Plaid Sandbox)

- Bank: any, e.g. **First Platypus Bank**
- Username: `user_good`
- Password: `pass_good`
- MFA code: `1234`

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts server + client in parallel |
| `npm run dev:server` | Server only with --watch |
| `npm run dev:client` | Vite dev server only |
| `npm run build` | Builds the React client |
| `npm start` | Runs the server (serves built client) |
| `npm run install:all` | Installs deps for both server and client |

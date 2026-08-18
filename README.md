# Demo Bluemax + Plaid

Plataforma con dos roles para conectar bancos de EE.UU. con Plaid y leer
transacciones (fecha, descripcion, monto, debito/credito) y cuentas con saldo.

- **Usuario final** (`/`): se registra y loguea con su email. En su vista tiene
  un boton para conectar su banco por Plaid y ve un **dashboard simple** con
  graficos (saldo, ingresos vs gastos por mes, ultimos movimientos).
- **Contador / admin** (`/admin.html`): loguea con la clave de contador,
  **busca por usuario** y ve **toda la data** de cada uno (cuentas, movimientos,
  filtro por fecha y export a CSV).

Cada usuario conecta su propio banco; el contador ve a todos.

---

## 1. Requisitos

- Node.js 18+ (probado con Node 22)
- Credenciales del **sandbox** de Plaid (Dashboard -> Team Settings -> Keys)
- (Opcional) [ngrok](https://ngrok.com/download) para probar los webhooks y para
  generar links que el cliente pueda abrir desde otro dispositivo

## 2. Configuracion

1. Instalar dependencias:
   ```
   npm install
   ```
2. Copiar `.env.example` a `.env` y completar:
   ```
   PLAID_CLIENT_ID=tu_client_id_de_sandbox
   PLAID_SECRET=tu_secret_de_sandbox
   PLAID_ENV=sandbox
   PORT=8080
   ADMIN_PASSWORD=admin123        # la clave para entrar al panel
   PLAID_WEBHOOK_URL=             # opcional, ver seccion de webhooks
   ```
3. Arrancar:
   ```
   npm start
   ```
4. Abrir `http://localhost:8080`

> En Windows (cmd), para pararte en la carpeta del proyecto usa
> `cd /d E:\ruta\a\plaid` (el `/d` cambia de disco y carpeta a la vez).

## 3. Flujo de uso

**Como usuario final** (en `/`):
1. Crear cuenta (nombre, email, clave) o ingresar.
2. Apretar **"Conectar banco"**. Datos de prueba del sandbox de Plaid:
   - Banco: cualquiera, ej. **First Platypus Bank**
   - Usuario: `user_good`
   - Clave: `pass_good`
   - MFA/codigo si lo pide: `1234`
3. Ver el dashboard: saldo, ingresos vs gastos por mes y ultimos movimientos.

**Como contador** (en `/admin.html`):
1. Ingresar con la clave de `ADMIN_PASSWORD`.
2. Buscar un usuario por nombre o email.
3. Ver sus **cuentas** y **movimientos**, filtrar por fecha y **exportar CSV**.

Ambas vistas se auto-refrescan unos segundos al abrir, porque Plaid carga los
~24 meses de historial en segundo plano. Hay un boton **"Actualizar"** para
refrescar a mano.

## 4. ngrok (webhooks y links para el cliente)

Plaid no puede llamar a tu `localhost`, y un link con `localhost` solo lo podes
abrir vos. Para resolver ambas cosas se usa ngrok, que expone tu puerto local en
una URL publica.

**Como iniciarlo** (con el server ya corriendo en el puerto 8080):

```
ngrok http 8080
```

Fijate en la linea **Forwarding**, tiene que apuntar a `-> http://localhost:8080`:

```
Forwarding   https://XXXX.ngrok-free.dev -> http://localhost:8080
```

> Importante: poné el numero `8080`. Si corres solo `ngrok http` toma el puerto
> 80 por defecto y no llega a la app.

Con esa URL publica:

- **Para los webhooks:** poné en tu `.env`
  ```
  PLAID_WEBHOOK_URL=https://XXXX.ngrok-free.dev/api/webhook
  ```
  y reinicia el server. Asi Plaid avisa automaticamente cuando hay
  transacciones nuevas y el server sincroniza solo.
- **Para los links del cliente:** abri el **panel** desde la URL de ngrok
  (no desde localhost). Asi los links "Generar link para el cliente" salen con
  el dominio publico y el cliente los puede abrir desde su celular.

La URL del plan free de ngrok cambia cada vez que lo reinicias; si lo reinicias,
actualiza `PLAID_WEBHOOK_URL` y volve a generar el link.

## 5. Endpoints

**Usuario final:**

| Metodo | Ruta | Que hace |
|--------|------|----------|
| POST | `/api/registro` | Crea cuenta de usuario, devuelve token de sesion |
| POST | `/api/login` | Login de usuario, devuelve token de sesion |
| POST | `/api/mi/create_link_token` | Inicia Plaid Link (requiere token) |
| POST | `/api/mi/exchange` | Guarda el access_token del propio usuario |
| GET | `/api/mi/datos` | Cuentas + transacciones del propio usuario |

**Contador / admin (requieren `Authorization: Bearer <token>`):**

| Metodo | Ruta | Que hace |
|--------|------|----------|
| POST | `/api/admin/login` | Login del contador |
| GET | `/api/admin/usuarios?q=` | Lista/busca usuarios |
| GET | `/api/admin/usuarios/:id/datos` | Cuentas + transacciones de un usuario |

**Webhook:**

| Metodo | Ruta | Que hace |
|--------|------|----------|
| POST | `/api/webhook` | Plaid avisa cambios; sincroniza al usuario por `item_id` |

## 6. Detalles tecnicos

**24 meses de historial.** En `linkTokenCreate` se pide
`transactions: { days_requested: 730 }`. Sin eso Plaid trae solo 90 dias.

**Sincronizacion.** Se usa `/transactions/sync`, que devuelve los cambios como
`added` / `modified` / `removed`. El server los acumula y recien los aplica
cuando la paginacion termina completa. Si Plaid avisa que los datos cambiaron a
mitad de la paginacion (`TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`),
descarta lo parcial y reintenta desde el ultimo cursor.

**Debito/credito.** Plaid no manda ese campo directo. En cuentas "depository"
(corriente/ahorro) el signo de `amount` indica el sentido:
- `amount > 0` -> plata que sale de la cuenta (debito/gasto)
- `amount < 0` -> plata que entra a la cuenta (credito/deposito)

**Almacenamiento.** Todo el estado (clientes, tokens, transacciones) esta **en
memoria**, solo para el demo: si reinicias el server se pierde. En un producto
real esto va en una base de datos, con un `access_token` por cliente/banco.

## 7. Cobertura geografica (importante para el proyecto real)

Plaid conecta bancos de **Estados Unidos, Canada, Reino Unido y Europa** (~20
paises, ~12.000 instituciones). **No tiene cobertura de bancos chilenos ni del
resto de Latinoamerica.**

Esto no afecta el demo (el sandbox usa bancos ficticios de EE.UU.), pero define
la viabilidad del proyecto real: si los clientes finales van a loguear bancos de
EE.UU./Canada/Europa, Plaid sirve tal cual. Si van a loguear bancos chilenos u
otros de la region, hay que mirar una alternativa con cobertura LATAM (ej.
Belvo, que si soporta Chile y varios paises).

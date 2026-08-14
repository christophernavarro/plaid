# Demo Bluemax + Plaid

Panel multi-cliente para conectar bancos con Plaid y leer transacciones
(fecha, descripcion, monto, debito/credito) y cuentas con saldo.

Un **administrador** entra con login y gestiona varios **clientes**. Cada
cliente conecta **su propio** banco desde un **link personal** que el admin le
envia; cuando el cliente termina, sus datos quedan cargados contra su registro
y el admin los ve en el panel.

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

1. **Login** con la clave de `ADMIN_PASSWORD`.
2. **Agregar cliente** (nombre + email opcional). Aparece como *Pendiente*.
3. Entrar al cliente ("Ver") y apretar **"Generar link para el cliente"**.
4. **Enviar ese link al cliente** (mail, WhatsApp, etc.).
5. El cliente abre el link, aprieta **"Conectar banco"** y hace el login del
   banco. Datos de prueba del sandbox de Plaid:
   - Banco: cualquiera, ej. **First Platypus Bank**
   - Usuario: `user_good`
   - Clave: `pass_good`
   - MFA/codigo si lo pide: `1234`
6. El admin vuelve al panel: el cliente ahora figura **Conectado** y se ven sus
   **cuentas** (con saldo) y sus **transacciones**. Lo mismo, por separado, para
   cada cliente.

El panel se auto-refresca unos segundos al abrir un cliente, porque Plaid carga
los ~24 meses de historial en segundo plano. Tambien hay un boton
**"Actualizar datos"** para refrescar a mano.

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

**Admin (requieren header `Authorization: Bearer <token>`):**

| Metodo | Ruta | Que hace |
|--------|------|----------|
| POST | `/api/admin/login` | Login, devuelve el token de sesion |
| GET | `/api/clientes` | Lista de clientes con su estado |
| POST | `/api/clientes` | Crea un cliente |
| POST | `/api/clientes/:id/link` | Genera el link de onboarding del cliente |
| GET | `/api/clientes/:id/datos` | Cuentas + transacciones del cliente |

**Cliente (publicas, se identifican por el token del link):**

| Metodo | Ruta | Que hace |
|--------|------|----------|
| GET | `/api/onboard/:token` | Info del cliente (nombre, si ya conecto) |
| POST | `/api/onboard/:token/create_link_token` | Inicia Plaid Link |
| POST | `/api/onboard/:token/exchange` | Guarda el access_token del cliente |

**Webhook:**

| Metodo | Ruta | Que hace |
|--------|------|----------|
| POST | `/api/webhook` | Plaid avisa cambios; sincroniza al cliente por `item_id` |

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

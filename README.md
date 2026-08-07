# Demo Bluemax + Plaid

Demo minimo para validar el caso de uso: usuario se loguea a su banco y el sistema
trae sus transacciones (fecha, descripcion, monto, debito/credito).

## Como correrlo

1. `npm install`
2. Copiar `.env.example` a `.env` y poner el `PLAID_CLIENT_ID` y `PLAID_SECRET` del sandbox
   que les compartieron (Plaid Dashboard -> Team Settings -> Keys).
3. `npm start`
4. Abrir `http://localhost:8080`
5. Click en "Conectar banco". En el modal de Plaid Link, elegir cualquier banco de
   prueba (ej. "First Platypus Bank"). Usuario y clave de sandbox:
   - Usuario: `user_good`
   - Clave: `pass_good`
   - Si pide MFA/codigo: `1234` (o "code")

Con eso, Plaid simula un banco real y el demo trae transacciones de prueba con
fecha, descripcion y monto, marcando cada una como debito o credito.

## Nota importante sobre cobertura geografica

Plaid conecta bancos de **Estados Unidos, Canada, Reino Unido y Europa** (unas
20 paises, ~12.000 instituciones). **No tiene cobertura de bancos chilenos ni
del resto de Latinoamerica.**

Esto no afecta este demo (el sandbox siempre usa bancos ficticios de EE.UU.
sin importar donde estemos), pero es clave para saber si el proyecto real es
viable: si los clientes finales van a loguear bancos de EE.UU./Canada/Europa,
Plaid sirve tal cual. Si van a loguear bancos chilenos u otros de la region,
Plaid no los va a soportar y hay que mirar una alternativa con cobertura
LATAM (ej. Belvo, que si soporta Chile y varios paises de la region).

## Sobre debito/credito

Plaid no manda un campo "debito/credito" directo. En cuentas de tipo
"depository" (cuenta corriente/ahorro), el signo de `amount` indica el
sentido del movimiento:
- `amount > 0` -> plata que sale de la cuenta (debito/gasto)
- `amount < 0` -> plata que entra a la cuenta (credito/deposito)

El demo ya hace esa conversion en `server.js`.

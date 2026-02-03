# Crear Sesion WhatsApp via SSE (Server-Sent Events)

Guia completa para el equipo de frontend sobre como conectarse al endpoint SSE, los mensajes que recibe y como manejar cada estado.

---

## Endpoint

```
GET /sessions/add-sse
```

### Headers requeridos

| Header         | Tipo   | Descripcion                              |
| -------------- | ------ | ---------------------------------------- |
| `x-user-id`   | string | ID del usuario autenticado               |

> Tambien se acepta `userId` como query param o en el body.
> El `sessionId` se genera automaticamente en el backend (UUID v4). No es necesario enviarlo.

---

## Como conectarse desde el frontend

```javascript
// Opcion 1: EventSource nativo (userId como query param)
const evtSource = new EventSource("/sessions/add-sse?userId=TU_USER_ID");

// Opcion 2: fetch-event-source (userId como header)
import { fetchEventSource } from "@microsoft/fetch-event-source";

await fetchEventSource("https://tu-api.com/sessions/add-sse", {
  headers: {
    "x-user-id": "TU_USER_ID",
  },
  onmessage(event) {
    const data = JSON.parse(event.data);
    handleSSEMessage(data);
  },
  onerror(err) {
    console.error("SSE error:", err);
  },
  onclose() {
    console.log("SSE stream cerrado");
  },
});
```

---

## Mensajes SSE (en orden cronologico)

Todos los mensajes llegan como `data: {JSON}\n\n`. Cada mensaje es un objeto JSON que se parsea con `JSON.parse(event.data)`.

---

### 1. Mensaje inicial — Confirmacion de conexion

Se envia inmediatamente al abrir la conexion SSE. Confirma que el canal funciona y entrega el `sessionId` asignado.

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Campo       | Tipo   | Descripcion                        |
| ----------- | ------ | ---------------------------------- |
| `sessionId` | string | UUID v4 asignado a la nueva sesion |

**Accion frontend:** Guardar el `sessionId` para usarlo en llamadas posteriores a la API.

---

### 2. Codigo QR — Escanear con WhatsApp

Se envia cada vez que Baileys genera un nuevo QR. El QR cambia cada ~20 segundos. Se generan hasta **5 QR** (configurable con `SSE_MAX_QR_GENERATION`). Si el usuario no escanea en tiempo, el stream se cierra.

```json
{
  "connection": "connecting",
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Campo        | Tipo   | Descripcion                                               |
| ------------ | ------ | --------------------------------------------------------- |
| `connection` | string | Siempre `"connecting"` mientras espera el escaneo         |
| `qr`         | string | Imagen QR en formato **base64 Data URL** (PNG)            |
| `sessionId`  | string | ID de la sesion                                           |

**Accion frontend:**
- Mostrar la imagen QR directamente en un `<img src={data.qr} />`
- Mostrar un contador o indicador de que el QR se actualiza automaticamente
- Opcional: mostrar cuantos intentos quedan (max 5)

---

### 3. Estado de conexion (sin QR)

Se puede recibir un mensaje con `connection: "connecting"` pero **sin** campo `qr`. Esto ocurre cuando Baileys esta negociando la conexion despues de escanear el QR.

```json
{
  "connection": "connecting",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Campo        | Tipo   | Descripcion                              |
| ------------ | ------ | ---------------------------------------- |
| `connection` | string | `"connecting"` — autenticacion en curso  |
| `sessionId`  | string | ID de la sesion                          |

**Accion frontend:** Mostrar un spinner o mensaje "Conectando..." / "Autenticando...".

---

### 4. Conexion exitosa

Se envia cuando WhatsApp confirma la autenticacion. **Este es el ultimo mensaje** antes de que el stream se cierre.

```json
{
  "connection": "open",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "phoneNumber": "5491123456789",
  "deviceName": "Juan Perez",
  "accountType": "personal"
}
```

| Campo         | Tipo   | Valores posibles           | Descripcion                                   |
| ------------- | ------ | -------------------------- | --------------------------------------------- |
| `connection`  | string | `"open"`                   | Conexion establecida                          |
| `sessionId`   | string |                            | ID de la sesion                               |
| `phoneNumber` | string | `null`                     | Numero de telefono sin `+` ni espacios        |
| `deviceName`  | string | `null`                     | Nombre del perfil de WhatsApp                 |
| `accountType` | string | `"personal"` / `"business"`| Tipo de cuenta detectado                      |

**Accion frontend:**
- Cerrar el modal del QR
- Mostrar mensaje de exito: "Conectado como +{phoneNumber}"
- Redirigir al dashboard o pantalla principal
- El stream SSE se cierra automaticamente despues de este mensaje

---

### 5a. Conexion cerrada (temporal, reconectable)

Se envia cuando la conexion se pierde pero el backend va a reintentar. El stream SSE **sigue abierto** y se recibiran nuevos QR.

```json
{
  "connection": "close",
  "lastDisconnect": {
    "error": {
      "message": "Connection closed",
      "output": {
        "statusCode": 408
      }
    },
    "date": "2025-01-15T10:30:00.000Z"
  },
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Campo                                    | Tipo   | Descripcion                                        |
| ---------------------------------------- | ------ | -------------------------------------------------- |
| `connection`                             | string | `"close"`                                          |
| `lastDisconnect.error.message`           | string | Descripcion del error                              |
| `lastDisconnect.error.output.statusCode` | number | Codigo de desconexion de Baileys (ver tabla abajo) |
| `lastDisconnect.date`                    | string | Timestamp ISO del error                            |
| `sessionId`                              | string | ID de la sesion                                    |

**Accion frontend:** Mostrar "Reconectando..." y esperar el siguiente QR.

---

### 5b. Cierre definitivo (logout o max reintentos)

Se envia cuando la sesion se cierra **sin posibilidad de reconexion**. Este es el ultimo mensaje antes de que el stream se cierre.

```json
{
  "connection": "close",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "logged_out",
  "statusCode": 401
}
```

| Campo        | Tipo   | Valores posibles                        | Descripcion                         |
| ------------ | ------ | --------------------------------------- | ----------------------------------- |
| `connection` | string | `"close"`                               | Conexion cerrada                    |
| `sessionId`  | string |                                         | ID de la sesion                     |
| `reason`     | string | `"logged_out"` / `"max_retries_reached"`| Motivo del cierre definitivo        |
| `statusCode` | number | Codigo de Baileys (401, 408, etc.)      | Codigo de desconexion               |

**Accion frontend:**
- `reason: "logged_out"` → Mostrar "Sesion cerrada desde el telefono. Debes vincular de nuevo."
- `reason: "max_retries_reached"` → Mostrar "No se pudo conectar" y boton "Reintentar"

---

### 5c. QR expirado (maximo de intentos alcanzado)

Se envia cuando se generaron todos los QR permitidos (default 5) sin que el usuario escaneara. El stream se cierra despues de este mensaje.

```json
{
  "connection": "close",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "qr_expired",
  "maxQrReached": true
}
```

| Campo          | Tipo    | Descripcion                              |
| -------------- | ------- | ---------------------------------------- |
| `connection`   | string  | `"close"`                                |
| `sessionId`    | string  | ID de la sesion                          |
| `reason`       | string  | `"qr_expired"`                           |
| `maxQrReached` | boolean | Siempre `true`                           |

**Accion frontend:** Mostrar "El QR expiro. Intenta de nuevo." con boton "Reintentar".

---

## Codigos de desconexion (`statusCode`)

Estos son los codigos de Baileys `DisconnectReason` que pueden aparecer en `lastDisconnect.error.output.statusCode`:

| Codigo | Nombre                 | Descripcion                                    | Se reconecta? |
| ------ | ---------------------- | ---------------------------------------------- | ------------- |
| 401    | `loggedOut`            | El usuario cerro sesion desde el telefono      | No            |
| 408    | `timedOut`             | Timeout de conexion                            | Si            |
| 411    | `multideviceMismatch`  | Mismatch de dispositivos                       | Si            |
| 428    | `connectionClosed`     | Conexion cerrada por el servidor               | Si            |
| 440    | `connectionReplaced`   | Otra sesion reemplazo esta                     | Si            |
| 500    | `badSession`           | Sesion corrupta                                | Si            |
| 515    | `restartRequired`      | Baileys requiere reinicio                      | Si (inmediato)|

> Cuando el codigo es `401 (loggedOut)`, **toda la data de la sesion se elimina** (credenciales, chats, mensajes, contactos). El usuario debe vincular de nuevo.

---

## Fin del stream SSE

El stream se cierra (`onclose`) en estos casos:

| Caso                           | Mensaje final recibido                  | Accion recomendada                          |
| ------------------------------ | --------------------------------------- | ------------------------------------------- |
| Conexion exitosa               | `connection: "open"`                    | Redirigir al dashboard                      |
| QR expirado (max intentos)     | `reason: "qr_expired"`                  | Mostrar boton "Reintentar"                  |
| Usuario cerro sesion (401)     | `reason: "logged_out"`                  | Mostrar "Sesion cerrada desde el telefono"  |
| Max reintentos de reconexion   | `reason: "max_retries_reached"`         | Mostrar error y boton "Reintentar"          |
| Error de red/SSE               | Ninguno                                 | Manejar en `onerror`                        |

---

## Diagrama de flujo

```
Frontend                           Backend (SSE)
   |                                    |
   |--- GET /sessions/add-sse --------->|
   |                                    |
   |<-- { sessionId } -----------------|  (1) Confirmacion
   |                                    |
   |<-- { connection: "connecting",    |  (2) QR #1
   |      qr: "data:image/..." } ------|
   |                                    |
   |    [Usuario no escanea, 20s]       |
   |                                    |
   |<-- { connection: "connecting",    |  (2) QR #2
   |      qr: "data:image/..." } ------|
   |                                    |
   |    [Usuario escanea el QR]         |
   |                                    |
   |<-- { connection: "connecting" } ---|  (3) Autenticando...
   |                                    |
   |<-- { connection: "open",          |  (4) Conectado!
   |      phoneNumber: "549...",       |
   |      deviceName: "Juan",          |
   |      accountType: "personal" } ---|
   |                                    |
   |    [Stream SSE se cierra]          |
```

---

## Ejemplo completo de implementacion

```javascript
import { fetchEventSource } from "@microsoft/fetch-event-source";

const API_URL = "https://tu-api.com";

async function createWhatsAppSession(userId, onUpdate) {
  let sessionId = null;

  await fetchEventSource(`${API_URL}/sessions/add-sse`, {
    headers: {
      "x-user-id": userId,
    },

    onmessage(event) {
      const data = JSON.parse(event.data);

      // (1) Mensaje inicial
      if (!data.connection && data.sessionId) {
        sessionId = data.sessionId;
        onUpdate({ type: "session_created", sessionId });
        return;
      }

      // (2) QR recibido
      if (data.connection === "connecting" && data.qr) {
        onUpdate({ type: "qr", qr: data.qr, sessionId: data.sessionId });
        return;
      }

      // (3) Conectando (sin QR, post-escaneo)
      if (data.connection === "connecting" && !data.qr) {
        onUpdate({ type: "authenticating", sessionId: data.sessionId });
        return;
      }

      // (4) Conexion exitosa
      if (data.connection === "open") {
        onUpdate({
          type: "connected",
          sessionId: data.sessionId,
          phoneNumber: data.phoneNumber,
          deviceName: data.deviceName,
          accountType: data.accountType,
        });
        return;
      }

      // (5a) Cierre definitivo (tiene campo "reason")
      if (data.connection === "close" && data.reason) {
        onUpdate({
          type: "closed",
          sessionId: data.sessionId,
          reason: data.reason, // "logged_out" | "max_retries_reached" | "qr_expired"
          statusCode: data.statusCode,
        });
        return;
      }

      // (5b) Cierre temporal (reconectable, tiene "lastDisconnect")
      if (data.connection === "close") {
        onUpdate({
          type: "reconnecting",
          sessionId: data.sessionId,
          statusCode: data.lastDisconnect?.error?.output?.statusCode,
        });
        return;
      }
    },

    onerror(err) {
      onUpdate({ type: "error", error: err.message || "Connection lost" });
    },

    onclose() {
      onUpdate({ type: "stream_closed" });
    },
  });
}

// Uso:
createWhatsAppSession("mi-user-id", (event) => {
  switch (event.type) {
    case "session_created":
      console.log("Session ID:", event.sessionId);
      break;
    case "qr":
      // Renderizar: <img src={event.qr} />
      document.getElementById("qr-img").src = event.qr;
      break;
    case "authenticating":
      showSpinner("Autenticando...");
      break;
    case "connected":
      showSuccess(`Conectado: +${event.phoneNumber} (${event.accountType})`);
      redirectToDashboard();
      break;
    case "reconnecting":
      showInfo("Reconectando...");
      break;
    case "closed":
      if (event.reason === "logged_out") {
        showError("Sesion cerrada desde el telefono");
      } else if (event.reason === "qr_expired") {
        showError("El QR expiro. Intenta de nuevo.");
      } else {
        showError("No se pudo conectar");
      }
      break;
    case "stream_closed":
      hideQR();
      break;
    case "error":
      showError("Error de conexion: " + event.error);
      break;
  }
});
```

---

## Notas tecnicas

- **Formato del QR:** Base64 Data URL (`data:image/png;base64,...`). Se puede usar directamente como `src` de un `<img>`.
- **Timeout del QR:** Cada QR expira en ~20 segundos. Baileys genera uno nuevo automaticamente.
- **Maximo de QR:** 5 por defecto (configurable con `SSE_MAX_QR_GENERATION`). Si se excede, el stream se cierra.
- **Reconexion automatica:** El backend reintenta hasta 5 veces (`MAX_RECONNECT_RETRIES`). Durante la reconexion, el stream sigue abierto.
- **`EventSource` nativo vs `fetch-event-source`:** El `EventSource` nativo del browser no soporta headers custom. Usar `@microsoft/fetch-event-source` para enviar `x-user-id` como header, o pasar `userId` como query param si se prefiere `EventSource` nativo.

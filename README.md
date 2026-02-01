# Baileys API

REST API wrapper para WhatsApp basada en la librería [Baileys](https://github.com/WhiskeySockets/Baileys). Permite la interacción programática con WhatsApp con soporte para múltiples dispositivos y sesiones.

## Características

- **Multi-sesión**: Gestiona múltiples cuentas de WhatsApp simultáneamente
- **Webhooks**: Envía eventos a URLs externas (mensajes, cambios de estado, etc.)
- **Gestión de mensajes**: Envío/recepción de texto, imágenes, videos, documentos
- **Gestión de grupos**: Control completo (crear, actualizar, miembros, configuración)
- **Gestión de contactos**: Administra contactos y listas de bloqueo
- **Manejo de media**: Descarga y subida de archivos multimedia
- **Persistencia de sesiones**: Almacena y restaura sesiones desde base de datos
- **Documentación API**: Swagger UI integrado en `/api-docs`
- **Autenticación**: Sistema de API keys con expiración y control de acceso

## Tecnologías

- **Runtime**: Node.js (v20+)
- **Lenguaje**: TypeScript
- **Framework**: Express.js
- **WhatsApp**: Baileys
- **Base de datos**: PostgreSQL con Prisma ORM
- **Documentación**: Swagger UI

## Requisitos

- Node.js v20 o superior
- PostgreSQL
- pnpm (recomendado)

## Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd baileys-api

# Instalar pnpm si no lo tienes
npm install -g pnpm

# Instalar dependencias
pnpm install

# Generar cliente Prisma
pnpm prisma generate

# Configurar base de datos
pnpm prisma migrate deploy
```

## Configuración

Crea un archivo `.env` en la raíz del proyecto:

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgresql://usuario:password@localhost:5432/baileys_api
```

## Ejecución

```bash
# Desarrollo (con hot reload)
pnpm dev

# Producción
pnpm build
pnpm start
```

## Docker

```bash
# Construir y ejecutar con Docker Compose
docker-compose up -d
```

## Endpoints Principales

### Sesiones (`/sessions`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/sessions/list` | Listar todas las sesiones |
| GET | `/sessions/status` | Estado de la sesión |
| POST | `/sessions/add` | Crear nueva sesión |
| GET | `/sessions/add-sse` | Crear sesión con Server-Sent Events |
| DELETE | `/sessions` | Eliminar sesión |

### Mensajes (`/messages`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/messages` | Listar mensajes (paginado) |
| POST | `/messages/send` | Enviar mensaje |
| POST | `/messages/send/bulk` | Enviar múltiples mensajes |
| POST | `/messages/download` | Descargar media de mensaje |

### Chats (`/chats`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/chats` | Listar chats |
| GET | `/chats/{jid}` | Obtener chat específico |
| POST | `/chats/mute` | Silenciar chat |
| POST | `/chats/read` | Marcar como leído |

### Contactos (`/contacts`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/contacts` | Listar contactos |
| GET | `/contacts/blocklist` | Lista de bloqueados |
| GET | `/contacts/{jid}/photo` | Foto de perfil |
| POST | `/contacts/blocklist/update` | Bloquear/desbloquear |

### Grupos (`/groups`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/groups` | Listar grupos |
| POST | `/groups` | Crear grupo |
| PUT | `/groups/update` | Actualizar grupo |
| POST | `/groups/participants` | Gestionar participantes |
| POST | `/groups/leave` | Salir del grupo |

### Webhooks (`/webhooks`)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/webhooks` | Listar webhooks |
| POST | `/webhooks` | Crear webhook |
| PUT | `/webhooks/{id}` | Actualizar webhook |
| DELETE | `/webhooks/{id}` | Eliminar webhook |

## Autenticación

La API utiliza autenticación mediante API keys. Incluye el header `x-api-key` en todas las peticiones:

```bash
curl -X GET "http://localhost:3000/chats" \
  -H "x-api-key: tu-api-key" \
  -H "x-session-id: tu-session-id"
```

## Documentación

Accede a la documentación interactiva de la API en:

```
http://localhost:3000/api-docs
```

## Estructura del Proyecto

```
src/
├── controllers/     # Manejadores de peticiones
├── routes/          # Definición de endpoints
├── middlewares/     # Middleware de Express
├── services/        # Lógica de negocio
├── store/           # Almacenamiento de datos WhatsApp
├── index.ts         # Punto de entrada
├── whatsapp.ts      # Inicialización de sesiones
└── swagger.ts       # Configuración de Swagger

prisma/
└── schema.prisma    # Esquema de base de datos
```

## Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `pnpm dev` | Ejecutar en modo desarrollo |
| `pnpm build` | Compilar TypeScript |
| `pnpm start` | Ejecutar build de producción |
| `pnpm lint` | Ejecutar ESLint |
| `pnpm format` | Formatear código con Prettier |

## Licencia

MIT

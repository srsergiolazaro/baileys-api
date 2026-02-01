# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Baileys API is a REST API wrapper for WhatsApp built on the [Baileys](https://github.com/WhiskeySockets/Baileys) library. It enables programmatic interaction with WhatsApp through HTTP endpoints, supporting multi-session/multi-device scenarios.

**Tech Stack**: TypeScript, Express.js, PostgreSQL with Prisma ORM, Node.js 20+

## Common Commands

```bash
# Development
pnpm dev                    # Start with hot reload (tsx + nodemon)
pnpm build                  # Compile TypeScript to dist/
pnpm start                  # Run production build

# Database
pnpm prisma generate        # Generate Prisma client after schema changes
pnpm prisma migrate dev     # Create and apply new migration
pnpm prisma migrate deploy  # Apply pending migrations (production)

# Code Quality
pnpm lint                   # Run ESLint
pnpm lint:fix               # Auto-fix ESLint issues
pnpm format                 # Format with Prettier
```

## Architecture

### Request Flow

```
HTTP Request → Routes (src/routes/) → Middleware → Controllers (src/controllers/) → Services (src/services/) → Baileys/Database
```

### Key Components

**Session Management** - Dual storage pattern:
- `sessionsMap` (in-memory): Active WASocket connections keyed by sessionId
- `UserSession` (database): Session metadata (userId, phoneNumber, status, lastActive)
- `Session` (database): Baileys auth credentials and signal keys

**Baileys Integration** (`src/services/baileys.ts`):
- `createSession()`: Creates WASocket connection with auto-reconnect
- `useSession()`: Implements Baileys AuthenticationState using Prisma
- Handles connection events, QR code generation, and SSE streaming

**Store Layer** (`src/store/`):
- Event handlers listen to Baileys events (messages.upsert, chats.update, etc.)
- Automatically persists WhatsApp data to PostgreSQL

**Session Lifecycle**:
1. POST `/sessions/add` → `createSession()` creates UserSession in DB + WASocket in memory
2. Baileys emits events → Store handlers persist to database
3. On server restart → `init()` (src/whatsapp.ts) reloads active sessions from UserSession table

### Directory Structure

- `src/controllers/` - Request handlers (session, message, contact, group, chat, webhook)
- `src/routes/` - Express route definitions with Swagger JSDoc
- `src/services/` - Baileys socket lifecycle and session state management
- `src/store/` - Data persistence via Baileys event handlers
- `src/middlewares/` - Auth validation (apiKeyValidator), request validation, JID validation

### Authentication

Headers: `x-api-key` (API key) + `x-session-id` (session identifier)
Middleware populates `req.appData = { userId, sessionId }`

### Database Models (Prisma)

Core models: `User`, `UserSession`, `Session`, `Message`, `Chat`, `Contact`, `GroupMetadata`, `ApiKey`, `Webhook`, `Product`

All WhatsApp data models use `@@unique([sessionId, id])` for multi-session isolation.

## Environment Variables

```env
DATABASE_URL              # PostgreSQL connection (required)
PORT                      # Server port (default: 3000)
HOST                      # Server host (default: 0.0.0.0)
RECONNECT_INTERVAL        # Baileys reconnect delay in ms
MAX_RECONNECT_RETRIES     # Max reconnection attempts (default: 5)
SSE_MAX_QR_GENERATION     # Max QR codes for SSE (default: 5)
```

## API Documentation

Swagger UI available at `http://localhost:3000/api-docs`

# Voice AI Mini Agent

A production-structured mini AI agent backend demonstrating:

- **Tool calling** with OpenAI function calling API
- **Event-driven architecture** simulating Inngest with Node EventEmitter
- **Redis prompt caching** for performance
- **Multi-tenant Supabase** design
- **Stateless agent** for horizontal scalability
- **Graceful shutdown** handling

---

## 📁 Folder Structure

```
src/
├── app.ts                    # Express app factory (testable, separate from server)
├── server.ts                 # Entry point: boot order + graceful shutdown
├── config/
│   └── env.ts                # Zod-validated env variables (fail-fast)
├── db/
│   ├── client.ts             # Supabase service-role client (singleton)
│   └── schema.sql            # Table definitions — paste into Supabase SQL Editor
├── agent/
│   ├── agent.ts              # Agent core: the main orchestration loop
│   ├── toolRegistry.ts       # Tool dispatch (Strategy Pattern)
│   └── tools/
│       ├── bookTour.ts       # book_tour tool
│       ├── takeNote.ts       # take_note tool
│       └── updateContact.ts  # update_contact_info tool
├── events/
│   ├── eventBus.ts           # EventEmitter singleton (simulates Inngest)
│   └── listeners.ts          # Async background event listeners
├── services/
│   ├── redis.ts              # Redis client + caching helpers
│   ├── tenantService.ts      # Tenant DB queries
│   └── conversationService.ts# Conversation persistence
├── routes/
│   ├── chat.ts               # POST /chat
│   └── health.ts             # GET /health
├── middleware/
│   ├── validate.ts           # Zod request validation factory
│   └── errorHandler.ts       # Global Express error handler
└── utils/
    └── asyncHandler.ts       # async route wrapper
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Where to find it | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → **Project URL** | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → **service_role** key | `eyJ...` |
| `REDIS_URL` | Your Redis instance URL | `redis://localhost:6379` |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | `sk-...` |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Environment | `development` |

> ⚠️ **`SUPABASE_SERVICE_ROLE_KEY`** bypasses Row Level Security — keep it server-side only, never expose it to a browser.

---

## 🚀 Setup & Installation

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Copy your **Project URL** and **service_role key** from  
   `Settings → API`

### 3. Apply the database schema

1. Open the **SQL Editor** in your Supabase dashboard
2. Click **New query**
3. Paste the entire contents of `src/db/schema.sql` and click **Run**

This creates the `tenants`, `conversations`, `tours`, `notes`, and `contacts` tables,  
plus a **demo tenant** you can test with immediately:

```
tenantId: 00000000-0000-0000-0000-000000000001
```

### 4. Start Redis

```bash
# Docker (recommended):
docker run -d -p 6379:6379 redis:alpine

# Or use a managed Redis (Upstash, Railway, etc.)
```

### 5. Configure your .env

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, OPENAI_API_KEY
```

### 6. Start the development server

```bash
npm run dev
```

You should see:

```
✅  Supabase client initialised
✅  Redis connected
✅  Event listeners registered

🚀 Voice AI Mini Agent running on port 3000
   Environment : development
   Health check: http://localhost:3000/health
   Chat API    : POST http://localhost:3000/chat
```

---

## 🧪 Testing with curl

### Health check

```bash
curl http://localhost:3000/health
```

### Chat without tool call

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "00000000-0000-0000-0000-000000000001",
    "message": "Hello, what can you help me with?"
  }'
```

### Trigger `book_tour` tool

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "00000000-0000-0000-0000-000000000001",
    "message": "I want to book a tour for John Smith on 2025-03-15 in Paris."
  }'
```

### Trigger `take_note` tool

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "00000000-0000-0000-0000-000000000001",
    "message": "Please note that the client prefers morning tours and vegetarian meals."
  }'
```

### Trigger `update_contact_info` tool

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "00000000-0000-0000-0000-000000000001",
    "message": "Update contact info for Sarah Jones: email is sarah@example.com, phone is +1-555-0123."
  }'
```

### Validation error (bad input)

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "not-a-uuid", "message": ""}'
```

---

## 🏗️ Architecture Patterns Demonstrated

| Pattern | Where | Why |
|---|---|---|
| **Stateless Agent** | `agent.ts` | Horizontal scaling — no in-memory state |
| **Tool Calling** | `agent.ts` + `toolRegistry.ts` | OpenAI function calling with 2-pass LLM |
| **Strategy Pattern** | `toolRegistry.ts` | Extensible tool dispatch without if/else chains |
| **Repository Pattern** | `services/` | Isolates DB queries from business logic |
| **Event-Driven** | `events/` | Decouples tool execution from side effects |
| **Prompt Caching** | `services/redis.ts` | Avoids DB round-trip on every request |
| **Multi-Tenancy** | Schema + all queries | Tenant isolation via `tenant_id` FK |
| **Fail-Fast Config** | `config/env.ts` | Crashes at startup if any env var is missing |
| **Graceful Shutdown** | `server.ts` | In-flight requests complete before exit |

---

## 📦 Build for Production

```bash
npm run build
npm start
```
# voice-assistant-mini

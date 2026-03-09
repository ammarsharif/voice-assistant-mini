# Voice AI Mini Agent

A production-ready, stateless backend designed for high-performance AI voice agents. This project demonstrates a robust architecture for orchestration, tool integration, and event-driven processing.

## 🚀 Mission

Provide a scalable, multi-tenant foundation for AI-driven voice applications, focusing on developer experience and efficient resource management.

## 🛠️ Tech Stack

- **Runtime**: Node.js / TypeScript
- **API Framework**: Express
- **AI Engine**: OpenAI (Function Calling / GPT-4o)
- **Database**: Supabase (PostgreSQL)
- **Infrastructure**: Redis (Caching), LiveKit/Deepgram (Voice Integration)
- **Environment**: Zod-validated configuration

## ✨ Core Features

- **Stateless Orchestration**: Designed for horizontal scalability; all conversation state is persisted externally.
- **Advanced Tool Calling**: Seamless integration with OpenAI function calling API using a custom Strategy Pattern for tool dispatch.
- **Event-Driven Side Effects**: Decouples primary agent responses from non-blocking tasks (e.g., logging, CRM updates) using an internal event bus.
- **Multi-Tenant Architecture**: Built-in support for tenant isolation at the database and application levels.
- **Prompt Caching**: Redis integration to minimize database overhead for frequent prompt/context retrievals.

## 🏗️ Architecture Highlights

| Pattern               | Implementation       | Benefit                                                       |
| --------------------- | -------------------- | ------------------------------------------------------------- |
| **Strategy Pattern**  | `toolRegistry.ts`    | Extensible tool management without conditional bloat.         |
| **Event-Driven**      | `EventEmitter` based | Low-latency responses; background task reliability.           |
| **Fail-Fast Config**  | `Zod` validation     | Immediate startup failures if environments are misconfigured. |
| **Graceful Shutdown** | Signal handling      | Ensures zero-downtime deployments and clean resource release. |

## 🏁 Quick Start

### 1. Prerequisites

- Node.js (v18+)
- Redis instance (local or managed)
- Supabase project

### 2. Installation

```bash
npm install
cp .env.example .env
# Configure your variables in .env
```

### 3. Database Setup

Apply the schema located at `src/db/schema.sql` via the Supabase SQL Editor. This includes necessary tables and a default demo tenant.

### 4. Run Development

```bash
npm run dev
```

## 🔌 API Endpoints

- `GET /health`: System diagnostics and service status.
- `POST /chat`: Primary agent interaction endpoint.

## 📄 License

MIT

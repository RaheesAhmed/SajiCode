---
name: nodejs
description: Build production-grade Node.js backend services with Express, Fastify, or Hono. Covers middleware architecture, stream processing, worker threads, WebSocket implementation, queue processing with BullMQ, Redis caching, structured logging, graceful shutdown, and error handling patterns. Use when building backend APIs or server-side services.
---

# Node.js Backend Mastery

## Framework Selection

| Framework | Best For | Perf | Ecosystem |
|-----------|----------|------|-----------|
| Express | Mature projects, huge middleware ecosystem | Good | Massive |
| Fastify | High-performance APIs, schema validation | Excellent | Growing |
| Hono | Edge/serverless, ultra-lightweight | Fastest | Moderate |
| NestJS | Enterprise apps, DI-heavy architecture | Good | Large |

## Project Architecture

```
src/
├── routes/           # HTTP route handlers (thin controllers)
├── middleware/        # Auth, validation, error handling, logging
├── services/         # Business logic (NO HTTP concepts)
├── repositories/     # Data access layer (DB queries only)
├── models/           # Type definitions and schemas
├── lib/              # Shared utilities, clients, config
├── jobs/             # Background job processors
├── events/           # Event handlers
└── index.ts          # Server bootstrap
```

### Layered Architecture Rule
```
Routes → Services → Repositories → Database
  ↓          ↓
Middleware  Events/Jobs
```
- Routes: Parse HTTP, validate input, call service, format response
- Services: Business logic, orchestration, NO database queries
- Repositories: Data access ONLY, returns typed objects

## Express API Pattern

```ts
import express, { Request, Response, NextFunction } from "express";

const router = express.Router();

router.post("/users",
  validateBody(CreateUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await userService.create(req.body);
      res.status(201).json({ data: user });
    } catch (error) {
      next(error);
    }
  }
);
```

### Error Handling Middleware
```ts
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : "INTERNAL_ERROR";

  logger.error({ err, path: req.path, method: req.method });

  res.status(statusCode).json({
    error: { message: err.message, code },
  });
}
```

### Validation Middleware
```ts
import { ZodSchema } from "zod";

function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(result.error.issues[0].message, 400, "VALIDATION_ERROR");
    }
    req.body = result.data;
    next();
  };
}
```

## Caching with Redis

```ts
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });

async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function cacheSet(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

async function cacheDel(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(keys);
}
```

## WebSocket Implementation

```ts
import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const clients = new Map<string, WebSocket>();

wss.on("connection", (ws, req) => {
  const userId = authenticateWs(req);
  clients.set(userId, ws);

  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    handleMessage(userId, message);
  });

  ws.on("close", () => clients.delete(userId));

  ws.on("error", (err) => logger.error("WebSocket error", { userId, err }));
});

function broadcast(event: string, data: unknown, exclude?: string) {
  const payload = JSON.stringify({ event, data });
  clients.forEach((ws, id) => {
    if (id !== exclude && ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}
```

## Background Jobs (BullMQ)

```ts
import { Queue, Worker } from "bullmq";

const emailQueue = new Queue("email", { connection: { url: process.env.REDIS_URL } });

await emailQueue.add("welcome", { userId, email }, {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
});

const worker = new Worker("email", async (job) => {
  if (job.name === "welcome") {
    await sendWelcomeEmail(job.data.email);
  }
}, { connection: { url: process.env.REDIS_URL }, concurrency: 5 });
```

## Graceful Shutdown

```ts
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, starting graceful shutdown`);
  server.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

## Best Practices
- Use async/await everywhere — never unhandled promise rejections
- Validate ALL inputs with Zod before processing
- Return consistent JSON: `{ data }` for success, `{ error: { message, code } }` for failure
- Use environment variables for config — never hardcode
- Use `helmet`, `cors`, rate limiting middleware on every API
- Set `NODE_ENV=production` in production
- Use worker threads for CPU-intensive tasks
- Implement request ID tracing across all logs

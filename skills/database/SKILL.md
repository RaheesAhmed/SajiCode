---
name: database
description: Design and implement production database systems. Covers schema design, migrations, query optimization, ORMs (Prisma, Drizzle, TypeORM), PostgreSQL/SQLite/MongoDB patterns, indexing strategies, connection pooling, and multi-tenant architectures. Use when designing schemas, writing queries, or setting up data access layers.
---

# Database Engineering

## Schema Design Principles

### Naming Conventions
- Table names: singular PascalCase (`User`, `OrderItem`)
- Column names: camelCase (`createdAt`, `userId`)
- Foreign keys: `{referencedTable}Id` (`userId`, `orderId`)
- Indexes: `idx_{table}_{column}` (`idx_user_email`)
- Unique constraints: `uq_{table}_{column}` (`uq_user_email`)

### Required Columns (every table)
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
```

### ID Strategy
| Type | Use When |
|------|----------|
| UUID v4 | Public-facing IDs, distributed systems |
| CUID2 | URL-safe, sortable, no collision |
| Auto-increment | Internal-only, sequential ordering needed |
| ULID | Sortable UUID alternative |

## Prisma Patterns

### Schema with Relations
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  role      Role     @default(USER)
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
  @@index([createdAt])
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId  String
  tags      Tag[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([authorId])
  @@index([published, createdAt])
}
```

### Optimized Queries
```ts
// Pagination with cursor (much faster than offset)
const posts = await prisma.post.findMany({
  take: 20,
  skip: 1,
  cursor: { id: lastPostId },
  orderBy: { createdAt: "desc" },
  select: { id: true, title: true, createdAt: true, author: { select: { name: true } } },
});

// Transaction for multi-table writes
const [user, team] = await prisma.$transaction([
  prisma.user.create({ data: userData }),
  prisma.team.update({ where: { id: teamId }, data: { memberCount: { increment: 1 } } }),
]);

// Upsert pattern
await prisma.user.upsert({
  where: { email },
  update: { name, updatedAt: new Date() },
  create: { email, name },
});
```

## Drizzle ORM Patterns

### Schema Definition
```ts
import { pgTable, text, timestamp, boolean, uuid, index } from "drizzle-orm/pg-core";

export const users = pgTable("user", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("idx_user_email").on(table.email),
}));
```

## Migration Workflow
```
1. Design schema changes
2. Generate: npx prisma migrate dev --name descriptive_name
3. Review generated SQL — NEVER skip this
4. Test with staging data
5. Deploy: npx prisma migrate deploy
6. NEVER edit committed migrations — create a new one
```

## Query Optimization

### Index Strategy
```sql
-- Composite index for multi-column WHERE clauses (order matters!)
CREATE INDEX idx_post_status_date ON post(published, created_at DESC);

-- Partial index for filtered queries
CREATE INDEX idx_active_users ON "user"(email) WHERE active = true;

-- Covering index (includes all queried columns)
CREATE INDEX idx_post_listing ON post(author_id, created_at DESC) INCLUDE (title);
```

### N+1 Prevention
```ts
// BAD: N+1 queries
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { authorId: user.id } });
}

// GOOD: Eager loading
const users = await prisma.user.findMany({
  include: { posts: { take: 5, orderBy: { createdAt: "desc" } } },
});
```

## Connection Pooling
```ts
// Use connection pooling in production
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

// Graceful shutdown
process.on("beforeExit", async () => { await prisma.$disconnect(); });
```

## Security Rules
- ALWAYS use parameterized queries — NEVER string concatenation
- NEVER expose internal IDs in URLs — use UUIDs
- Encrypt sensitive fields at rest (passwords, tokens, PII)
- Use row-level security for multi-tenant data
- Audit log all destructive operations (DELETE, UPDATE on sensitive tables)
- Validate all input with Zod BEFORE database operations

---
name: fullstack-app-generator
description: "Generate complete, production-ready full-stack applications from a single prompt. Scaffolds projects with framework selection, database schema, API layer, authentication, and deployment config for Vite + React, Next.js, Express, and monorepo setups. Use when building a new application from scratch, scaffolding a major feature, or setting up a project with auth and database."
---

# Full-Stack Application Generator

## Framework Selection Matrix

| Requirement | Recommended Stack |
|-------------|-------------------|
| Static site / landing page | Vite + React (or plain HTML/CSS/JS) |
| SaaS with auth + dashboard | Next.js + Prisma + NextAuth |
| API-only backend | Express/Fastify + Prisma |
| Real-time app (chat, collab) | Next.js + WebSocket + Redis |
| Mobile + Web | Next.js (web) + React Native (mobile) |
| CLI tool | Node.js + Commander/Yargs |
| Prototyping | Vite + React + JSON file/SQLite |

## Generation Workflow

### Step 1: Analyze Requirements

Parse user prompt to determine:

1. App type (SaaS, blog, e-commerce, dashboard, API)
2. Data models and their relationships
3. User flows and authentication needs
4. Third-party integrations required

**Checkpoint:** Confirm app type, auth strategy, and data models with the user before scaffolding.

### Step 2: Scaffold Foundation

1. Initialize project with framework CLI (e.g. `npx create-next-app@latest`)
2. Install core dependencies
3. Set up TypeScript configuration
4. Create design system (`globals.css` with tokens)
5. Configure environment variables with `.env.example`

### Step 3: Build Data Layer

1. Design Prisma schema with all models and relations
2. Run `npx prisma migrate dev --name init` to generate migration
3. Create database client singleton:

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Checkpoint:** Run `npx prisma validate` — schema must pass before continuing.

### Step 4: Build API / Server Actions

1. Create Zod schemas for all inputs
2. Implement server actions or API routes with validation
3. Add error handling with typed error responses
4. Add authentication checks on protected routes

### Step 5: Build UI

1. Create root layout with fonts, theme, metadata
2. Build reusable components (Header, Sidebar, Footer)
3. Create page layouts for each route
4. Implement forms with client-side and server-side validation
5. Add loading and error states for all async operations

### Step 6: Finalize

1. Add SEO metadata to all pages
2. Create `.env.example` documenting ALL required variables
3. Add README with setup instructions
4. Create Dockerfile if deployment target needs it
5. Test complete user flow end-to-end

**Checkpoint:** Verify build passes (`npm run build`), all env vars documented, and auth flow works.

## Auth Pattern (NextAuth.js)

```ts
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! }),
    Credentials({
      async authorize(credentials) {
        const user = await prisma.user.findUnique({ where: { email: credentials.email as string } });
        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash);
        return valid ? user : null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
});
```

## Project Structure (Next.js)

```
project/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout (fonts, providers)
│   │   ├── page.tsx            # Home page
│   │   ├── (auth)/             # Auth route group
│   │   ├── dashboard/          # Protected routes
│   │   └── api/webhooks/       # Webhook-only API routes
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── layout/             # Header, Sidebar, Footer
│   │   └── features/           # Feature-specific components
│   ├── lib/                    # db.ts, auth.ts, utils.ts
│   ├── actions/                # Server Actions
│   └── types/                  # Shared type definitions
├── prisma/schema.prisma
├── .env.example
└── package.json
```

## Quality Checklist

- [ ] All pages have proper metadata and SEO
- [ ] Authentication protects all required routes
- [ ] All forms have client-side and server-side validation
- [ ] Error boundaries on all dynamic content
- [ ] Loading states for all async operations
- [ ] Responsive design tested at mobile/tablet/desktop
- [ ] `.env.example` documents ALL required env vars
- [ ] README has complete setup instructions

---
name: nextjs
description: Build full-stack applications with Next.js 15, React 19, and App Router. Covers server components, server actions, parallel routes, intercepting routes, middleware authentication, ISR/SSG/SSR strategies, streaming, API route patterns, edge runtime, and performance optimization. Use when building Next.js applications.
---

# Next.js 15 Full-Stack Mastery

## Project Setup
```bash
npx -y create-next-app@latest ./ --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack
```

## App Router Architecture

```
src/
├── app/
│   ├── layout.tsx              # Root layout (fonts, providers, metadata)
│   ├── page.tsx                # Home
│   ├── loading.tsx             # Root loading skeleton
│   ├── error.tsx               # Root error boundary
│   ├── not-found.tsx           # 404
│   ├── globals.css
│   ├── (marketing)/            # Route group — no prefix in URL
│   │   ├── page.tsx            # / (if no app/page.tsx)
│   │   ├── about/page.tsx      # /about
│   │   └── pricing/page.tsx    # /pricing
│   ├── (auth)/                 # Auth route group
│   │   ├── layout.tsx          # Auth layout (centered, minimal)
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── dashboard/
│   │   ├── layout.tsx          # Dashboard shell
│   │   ├── page.tsx            # /dashboard
│   │   ├── settings/page.tsx   # /dashboard/settings
│   │   └── @modal/(.)item/[id]/page.tsx  # Intercepting route for modals
│   └── api/
│       └── webhooks/route.ts   # Webhook handler
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── layout/                 # Header, Sidebar, Footer
│   └── features/               # Feature-specific components
├── lib/
│   ├── utils.ts
│   └── db.ts
└── actions/                    # Server actions
    ├── auth.ts
    └── posts.ts
```

## Server Components (default)

```tsx
// Runs on server — NO "use client" needed
// Direct database access, no waterfall
export default async function DashboardPage() {
  const [user, stats, recentPosts] = await Promise.all([
    getUser(),
    getStats(),
    getRecentPosts(),
  ]);

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <StatsGrid stats={stats} />
      <RecentPosts posts={recentPosts} />
    </div>
  );
}
```

## Server Actions (mutations)

```tsx
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export async function createPost(formData: FormData) {
  const parsed = CreatePostSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const post = await db.post.create({ data: parsed.data });
  revalidatePath("/dashboard");
  redirect(`/posts/${post.id}`);
}
```

## Client Components (ONLY when needed)

```tsx
"use client";

import { useActionState } from "react";
import { createPost } from "@/actions/posts";

export function CreatePostForm() {
  const [state, action, pending] = useActionState(createPost, null);

  return (
    <form action={action}>
      <input name="title" required disabled={pending} />
      {state?.error?.title && <p className="text-red-500 text-sm">{state.error.title}</p>}
      <textarea name="content" required disabled={pending} />
      <button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create Post"}
      </button>
    </form>
  );
}
```

## Middleware Authentication

```ts
import { NextRequest, NextResponse } from "next/server";

const protectedPaths = ["/dashboard", "/settings", "/api/protected"];
const authPaths = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const { pathname } = request.nextUrl;

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  const isAuthPage = authPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !token) {
    return NextResponse.redirect(new URL(`/login?from=${pathname}`, request.url));
  }

  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

## Data Fetching Strategies

| Strategy | Use When | Revalidation |
|----------|----------|-------------|
| Dynamic (SSR) | User-specific data | Every request |
| Static (SSG) | Blog posts, docs | Build time |
| ISR | Product pages | Time-based (`revalidate: 60`) |
| Client-side | Real-time data | SWR / React Query |

```tsx
// ISR: revalidate every 60 seconds
export const revalidate = 60;

// On-demand revalidation
import { revalidateTag } from "next/cache";
await fetch(url, { next: { tags: ["products"] } });
revalidateTag("products");
```

## Metadata & SEO

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "App Name", template: "%s | App Name" },
  description: "App description for SEO",
  openGraph: {
    title: "App Name",
    description: "App description",
    url: "https://app.com",
    siteName: "App Name",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};
```

## Rules
- Server Components by DEFAULT — add `"use client"` only for hooks/interactivity
- Server Actions for mutations — NOT API routes
- `next/image` for ALL images
- `next/font` for fonts — NO external CSS font imports
- `next/link` for navigation — NO `<a>` tags for internal links
- Metadata in layout.tsx or page.tsx — never in `<Head>`
- Use `loading.tsx` for streaming/suspense
- Use `error.tsx` for error boundaries

---
name: shadcn-ui
description: Build premium interfaces with shadcn/ui components, Radix primitives, and Tailwind CSS. Covers installation, component customization, theming, dark mode, form patterns with react-hook-form + Zod, data tables with sorting/filtering/pagination, command palette, toast patterns, and composable component architecture. Use when building UI with shadcn/ui.
---

# shadcn/ui Design System

## Setup
```bash
npx -y shadcn@latest init -d
npx -y shadcn@latest add button card input label dialog sheet dropdown-menu tabs avatar badge separator skeleton toast sonner command table form select checkbox
```

## cn() Utility (ALWAYS use)
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

## Component Composition

### Card with Hover
```tsx
<Card className="group cursor-pointer border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
  <CardHeader>
    <CardTitle className="text-lg font-semibold tracking-tight">Title</CardTitle>
    <CardDescription>Description text</CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">Content area</p>
  </CardContent>
</Card>
```

### Dashboard Shell
```tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden w-64 border-r border-border/50 bg-card/30 backdrop-blur-md lg:block">
        <Sidebar />
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-border/50 bg-card/30 px-6 backdrop-blur-md">
          <Header />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

## Form Pattern (react-hook-form + Zod)
```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

type FormValues = z.infer<typeof formSchema>;

export function ContactForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "" },
  });

  async function onSubmit(values: FormValues) {
    await createContact(values);
    form.reset();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input placeholder="john@example.com" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Submitting..." : "Submit"}
        </Button>
      </form>
    </Form>
  );
}
```

## Data Table with Sorting & Filtering
```tsx
"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

interface DataTableProps<T> {
  data: T[];
  columns: { key: keyof T; label: string; sortable?: boolean; render?: (value: T[keyof T], row: T) => React.ReactNode }[];
  searchKey?: keyof T;
}

export function DataTable<T extends Record<string, unknown>>({ data, columns, searchKey }: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = searchKey
    ? data.filter((item) => String(item[searchKey]).toLowerCase().includes(search.toLowerCase()))
    : data;

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const val = String(a[sortKey]).localeCompare(String(b[sortKey]));
        return sortDir === "asc" ? val : -val;
      })
    : filtered;

  return (
    <div className="space-y-4">
      {searchKey && <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />}
      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={String(col.key)} className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {col.sortable ? (
                    <Button variant="ghost" size="sm" onClick={() => { setSortKey(col.key); setSortDir(sortDir === "asc" ? "desc" : "asc"); }}>
                      {col.label} <ArrowUpDown className="ml-1 h-3 w-3" />
                    </Button>
                  ) : col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row, i) => (
              <TableRow key={i} className="transition-colors hover:bg-muted/50">
                {columns.map((col) => (
                  <TableCell key={String(col.key)}>
                    {col.render ? col.render(row[col.key], row) : String(row[col.key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

## Theming (globals.css)
```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --primary: 262 83% 58%;
    --primary-foreground: 0 0% 98%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --ring: 262 83% 58%;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 5.9%;
    --primary: 262 83% 58%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
  }
}
```

## Rules
- Install via `npx shadcn@latest add [component]` — NEVER manually create
- Use `cn()` for conditional classes
- Use semantic tokens (`primary`, `muted`, `destructive`) — NOT raw colors
- Dark mode via class strategy with `next-themes`
- Keep `components/ui/` untouched — customize in feature components
- Use Sonner for toasts: `import { toast } from "sonner"`

---
name: styling
description: Implement production styling systems with Tailwind CSS, vanilla CSS, or CSS-in-JS. Covers CSS architecture (BEM, utility-first, modules), design tokens, responsive patterns, animation systems, dark mode, container queries, print styles, and performance optimization. Use when implementing designs or building CSS architectures.
---

# Styling Systems

## CSS Architecture Options

| Approach | Best For | Trade-offs |
|----------|----------|-----------|
| Tailwind CSS | Rapid prototyping, team consistency | Verbose HTML, build dependency |
| CSS Modules | Component-scoped, no conflicts | File-per-component overhead |
| Vanilla CSS + Custom Props | Maximum control, no build tools | Requires discipline |
| styled-components | Dynamic styles, CSS-in-JS | Runtime cost, SSR complexity |

## Design Tokens (CSS Custom Properties)

```css
:root {
  /* Colors (HSL for easy manipulation) */
  --color-primary: hsl(262 83% 58%);
  --color-primary-hover: hsl(262 83% 52%);
  --color-success: hsl(142 71% 45%);
  --color-warning: hsl(38 92% 50%);
  --color-danger: hsl(0 84% 60%);

  --color-bg: hsl(0 0% 100%);
  --color-surface: hsl(0 0% 98%);
  --color-text: hsl(240 10% 4%);
  --color-text-muted: hsl(240 5% 46%);
  --color-border: hsl(240 6% 90%);

  /* Spacing (4px base) */
  --space-1: 0.25rem;  --space-2: 0.5rem;   --space-3: 0.75rem;
  --space-4: 1rem;     --space-6: 1.5rem;    --space-8: 2rem;
  --space-12: 3rem;    --space-16: 4rem;     --space-24: 6rem;

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --text-xs: 0.75rem;   --text-sm: 0.875rem;   --text-base: 1rem;
  --text-lg: 1.125rem;  --text-xl: 1.25rem;    --text-2xl: 1.5rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);

  /* Radius */
  --radius-sm: 0.375rem;  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;   --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Transitions */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
}

/* Dark mode override */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: hsl(240 10% 4%);
    --color-surface: hsl(240 10% 6%);
    --color-text: hsl(0 0% 98%);
    --color-text-muted: hsl(240 5% 65%);
    --color-border: hsl(240 4% 16%);
  }
}
```

## Responsive Design

### Mobile-First Breakpoints
```css
/* Mobile: default */
/* Tablet: min-width: 768px */
/* Desktop: min-width: 1024px */
/* Wide: min-width: 1280px */

.container {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: var(--space-4);
}

@media (min-width: 768px) {
  .container { padding-inline: var(--space-6); }
}
```

### Modern Layout Patterns
```css
/* Auto-responsive grid — no media queries needed */
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr));
  gap: var(--space-6);
}

/* Sidebar layout that collapses on mobile */
.sidebar-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
}
@media (min-width: 768px) {
  .sidebar-layout { grid-template-columns: 280px 1fr; }
}
```

## Animation System

```css
/* Reusable animation keyframes */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }

/* Utility classes */
.animate-fade-in { animation: fadeIn var(--duration-normal) var(--ease-out); }
.animate-slide-up { animation: slideUp var(--duration-normal) var(--ease-out); }
.animate-scale-in { animation: scaleIn var(--duration-normal) var(--ease-out); }

/* Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Component Patterns

### Button System
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}
.btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.btn-primary {
  background: var(--color-primary);
  color: white;
}
.btn-primary:hover { background: var(--color-primary-hover); }
.btn-ghost {
  background: transparent;
  color: var(--color-text);
}
.btn-ghost:hover { background: var(--color-surface); }
```

## CSS Container Queries
```css
.card-container { container-type: inline-size; }

@container (min-width: 400px) {
  .card { flex-direction: row; }
}
@container (max-width: 399px) {
  .card { flex-direction: column; }
}
```

## Rules
- Use CSS custom properties for ALL colors, spacing, and typography
- Mobile-first: default styles = mobile, add media queries for larger
- Consistent spacing scale — never arbitrary values
- `prefers-reduced-motion` on ALL animations
- Focus-visible rings on ALL interactive elements
- Never use `!important` — fix specificity instead
- Use `clamp()` for fluid typography
- Use logical properties (`margin-inline`, `padding-block`)

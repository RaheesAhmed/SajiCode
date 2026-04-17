---
name: frontend-design
description: "Create distinctive, production-grade frontend interfaces with bold aesthetics and design systems. Covers CSS custom properties, HSL color systems, component composition, animation patterns, responsive layouts, and accessibility. Use when building any web UI, designing components, creating landing pages, or establishing a design system."
---

# Frontend Design

## Design Workflow

### Step 1: Define Direction

Before writing any code, commit to a bold aesthetic direction:

1. **Purpose** — What problem does this interface solve? Who uses it?
2. **Tone** — Pick a distinct aesthetic: brutalist, retro-futuristic, luxury, editorial, organic, maximalist, neo-brutalist, art-deco, pastel, industrial
3. **Differentiation** — What makes this unforgettable?
4. **Constraints** — Framework, performance budget, accessibility requirements

**Checkpoint:** Can you describe the visual direction in one sentence? If not, refine before coding.

### Step 2: Build Design System

Set up CSS custom properties as the foundation:

```css
:root {
  /* Typography scale (modular scale ratio 1.25) */
  --font-display: 'Cabinet Grotesk', sans-serif;
  --font-body: 'Satoshi', sans-serif;
  --text-sm: clamp(0.8rem, 0.73rem + 0.36vw, 1rem);
  --text-base: clamp(1rem, 0.91rem + 0.45vw, 1.25rem);
  --text-lg: clamp(1.25rem, 1.14rem + 0.57vw, 1.56rem);
  --text-xl: clamp(1.56rem, 1.42rem + 0.71vw, 1.95rem);
  --text-2xl: clamp(1.95rem, 1.78rem + 0.89vw, 2.44rem);

  /* Spacing */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-4: 1rem;
  --space-6: 1.5rem; --space-8: 2rem; --space-16: 4rem;

  /* Transitions */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 150ms;
  --duration-normal: 300ms;
}
```

### Step 3: Define Color System (HSL-based)

```css
:root {
  --hue-primary: 262;
  --primary: hsl(var(--hue-primary) 83% 58%);
  --primary-light: hsl(var(--hue-primary) 83% 72%);
  --primary-dark: hsl(var(--hue-primary) 83% 44%);

  --surface-0: hsl(240 10% 3.9%);     /* Deepest background */
  --surface-1: hsl(240 10% 5.9%);     /* Cards */
  --surface-2: hsl(240 10% 9%);       /* Elevated cards */
  --text-primary: hsl(0 0% 98%);
  --text-secondary: hsl(240 5% 65%);
  --border: hsl(240 4% 16%);
}
```

**Checkpoint:** Verify contrast ratios meet WCAG 2.1 AA (4.5:1 for text, 3:1 for large text).

### Step 4: Build Components

Use composition over inheritance:

```tsx
function Card({ children, variant = "default", interactive = false, className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-300",
        variant === "default" && "bg-surface-1 border-border",
        variant === "elevated" && "bg-surface-2 border-border shadow-lg",
        interactive && "cursor-pointer hover:border-primary/50 hover:shadow-lg",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
```

### Step 5: Add Animation

Staggered reveal on scroll (CSS-only):

```css
.reveal-item {
  opacity: 0;
  transform: translateY(20px);
  animation: revealUp 0.6s var(--ease-out) forwards;
}
.reveal-item:nth-child(1) { animation-delay: 0ms; }
.reveal-item:nth-child(2) { animation-delay: 80ms; }
.reveal-item:nth-child(3) { animation-delay: 160ms; }

@keyframes revealUp {
  to { opacity: 1; transform: translateY(0); }
}
```

Hover micro-interaction:

```css
.interactive-card {
  transition: transform var(--duration-normal) var(--ease-spring),
              box-shadow var(--duration-normal) var(--ease-out);
}
.interactive-card:hover {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 20px 40px -12px rgb(0 0 0 / 0.3);
}
```

### Step 6: Verify Accessibility and Responsiveness

- All interactive elements have visible focus rings
- Color contrast ratio meets WCAG AA minimums
- All images have descriptive `alt` attributes
- Keyboard navigation works for all interactive elements
- ARIA labels on icon-only buttons
- `prefers-reduced-motion` disables animations
- Semantic HTML: `<nav>`, `<main>`, `<article>`, `<section>`

**Checkpoint:** Test with keyboard-only navigation and a screen reader.

## Responsive Strategy

```css
/* Mobile-first: sm:640px md:768px lg:1024px xl:1280px */
.grid-responsive {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}
@media (min-width: 768px) { .grid-responsive { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .grid-responsive { grid-template-columns: repeat(3, 1fr); } }
```

## Anti-Slop Rules

**Never** use these generic choices without explicit justification:

- Inter, Roboto, Arial as display fonts (body text is acceptable)
- Purple-on-white without thematic context
- Generic card grids with no visual hierarchy
- Cookie-cutter hero sections (big text + CTA + image)

**Always** make unexpected, intentional choices that serve the design direction.

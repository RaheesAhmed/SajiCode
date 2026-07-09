---
name: security
description: Comprehensive security auditing and hardening for web applications. Covers OWASP Top 10 with real fix patterns, dependency scanning, secrets management, authentication/authorization implementation, CSP headers, rate limiting, input sanitization, and vulnerability remediation. Use when auditing security, implementing auth, or hardening an application.
---

# Security Audit & Hardening

## Automated Security Scan Workflow

### Step 1: Dependency Audit
```bash
npm audit --production
npx better-npm-audit audit
npx snyk test
```

### Step 2: Secrets Detection
```bash
# Find hardcoded secrets in source
grep -rn "password\|secret\|api_key\|token\|private_key" --include="*.ts" --include="*.js" --include="*.env" --include="*.json" .
grep -rn "sk-\|sk_live\|AKIA\|ghp_\|glpat-\|Bearer " --include="*.ts" --include="*.js" .
```

### Step 3: Code Quality Security Checks
```bash
grep -rn "eval(\|new Function(\|innerHTML\|outerHTML\|document.write" --include="*.ts" --include="*.js" .
grep -rn "dangerouslySetInnerHTML" --include="*.tsx" --include="*.jsx" .
```

## OWASP Top 10 — Fix Patterns

### 1. Injection Prevention
```ts
// SQL: ALWAYS parameterized
const user = await prisma.user.findUnique({ where: { id } });

// NoSQL: Validate types
const sanitizedId = z.string().uuid().parse(req.params.id);

// Command injection: NEVER use shell
import { execFile } from "child_process"; // NOT exec()
execFile("convert", [inputPath, outputPath]);
```

### 2. Authentication Implementation
```ts
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function generateTokenPair(userId: string) {
  const accessToken = jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ sub: userId, type: "refresh" }, process.env.JWT_REFRESH_SECRET!, { expiresIn: REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}
```

### 3. Input Validation (ALL endpoints)
```ts
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  name: z.string().min(1).max(100).trim(),
  password: z.string().min(8).max(128)
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[0-9]/, "Must contain number"),
});

const validated = CreateUserSchema.parse(req.body);
```

### 4. XSS Prevention
```ts
// React: Safe by default (JSX auto-escapes)
// NEVER use dangerouslySetInnerHTML with user data
// Sanitize when you must render HTML
import DOMPurify from "dompurify";
const clean = DOMPurify.sanitize(userHtml, { ALLOWED_TAGS: ["b", "i", "em", "strong", "p"] });
```

### 5. CSRF Protection
```ts
// Use SameSite cookies + CSRF token
res.cookie("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: 15 * 60 * 1000,
  path: "/",
});
```

## Security Headers
```ts
import helmet from "helmet";

app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.example.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
}));
```

## Rate Limiting
```ts
import rateLimit from "express-rate-limit";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/login", authLimiter, loginHandler);
app.post("/register", authLimiter, registerHandler);
```

## Environment Security
```
.env              → Local dev (ALWAYS in .gitignore)
.env.example      → Template with dummy values (committed)
.env.production   → NEVER committed, NEVER in Docker image
```

### Secrets Management Checklist
- [ ] All secrets in environment variables, never in code
- [ ] `.env` in `.gitignore`
- [ ] No secrets in Docker images (use runtime injection)
- [ ] Rotate API keys and tokens every 90 days
- [ ] Use vault service for production (AWS Secrets Manager, HashiCorp Vault)
- [ ] Different secrets for dev/staging/production

---
name: devops
description: Cloud-native DevOps and infrastructure automation. Covers Docker multi-stage builds, Kubernetes deployments, GitHub Actions CI/CD, Vercel/AWS/GCP deployment, monitoring with Prometheus and Grafana, logging, health checks, infrastructure as code, and production readiness checklists. Use when deploying, containerizing, or setting up CI/CD pipelines.
---

# Cloud-Native DevOps

## Docker

### Multi-Stage Build (Node.js)
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 appgroup && adduser --system --uid 1001 appuser
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

### Docker Compose (dev environment)
```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/app
      REDIS_URL: redis://redis:6379
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_started }
    volumes: ["./src:/app/src"]

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
```

## GitHub Actions CI/CD

### Full Pipeline
```yaml
name: CI/CD
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }

  build:
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: "--prod"
```

## Deployment Platforms

### Vercel (Next.js / Frontend)
```bash
npx vercel --prod
# Environment variables: vercel env add SECRET_KEY production
```

### Railway / Render (Backend APIs)
```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc"
  }
}
```

### AWS (ECS Fargate)
```bash
# Build and push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker build -t $ECR_URI:latest .
docker push $ECR_URI:latest
aws ecs update-service --cluster prod --service app --force-new-deployment
```

## Monitoring & Observability

### Health Check Endpoint
```ts
app.get("/health", async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: await checkDatabase(),
    memory: process.memoryUsage(),
  };
  const healthy = checks.database === "ok";
  res.status(healthy ? 200 : 503).json({ status: healthy ? "healthy" : "unhealthy", ...checks });
});

async function checkDatabase(): Promise<string> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch { return "error"; }
}
```

### Structured Logging
```ts
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV === "development"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
  redact: ["req.headers.authorization", "req.body.password"],
});
```

## Production Readiness Checklist
- [ ] Build passes, all tests green
- [ ] Environment variables documented and set
- [ ] Database migrations applied
- [ ] Health check endpoint at `/health`
- [ ] Structured logging (JSON format)
- [ ] Error monitoring configured (Sentry)
- [ ] HTTPS enforced, HSTS enabled
- [ ] Rate limiting on auth endpoints
- [ ] Graceful shutdown handler
- [ ] Backup strategy for database
- [ ] Monitoring alerts configured
- [ ] README deployment instructions updated

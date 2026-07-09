---
name: testing
description: Design and implement comprehensive test suites. Covers unit testing, integration testing, E2E testing with Playwright, API testing, mocking strategies, test data factories, TDD workflow, snapshot testing, coverage targets, and CI integration. Use when writing tests, designing test architecture, or debugging test failures.
---

# Advanced Testing

## Test Architecture

### Test Pyramid
```
        /  E2E  \        ← Few: critical user flows only
       /----------\
      / Integration \    ← Medium: API routes, DB queries
     /----------------\
    /    Unit Tests     \ ← Many: business logic, utils, transforms
```

### File Organization
```
src/
├── services/
│   ├── user-service.ts
│   └── user-service.test.ts      ← Colocated unit tests
├── routes/
│   ├── auth.ts
│   └── auth.integration.test.ts  ← Integration tests
└── __tests__/
    └── e2e/
        └── auth-flow.spec.ts     ← E2E tests
```

## Unit Testing (Vitest / Jest)

### Test Data Factory
```ts
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: crypto.randomUUID(),
    email: `user-${Date.now()}@test.com`,
    name: "Test User",
    role: "USER",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: crypto.randomUUID(),
    title: "Test Post",
    content: "Test content for testing purposes.",
    published: false,
    authorId: crypto.randomUUID(),
    createdAt: new Date(),
    ...overrides,
  };
}
```

### AAA Pattern with Edge Cases
```ts
describe("UserService", () => {
  describe("createUser", () => {
    it("creates user with valid input", async () => {
      const input = { email: "valid@test.com", name: "Valid User" };
      const user = await userService.create(input);
      expect(user.id).toBeDefined();
      expect(user.email).toBe("valid@test.com");
    });

    it("throws on duplicate email", async () => {
      await userService.create({ email: "dup@test.com", name: "First" });
      await expect(userService.create({ email: "dup@test.com", name: "Second" }))
        .rejects.toThrow("Email already exists");
    });

    it("trims and lowercases email", async () => {
      const user = await userService.create({ email: "  UPPER@Test.COM  ", name: "User" });
      expect(user.email).toBe("upper@test.com");
    });

    it("rejects empty name", async () => {
      await expect(userService.create({ email: "a@b.com", name: "" }))
        .rejects.toThrow();
    });
  });
});
```

### Mocking Patterns
```ts
// Mock external service
vi.mock("../lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock with implementation
const mockFetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes("/users/123")) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: "123", name: "Test" }) });
  }
  return Promise.resolve({ ok: false, status: 404 });
});

// Spy on method
const logSpy = vi.spyOn(logger, "error");
await processOrder(invalidOrder);
expect(logSpy).toHaveBeenCalledWith("Order processing failed", expect.any(Object));
```

## API Integration Testing

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../app";

describe("POST /api/auth/register", () => {
  it("returns 201 with valid registration", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "new@test.com", password: "SecurePass123", name: "New User" })
      .expect(201);

    expect(res.body.data.user.email).toBe("new@test.com");
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined(); // Never expose
  });

  it("returns 400 for weak password", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "test@test.com", password: "weak", name: "User" })
      .expect(400);
  });

  it("returns 409 for duplicate email", async () => {
    await request(app).post("/api/auth/register")
      .send({ email: "existing@test.com", password: "Pass123!", name: "User" });
    await request(app).post("/api/auth/register")
      .send({ email: "existing@test.com", password: "Pass456!", name: "User2" })
      .expect(409);
  });
});
```

## E2E Testing (Playwright)

```ts
import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("user can register, login, and access dashboard", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill("e2e@test.com");
    await page.getByLabel("Password").fill("SecurePass123!");
    await page.getByLabel("Name").fill("E2E User");
    await page.getByRole("button", { name: "Register" }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Welcome, E2E User")).toBeVisible();
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("wrong@test.com");
    await page.getByLabel("Password").fill("wrongpass");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Invalid credentials")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });
});
```

## Coverage & CI

### Coverage Targets
| Layer | Target | Strategy |
|-------|--------|----------|
| Business logic | 90%+ | Unit tests |
| API routes | 80%+ | Integration tests |
| UI components | 70%+ | Component tests |
| E2E flows | Critical paths | Playwright |

### CI Configuration
```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run test -- --coverage
    - run: npx playwright install --with-deps
    - run: npm run test:e2e
```

## Rules
- Test behavior, not implementation details
- NEVER hardcode values to make tests pass — fix the code
- Use factories for test data — never raw objects
- Mock external dependencies — never real APIs in unit tests
- One concept per test — descriptive test names
- Clean up test data in `afterEach` / `afterAll`

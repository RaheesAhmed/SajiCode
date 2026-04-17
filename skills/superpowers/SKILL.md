---
name: superpowers
description: "Systematic engineering workflow for safe multi-file refactoring, cross-file renames, dependency-aware restructuring, and production code quality enforcement. Provides analyze-plan-implement-verify cycle with pre-flight checklists and rollback planning. Use when refactoring across multiple files, renaming or moving modules, reorganizing code structure, or making large-scale changes that affect imports and dependencies."
---

# Engineering Superpowers

## Workflow (follow this order for every task)

### 1. ANALYZE — Understand before you touch

Read every file to modify BEFORE writing anything:

1. Run `read_file` on each target file and its direct imports
2. Check `package.json` / `requirements.txt` for existing dependencies
3. Map the dependency graph: what imports what
4. Identify established patterns (naming, structure, error handling)
5. Check for existing tests related to the code being changed

**Checkpoint:** Can you list every file that will be affected and why? If not, read more.

### 2. PLAN — Think before you code

1. Break task into ordered steps with `write_todos`
2. Identify files to create vs modify vs delete
3. Map the blast radius: what breaks if you change X?
4. Plan change order (dependencies first, dependents after)
5. Consider edge cases BEFORE implementing

**Checkpoint:** Does the plan account for all imports and consumers of changed files?

### 3. IMPLEMENT — Write production code

- Complete, working code — never TODOs, placeholders, or stubs
- Handle edge cases: empty input, null, undefined, network errors, timeouts
- Use proper TypeScript types — `unknown` over `any`, explicit return types
- Follow patterns already in the codebase
- Install dependencies BEFORE importing them

### 4. VERIFY — Prove it works

1. Search for `TODO`, `FIXME`, `PLACEHOLDER`, `HACK` in your output
2. Verify all imports resolve to real files/packages
3. Run build command to catch type errors
4. Run tests if they exist
5. Check for unused imports and dead code

**Checkpoint:** Does the build pass? Are all tests green? If not, fix before proceeding.

## Multi-File Refactoring Safety

### Pre-Flight Checklist

Before touching any file:

1. List ALL files that will be affected
2. Check `git status` — are there uncommitted changes? If so, commit or stash first
3. Identify the dependency order for changes
4. Plan rollback: what to revert if something breaks

### Change Order Protocol

1. Create new files first (no existing code depends on them)
2. Update shared modules (types, utils, constants)
3. Update consumers (components, routes, handlers)
4. Update entry points (index files, main files)
5. Remove deprecated code LAST
6. **Verify build passes after each step** — do not batch all changes

### Rename/Move Safety

1. `grep` for ALL references: imports, usages, config references
2. Update ALL import paths in dependent files
3. Update barrel exports (`index.ts` files)
4. Update config files (`tsconfig` paths, webpack aliases)
5. Verify build passes after EVERY rename

## Code Quality Rules

- `unknown` over `any` — narrow with type guards
- Structured logger or throw over `console.log` for errors
- Parameterized queries and `URL` API over string concatenation in SQL/URLs
- Always handle or rethrow in catch blocks — never empty
- Constants, config, or environment variables over hardcoded values
- No barrel re-exports with side effects (breaks tree-shaking)
- No circular imports — restructure to break the cycle

```ts
// Pattern: explicit types, validation, error handling
async function fetchUser(id: string): Promise<User> {
  if (!id?.trim()) throw new Error("User ID required");
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new HttpError(`User fetch failed: ${response.status}`, response.status);
  }
  return response.json() as Promise<User>;
}
```

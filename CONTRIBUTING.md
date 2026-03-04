# Contributing to sajicode

Thank you for your interest in contributing to sajicode! We welcome contributions from developers of all skill levels.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Git
- TypeScript knowledge
- Anthropic API key for testing

### Development Setup
```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/YOUR-USERNAME/sajicode.git
cd sajicode

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Build the project
npm run build

# Run in development mode
npm run dev
```

## 📋 How to Contribute

### 1. Find Something to Work On
- Check [Issues](https://github.com/RaheesAhmed/sajicode/issues) for open tasks
- Look for issues labeled `good first issue` or `help wanted`
- Propose new features by creating an issue first

### 2. Create a Branch
```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 3. Make Your Changes
Follow our coding standards (see below) and make your changes.

### 4. Test Your Changes
```bash
# Run tests
npm test

# Build to check for errors
npm run build

# Test the CLI manually
node ./dist/index.js
```

### 5. Submit a Pull Request
```bash
# Commit your changes
git add .
git commit -m "feat: add your feature description"

# Push to your fork
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 🔧 Code Standards

### TypeScript Guidelines
- Use strict TypeScript configuration
- Define proper interfaces and types
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

```typescript
/**
 * Processes user message and returns AI response
 * @param message - User input message
 * @param options - Optional processing configuration
 * @returns Promise resolving to agent response
 */
async function processMessage(message: string, options?: ProcessOptions): Promise<AgentResponse> {
  // Implementation
}
```

### File Organization
```
src/
├── agents/           # AI agent implementations
├── cli/              # Command-line interface
├── core/             # Core functionality (context, memory, validation)
├── mcp/              # MCP client and server integration
├── tools/            # Built-in tools and utilities
├── types/            # TypeScript type definitions
└── utils/            # General utility functions
```

### Naming Conventions
- **Files**: PascalCase for classes (`ContextManager.ts`), kebab-case for utilities (`file-utils.ts`)
- **Classes**: PascalCase (`class TokenOptimizer`)
- **Functions**: camelCase (`processMessage()`)
- **Constants**: UPPER_SNAKE_CASE (`API_ENDPOINTS`)
- **Interfaces**: PascalCase with descriptive names (`interface AgentConfig`)

### Error Handling
```typescript
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return { 
    success: false, 
    error: error instanceof Error ? error.message : 'Unknown error'
  };
}
```

## 🧪 Testing

### Test Structure
- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test component interactions
- **CLI tests**: Test command-line interface

### Writing Tests
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../src/core/context/ContextManager.js';

describe('ContextManager', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager();
  });

  it('should initialize with empty context', () => {
    expect(contextManager.getContext()).toEqual({});
  });

  it('should update context correctly', async () => {
    await contextManager.updateContext('key', 'value');
    expect(contextManager.getContext().key).toBe('value');
  });
});
```

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📝 Documentation

### Code Documentation
- Add JSDoc comments for all public APIs
- Include parameter types and return types
- Provide usage examples for complex functions

### README Updates
- Update README.md if you add new features
- Include configuration examples
- Update the feature list if applicable

### Commit Messages
Follow [Conventional Commits](https://conventionalcommits.org/):

```bash
# Examples
feat: add MCP server integration
fix: resolve spinner interference issue
docs: update configuration examples
test: add unit tests for TokenOptimizer
refactor: simplify context management logic
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment Details**
   - Node.js version
   - Operating system
   - sajicode version

2. **Steps to Reproduce**
   - Clear, step-by-step instructions
   - Input that caused the issue

3. **Expected vs Actual Behavior**
   - What should happen
   - What actually happened

4. **Additional Context**
   - Error messages or logs
   - Screenshots if relevant

## 💡 Feature Requests

When requesting features:

1. **Use Case**: Describe the problem you're trying to solve
2. **Proposed Solution**: Your ideas for implementation
3. **Alternatives**: Other approaches you've considered
4. **Impact**: Who would benefit from this feature

## 🔍 Code Review Process

### What We Look For
- **Functionality**: Does the code work as intended?
- **Code Quality**: Is it readable and maintainable?
- **Performance**: Are there any performance concerns?
- **Security**: Are there any security implications?
- **Tests**: Are there adequate tests for the changes?

### Review Checklist
- [ ] Code follows our style guidelines
- [ ] All tests pass
- [ ] Documentation is updated if needed
- [ ] No breaking changes (or properly documented)
- [ ] Error handling is appropriate
- [ ] Performance impact is considered

## 🏗️ Development Areas

### High Priority
- **MCP Server Integration**: Add support for new MCP servers
- **Model Support**: Integrate additional AI models
- **Testing**: Improve test coverage
- **Documentation**: Enhance user guides and API docs

### Areas for Contribution
- **Performance Optimization**: Token usage and response time improvements
- **Error Handling**: Better error messages and recovery
- **CLI Interface**: Enhanced user experience
- **Memory System**: Advanced learning and context management
- **Validation Engine**: Code quality and security checks

## ❓ Getting Help

- **Discussions**: Use [GitHub Discussions](https://github.com/RaheesAhmed/sajicode/discussions) for questions
- **Issues**: Report bugs and request features in [Issues](https://github.com/RaheesAhmed/sajicode/issues)

## 📜 License

By contributing to sajicode, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to sajicode! 🙏
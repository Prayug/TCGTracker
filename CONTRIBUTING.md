# Contributing to Pokemon TCG Investment Tracker

First off, thank you for considering contributing to Pokemon TCG Investment Tracker! It's people like you that make this project great.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/TCGTracker.git`
3. Add upstream remote: `git remote add upstream https://github.com/original/TCGTracker.git`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Process

1. **Sync your fork**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Make your changes**
   - Write clear, concise code
   - Follow the existing code style
   - Add tests for new features
   - Update documentation as needed

3. **Test your changes**
   ```bash
   # Frontend tests
   npm test
   npm run type-check
   npm run lint
   
   # Backend tests
   cd backend
   npm test
   npm run lint
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

## Pull Request Process

1. Update the README.md with details of changes if applicable
2. Update the CHANGELOG.md following the existing format
3. Ensure all tests pass and coverage remains high
4. Update documentation for any API changes
5. Submit your PR with a clear title and description

### PR Title Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Examples:
- `feat: add price alert notification system`
- `fix: resolve card search pagination issue`
- `docs: update API documentation for auth endpoints`

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow the existing ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Prefer functional programming patterns
- Keep functions small and focused

### React Components

- Use functional components with hooks
- Implement proper prop types
- Keep components focused on a single responsibility
- Extract reusable logic into custom hooks
- Use memo for expensive components

Example:
```typescript
interface CardProps {
  id: string;
  name: string;
  onSelect: (id: string) => void;
}

export const Card: React.FC<CardProps> = React.memo(({ id, name, onSelect }) => {
  return (
    <div onClick={() => onSelect(id)}>
      {name}
    </div>
  );
});
```

### Backend Code

- Use async/await for asynchronous operations
- Implement proper error handling
- Validate all inputs
- Use middleware for cross-cutting concerns
- Follow REST API best practices

Example:
```typescript
router.post('/api/cards', authenticate, validate(cardSchema), async (req, res) => {
  try {
    const card = await cardService.create(req.body);
    res.status(201).json({ card });
  } catch (error) {
    logger.error('Failed to create card', { error });
    res.status(500).json({ error: error.message });
  }
});
```

## Testing Guidelines

### Frontend Tests

- Write tests for all components
- Test user interactions
- Mock external dependencies
- Aim for 80%+ coverage

```typescript
describe('SearchBar', () => {
  it('calls onSearch when input changes', async () => {
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);
    
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'Charizard');
    
    expect(onSearch).toHaveBeenCalledWith('Charizard');
  });
});
```

### Backend Tests

- Test all API endpoints
- Test business logic separately
- Use supertest for integration tests
- Aim for 85%+ coverage

```typescript
describe('POST /api/auth/register', () => {
  it('creates new user with valid data', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'securepassword123'
      })
      .expect(201);
    
    expect(response.body).toHaveProperty('token');
    expect(response.body.user).toHaveProperty('id');
  });
});
```

## Commit Messages

Write clear, descriptive commit messages:

### Good Commits
```
feat: add user authentication with JWT
fix: resolve price history data loading issue
docs: update API documentation for alerts endpoint
test: add integration tests for card search
```

### Bad Commits
```
update
fix bug
changes
wip
```

### Commit Message Structure

```
<type>(<scope>): <subject>

<body>

<footer>
```

Example:
```
feat(auth): implement JWT refresh token mechanism

- Add refresh token generation
- Implement token rotation
- Add refresh endpoint to API
- Update frontend to use refresh tokens

Closes #123
```

## Code Review Process

All submissions require review. We use GitHub pull requests for this purpose.

### Reviewer Guidelines

- Be constructive and respectful
- Focus on the code, not the person
- Explain the "why" behind suggestions
- Approve when ready, request changes when needed

### Author Guidelines

- Respond to all comments
- Make requested changes or discuss alternatives
- Mark conversations as resolved
- Be patient and professional

## Questions?

Feel free to open an issue for:
- Feature requests
- Bug reports
- Questions about the codebase
- Suggestions for improvements

Thank you for contributing! 🎉


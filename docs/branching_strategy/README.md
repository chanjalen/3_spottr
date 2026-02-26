# Git Branching Strategy

## Branch Structure

```
main (production)
  └── dev (development)
       ├── feature/feature-name
       ├── bugfix/bug-description
       └── hotfix/critical-fix
```

## Branch Types

### `main`
- Production-ready code
- Protected branch - requires pull request
- All code must pass tests before merging

### `dev`
- Main development branch
- Integration branch for features
- Should always be deployable to staging

### `feature/*`
- New features and enhancements
- Created from: `dev`
- Merges back to: `dev`
- Naming: `feature/short-description`
- Example: `feature/gym-search`, `feature/workout-tracking`

### `bugfix/*`
- Bug fixes for development
- Created from: `dev`
- Merges back to: `dev`
- Naming: `bugfix/issue-description`
- Example: `bugfix/login-validation`

### `hotfix/*`
- Critical production fixes
- Created from: `main`
- Merges to: `main` AND `dev`
- Naming: `hotfix/critical-issue`
- Example: `hotfix/security-patch`

## Workflow

1. **Start new work:**
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/my-feature
   ```

2. **Regular commits:**
   ```bash
   git add .
   git commit -m "Descriptive commit message"
   ```

3. **Push and create PR:**
   ```bash
   git push origin feature/my-feature
   # Create Pull Request on GitHub: feature/my-feature -> dev
   ```

4. **After PR approval:**
   - Merge feature branch into dev
   - Delete feature branch

5. **Release to production:**
   - Create PR: dev -> main
   - After approval, merge to main
   - Tag release version

## Commit Message Format

```
type: short description

- Detail 1
- Detail 2
```

Types:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting
- `refactor:` Code restructuring
- `test:` Adding tests
- `chore:` Maintenance

## Protected Branches

Both `main` and `dev` are protected:
- Require pull request reviews
- Require status checks to pass
- No direct pushes allowed

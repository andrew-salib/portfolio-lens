# Project coding style

- Keep source code normally formatted and easy to scan.
- Use descriptive names instead of single-letter variables.
- Keep lines under 88 characters where practical.
- Separate parsing, calculations, data access, and UI responsibilities.
- Add comments only for non-obvious business rules or safety checks.
- Run the formatter and build after meaningful changes.

# Contribution workflow

- For each new feature request, create a separate branch and open a pull request
  for the user's review.
- Do not push feature changes directly to `main` or merge their pull requests
  unless the user explicitly requests it.

# Backend deployment memory

- When backend/server code, shared backend data, dependencies, or database schema
  changes, deployment is not complete until the merged main code is built on the
  laptop, required migrations/seeds are applied, and the backend/tunnel is restarted.
- Run `npm run build`, then
  `launchctl kickstart -k gui/$(id -u)/com.andrew.portfolio-lens`.
- Verify the public API and successful Pages deployment with the new tunnel URL.
  Never restart the public service with unmerged feature code.
- Keep the mandatory live-backend checks in pages.yml. Do not bypass failures:
  deploy the matching backend and rerun Pages. GitHub does not update the laptop.

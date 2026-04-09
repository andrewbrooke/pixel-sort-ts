# Contributing

Thanks for your interest in contributing to pixel-sort. Here are the guidelines to follow before opening a pull request.

## Getting started

1. Fork the repository and create a branch from `main`.
2. Install dependencies at the repo root and in `web/`:
   ```bash
   npm install
   cd web && npm install
   ```
3. Make your changes, then verify everything passes before submitting:
   ```bash
   npm run lint
   npm run format:check
   npm test
   ```

## Coding standards

- TypeScript throughout — no plain `.js` additions to `src/` or `web/`.
- ESLint and Prettier are enforced. Run `npm run lint:fix` and `npm run format` to auto-fix before pushing.
- Core sort logic lives in `src/`. Avoid importing Node-specific modules (`fs`, `path`, `jimp`) there — `src/` is shared with the browser build.
- Keep new options wired up end-to-end: type → constant default → sort logic → CLI flag → web UI control.

## Tests

- All new behavior should be covered by unit tests in `test/`.
- Tests use Mocha + Chai. Follow the existing patterns in `test/sort.test.ts`.
- Run the full suite with `npm test` and check coverage with `npm run test:coverage`.
- Do not submit a PR that causes existing tests to fail.

## Pull requests

- Keep PRs focused. One feature or fix per PR.
- Write a clear description explaining _what_ changed and _why_.
- Reference any related issues with `Closes #<number>`.
- Update the README if you add or change any user-facing behavior (flags, options, UI controls).

## AI-assisted contributions

Contributions written fully or partially with AI tools (ChatGPT, Claude, Copilot, etc.) are welcome. However:

> **A human must review, understand, and take responsibility for any AI-generated code before submitting. PRs where it is clear the output has not been reviewed will be automatically denied.**

This means:

- Read the diff. Do not blindly paste and open a PR.
- Verify the logic is correct and matches the intent of the change.
- Run the test suite yourself — do not rely on the model's claim that tests pass.
- If the AI added tests, confirm they actually exercise the behavior they claim to cover.

The quality bar is the same regardless of who or what wrote the code.

## Reporting bugs

Open an issue with a minimal reproduction: the command or steps used, the input image dimensions and format if relevant, and the actual vs expected output.

## License

By contributing you agree that your changes will be released under the same [MIT](LICENSE) terms as this project.

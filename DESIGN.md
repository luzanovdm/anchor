# Design

Anchor reuses **Tetri's design language** rather than inventing its own. The
tokens and primitive components are vendored verbatim into `packages/ui-kit`
from `@tetri/ui-kit`.

## What was vendored

- **Design tokens** (`packages/ui-kit/src/styles/tokens.scss` + `tokens/*`) — the
  full `--tt-*` custom-property system: colors, typography (IBM Plex Sans / Plex
  Mono), spacing, radii, shadows, glass, z-index, motion. Dark is the default
  theme (`<html data-theme="dark">`); light is fully defined too.
- **Mixins** (`packages/ui-kit/src/styles/mixins/*`) — typography, surfaces,
  interactive, scrollbar, layout, etc. Components reference them via
  `@use 'styles/mixins'`, resolved through the `stylePreprocessorOptions`
  include path.
- **Generic primitives** (`packages/ui-kit/src/lib/*`): `button`, `icon-button`,
  `badge`, `chip`, `card`, `callout`, `divider`, `eyebrow`, `empty-state`,
  `list-item`, `spinner`, plus the `tt-size` directive.

## What was intentionally excluded

- Finance/domain components (amount, limit-card, wallet, rrule-builder, charts…).
- Components pulling `@tetri/core` / `@tetri/colors` / `@tetri/web-core`,
  `@angular/cdk`, `@ng-icons`, `@angular/localize`, or experimental
  `@angular/forms/signals` — kept out to keep the vendored lib self-contained.

## Rules

- **Vendored code is exempt** from Anchor's authoring conventions. `@tetri/ui-kit`
  predates the no-BEM rule and uses `tt-btn--primary`-style modifiers; it is
  copied as-is and excluded from ESLint. Do not "fix" it — re-vendor instead.
- **App code (everything outside `packages/ui-kit`) follows the Tetri hard rules**:
  no BEM (`__` / `--` in class names), tokens only (no hardcoded hex/px/ms), focus
  ring via `box-shadow`, no `transition: all`, `prefers-reduced-motion` respected.
- Consume primitives, never re-inline a button/badge/etc. Use the `--tt-*` tokens
  in feature styles.

## Updating

To pull newer Tetri primitives, re-copy from the monorepo
(`libs/ui-kit/src/lib/<component>` + `src/styles`, and `apps/web/src/styles/tokens*`)
and re-run the exclusion checks (no `@tetri/*`, `$localize`, or `@ng-icons`
imports leaking in). Don't hand-edit vendored files.

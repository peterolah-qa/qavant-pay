# Redesign "Obsidian Cyber-Fintech"

Source: Stitch export (`docs/design/*.png`, `docs/design/DESIGN.md`) and the PRD (`docs/design/PRD.md`).
Plan on the board: R0–R9 (#61–#70).

## Design review – decisions before implementation

| Finding in the design | Risk | Decision |
| --- | --- | --- |
| "Quantum Shield", "256-bit Q-Sec", "3D Biometric Pin Enforced", "Quantum Micro-Tokenization", "Transaction Hash" | A security portfolio that claims features it does not have | Made **true** in R8: passkeys (WebAuthn) step-up, AES-256-GCM card numbers, hash-chained ledger, rotating virtual card number. "Quantum" is dropped – no such protection exists. |
| Photos of people (avatars) and the Lidl logo, hot-linked from googleusercontent.com | Trademarks, AI faces, third-party requests (GDPR, CSP), unstable screenshots | Initials avatars and category icons, everything self-hosted |
| Google Fonts, Material Symbols and Tailwind from CDNs | Third-party requests, GDPR (LG München 2022) | `@fontsource` (Space Grotesk, Hanken Grotesk, JetBrains Mono), inline SVG icons, CSS Modules + tokens |
| "Swipe to Send" works only by dragging | Fails WCAG 2.2 · 2.5.7 Dragging Movements | Swipe **plus** keyboard (Enter/Space) and tap-to-confirm alternative |
| Stats and Vaults tabs (PRD phase 2) | Dead navigation | Built fully in R6 and R7; until then honest "in development" screens |
| EUR / USD / GBP pockets, Request, Convert | Backend had only EUR | Real multi-currency accounts + Convert + Request in R5 |
| Screens without a design: PIN, History, 404, transfer success and error states | Inconsistent look | Derived from the same tokens and components |

Contrast of every text/background pair in DESIGN.md was checked before implementation (lowest: muted `#8F94A6`
on `#282A30` = 4.75:1, passes WCAG AA); axe re-checks every screen in CI.

## Palette: Ion Violet (chosen after a first look)

The lime of the Stitch design (`#CDF12A`) felt too loud once it was on real screens. Four palettes were rendered on
the same dashboard layout (`docs/design/palette-options.png`): A Noir Cyan, **B Ion Violet**, C Graphite Champagne,
D Deep Electric. **B was chosen**: violet `#A88BFF` as the primary accent, mint `#3FE0C5` for security, status and
positive amounts, near-black violet surfaces.

Subtle cyberpunk details on a classic, calm base: a fine dot grid with two soft colour glows behind the page,
cards with a violet→mint hairline edge, corner marks and faint scanlines, mono labels. The favicon and the
iPhone home-screen icon use the same mark (violet "Q" with a mint tail).

Contrast of every text/background pair was computed before switching (lowest: muted `#9790AB` on `#2C2740`
= 4.69:1, text on violet buttons 6.8:1) and axe confirms it on every screen in CI.

## Tokens

`apps/web/src/styles/tokens.css` – values from DESIGN.md. Pre-redesign names (`--bg`, `--accent` …) are aliases
until every screen is migrated.

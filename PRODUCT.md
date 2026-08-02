# Product

## Register

product

## Users

Spanish freelancers / self-employed professionals (autónomos) managing their own invoicing, client relationships, contracts, expenses, and quarterly tax filings. Solo operators, not enterprise teams — they use this on their own Mac between billable work, wanting the app to be fast, unobtrusive, and trustworthy with money and tax data.

## Product Purpose

A native-feeling macOS desktop tool (Tauri) that replaces spreadsheets and generic invoicing SaaS for a single freelancer's back office: clients, contracts, invoices (with Spanish tax rules — NIF/CIF, IVA, IRPF), expenses, and quarterly (trimestral) tax summaries. Success means the user trusts it with real financial/tax data and can complete billing tasks in seconds, not minutes.

## Brand Personality

Quiet, orderly, trustworthy. Feels like a well-made macOS system app (Mail, Notes, Numbers) — not a startup SaaS dashboard. Confidence comes from restraint and correctness, not flourish.

## Anti-references

- Marketing-site/SaaS-dashboard aesthetics: hero metrics, gradient accents, asymmetric landing-page layouts.
- System blue as accent — this app has its own locked terracotta accent tint, like a custom macOS accent-color choice.
- Decorative glassmorphism — blur only appears where there's real scrolling content behind it (toolbar, sheets, menus), never as a flat decorative effect (the sidebar stays opaque).
- Cinematic or bouncy motion — springs are functional (sliding selection, sheet entrances), never elastic, never for show.

## Design Principles

1. Native macOS fidelity over web-app conventions — no responsive breakpoints, no mobile nav, real title bar, system-native components (sheets, menus, switches) via Radix.
2. One accent, used identically everywhere (terracotta, locked light/dark values) — never introduce a second accent color.
3. Grid-predictable, not asymmetric — financial/tax data needs low variance and high legibility over landing-page flourish.
4. Honest glass — translucency only over moving content; solid materials elsewhere.
5. Dense but organized — this is a finance tool; density stays high, but grouped and legible rather than cramped.

## Accessibility & Inclusion

- Full dark mode parity (class-based, tested per screen).
- `prefers-reduced-motion` respected globally (springs disabled/reduced).
- Standard WCAG AA contrast expectations for financial data (numbers, table text) in both themes.

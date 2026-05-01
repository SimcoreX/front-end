# SimcoreX Frontend UI Standards

This document defines the default visual system for new and existing UI components.
Use this as the source of truth when creating or updating screens.

## 1. Core Visual Direction

- Theme: dark dashboard, high contrast, clean hierarchy.
- Primary card surface reference: Dashboard Summary cards.
- Design goal: consistency first, minimal visual drift between tabs/pages.

## 2. Canonical Card Pattern

Use this as the default card style across pages and tabs:

- `rounded-2xl`
- `bg-primary-900/60`
- `shadow-[0_8px_24px_rgba(0,0,0,0.18)]`

Default card spacing:

- Compact card: `p-3`
- Standard card: `p-4`
- Large card: `p-5`

Card rules:

- Do not add border on cards by default.
- Do not use alternate card backgrounds like `bg-primary-950/40` or `bg-primary-950/50` unless explicitly approved for a special case.
- Keep card radius at `rounded-2xl` for consistency.

## 3. Where Borders Are Allowed

Borders are allowed for controls and structure, not for the default card shell:

- Buttons, inputs, selects, tabs, pills, table cells, list dividers.
- Modal containers (when needed for visual separation).
- Media frames (image/video wrappers) when needed.

Avoid:

- White border on cards.
- Inconsistent heavy borders around card containers.

## 4. Buttons

Preferred button variants:

- Primary action: `variant="primary"`
- Secondary action: `variant="secondary"`
- White-style action: `variant="light"`
- Destructive action: `variant="destructive"`

Usage guidance:

- Keep one clear primary action per section.
- Use `size="sm"` for table/list/tool actions.
- Use `size="md"` for form primary actions.
- Avoid ad-hoc inline color overrides unless necessary.

## 5. Inputs, Selects, Date Pickers

Default field style direction:

- Dark field background.
- Subtle border.
- Clear focus ring.

Recommended pattern (already used in shared components):

- `rounded-xl`
- `border border-secondary-500/40`
- `bg-primary-900/60`
- `focus:border-secondary-400`
- `focus:ring-2 focus:ring-secondary-500/30`

## 6. Tabs

Tab header pattern:

- Active: white text + accent underline.
- Inactive: muted text + transparent underline + hover highlight.

Keep spacing and typography stable between pages:

- Tab text size: `text-sm`
- Weight: `font-semibold`

## 7. Charts and Data Visualization

Chart container (card) must use canonical card pattern.

Color semantics:

- Positive values: green tones (`text-green-400`, `bg-green-*`).
- Negative values: red tones (`text-red-400`, `bg-red-*`).
- Neutral/supporting text: `text-primary-200` / `text-primary-300`.

Chart-specific accents may vary, but maintain:

- Strong contrast against dark background.
- Consistent axis/label readability.
- Same card container style as other cards.

## 8. Icons

Phosphor icon usage:

- Navigation/context icons: size 16-20.
- Section accent icons: size 24-28.
- Keep icon weight consistent by context (`duotone` or `bold`), avoid random mixing in same area.

## 9. Typography and Spacing

Default hierarchy:

- Section title: `text-lg font-semibold text-white`
- Card title: `text-sm` to `text-base` + `font-semibold`
- Body copy: `text-sm text-primary-200`
- Support text: `text-xs text-primary-300`

Spacing rhythm:

- Section stacks: `gap-6`
- Card internal groups: `gap-3` or `gap-4`
- Dense metadata rows: `gap-2`

## 10. Modals and Explicit Exceptions

General modal style may use stronger separation (overlay, border, stronger shadow).

Current protected exceptions (do not restyle without explicit request):

- Trade Calendar modal
- Day/Add Journal modal

## 11. i18n Rules

Whenever adding UI strings:

- Add keys to all locales: `pt.json`, `en.json`, `es.json`.
- Keep key structure mirrored across locales.
- Do not ship feature text in only one language.

## 12. Implementation Checklist

For every new component/page:

1. Uses canonical card style for all card surfaces.
2. Avoids card borders unless approved.
3. Keeps button variants within standard set.
4. Uses shared form components when possible.
5. Preserves positive/negative color semantics.
6. Adds i18n entries in all locales.
7. Runs lint and resolves issues.

## 13. Quick Class Reference

- Canonical card:
  - `rounded-2xl bg-primary-900/60 shadow-[0_8px_24px_rgba(0,0,0,0.18)]`
- Standard section card padding:
  - `p-4`
- Compact section card padding:
  - `p-3`
- White action button:
  - `variant="light"`

---

When a new visual request conflicts with this guide, update this document in the same PR so the rule set stays current.
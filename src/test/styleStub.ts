/**
 * Stub for stylesheet imports under Vitest.
 *
 * `@stellar/design-system`'s compiled components import their own
 * `./styles.scss`, but the published build does not ship those files — Vite
 * resolves them only because the real app build pulls the styles from the
 * package's bundled CSS. Under jsdom the import fails outright, which breaks
 * any test that renders a design-system component.
 *
 * Mapping every stylesheet import here keeps component tests focused on
 * behaviour and markup, which is all a jsdom test can assert about styling
 * anyway.
 */
export default {};

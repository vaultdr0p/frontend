import { resolve } from "path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

/**
 * Vitest config, kept separate from vite.config.ts.
 *
 * vite.config.ts is a `defineConfig(({ mode }) => ...)` factory that reads
 * mkcert certificates off disk, resolves HTTPS options and wires the node
 * polyfill / static-copy / svgr plugin chain for a browser build. None of that
 * is wanted — or available — in a jsdom test run, so this file declares the
 * minimum a component test needs instead of inheriting all of it.
 *
 * The `@` alias is duplicated from vite.config.ts deliberately: it has to match
 * tsconfig.json's `paths` for imports to resolve identically in tests, the
 * editor and the build.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Order matters: the stylesheet rule has to be tried before "@", or an
      // import like "@/x.scss" would resolve as a source path.
      //
      // The pattern must match the *whole* specifier: Vite replaces only the
      // matched part, so a bare /\.s?css$/ turned "./Foo.scss" into
      // "./Foo/abs/path/styleStub.ts", which does not exist.
      {
        find: /^.+\.s?css$/,
        replacement: resolve(__dirname, "src/test/styleStub.ts"),
      },
      // The browser build resolves this package via its `module` field, an
      // ESM bundle with no stylesheet imports. Vitest would otherwise take the
      // CJS `main`, which re-exports per-component files that each import a
      // ./styles.scss the package does not ship.
      {
        find: /^@stellar\/design-system$/,
        replacement: resolve(__dirname, "node_modules/@stellar/design-system/build/index.esm.js"),
      },
      { find: "@", replacement: resolve(__dirname, "src") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Stubs the runtime env config and registers jest-dom matchers; see the
    // file for why this must run before any module import.
    setupFiles: ["./src/vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The generated bindings and the build output are not ours to test.
    exclude: ["node_modules", "build", "src/contracts/**"],
    css: false,
  },
});

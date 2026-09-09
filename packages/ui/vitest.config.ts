import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "ui",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // macOS AppleDouble sidecars (`._name.test.ts`) match the include glob on
    // non-HFS volumes and are not JavaScript. See .gitignore.
    exclude: [...configDefaults.exclude, "**/._*"],
    setupFiles: ["./vitest.setup.ts"],
  },
});

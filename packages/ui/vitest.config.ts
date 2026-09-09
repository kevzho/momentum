import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "ui",
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // macOS AppleDouble sidecars (`._name.test.ts`) match the include glob.
    exclude: [...configDefaults.exclude, "**/._*"],
    setupFiles: ["./vitest.setup.ts"],
  },
});

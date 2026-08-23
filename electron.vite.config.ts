import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

function inlineAngularTemplate() {
  return {
    name: "rift-inline-angular-template",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.endsWith("/app.component.ts")) return null;
      const template = readFileSync(resolve("src/renderer/src/app.component.html"), "utf8");
      return code.replace('templateUrl: "./app.component.html"', `template: ${JSON.stringify(template)}`);
    }
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs"
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared")
      }
    },
    plugins: [inlineAngularTemplate()]
  }
});

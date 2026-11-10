import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

function inlineAngularTemplate() {
  return {
    name: "rift-inline-angular-template",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.endsWith(".component.ts")) return null;
      return code.replace(/templateUrl:\s*(['"])(\.\/[^'"]+)\1/g, (_match, _quote, relative) => {
        const template = readFileSync(resolve(id.slice(0, id.lastIndexOf('/')), relative), "utf8");
        return `template: ${JSON.stringify(template)}`;
      });
    }
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve("app-out/main")
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve("app-out/preload"),
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
    plugins: [inlineAngularTemplate()],
    build: {
      outDir: resolve("app-out/renderer")
    }
  }
});

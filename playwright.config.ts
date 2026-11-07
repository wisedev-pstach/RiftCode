import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/ui',workers:1,use:{launchOptions:{executablePath:process.env.CHROMIUM_EXECUTABLE},baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:900}},webServer:{command:'npx vite preview --host 127.0.0.1 --port 4173 --outDir app-out/renderer',url:'http://127.0.0.1:4173',reuseExistingServer:false}});

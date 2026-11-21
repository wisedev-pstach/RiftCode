import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'../ui',testMatch:'factory.spec.ts',timeout:15000,workers:1,outputDir:'/opt/data/output/riftcode/software-factory/angular-ui/test-results',reporter:'list',use:{headless:true,launchOptions:{executablePath:'/opt/hermes/tools/chromium-1248/chrome-linux64/chrome'}}});

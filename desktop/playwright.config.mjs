import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests', timeout:45000, workers:1, fullyParallel:false,
  expect:{ timeout:10000 }, reporter:'list',
  outputDir:'../test-results/desktop-app',
});

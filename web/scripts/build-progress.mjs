import { build } from 'esbuild';
await build({ entryPoints: ['src/server/connector/progress-client.ts'], bundle: true, format: 'iife', platform: 'browser', minify: true, outfile: 'generated/progress-client.js' });

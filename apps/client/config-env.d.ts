// app.config.ts runs in Node at build time; the app itself never imports Node modules.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

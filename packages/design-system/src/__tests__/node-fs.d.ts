// `@types/node` is not a dependency of this package (the sibling packages that read files in
// tests declare it, which needs a lockfile change), so this declares only what the CSS token
// test uses: the suite runs under Node, and `import.meta.url` needs no extra helpers.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}

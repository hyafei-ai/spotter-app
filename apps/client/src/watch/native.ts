// Metro picks native.ios.ts on iOS and native.web.ts on the web; this file is what TypeScript (and Android)
// resolves: no watch.
export { watchNative } from './native.web';

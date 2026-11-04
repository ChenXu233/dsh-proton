import type { UserConfig } from 'tsdown'

export function dshPackageBuild(id: string, clientEntry: string): UserConfig[] {
  return [
    {
      entry: { index: 'src/index.ts' },
      outDir: 'lib',
      format: ['esm'],
      platform: 'node',
      target: 'es2024',
      fixedExtension: false,
      dts: false,
      clean: true,
      deps: { neverBundle: ['@deepseek-ai/cordis'] },
    },
    {
      entry: { client: clientEntry },
      outDir: 'lib',
      format: 'cjs',
      platform: 'browser',
      target: 'es2024',
      dts: false,
      clean: false,
      deps: { neverBundle: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis'] },
      define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
      outputOptions: {
        entryFileNames: 'client.js',
        banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
        footer: 'return module.exports; } });',
        intro: 'var module = { exports: {} }; var exports = module.exports;',
      },
    },
  ]
}

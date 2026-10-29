import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  platform: 'node',
  target: 'es2018',
  sourcemap: process.argv[2] === 'production' ? false : 'inline',
  outfile: 'main.js',
  logLevel: 'info',
});

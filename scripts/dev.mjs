// Minimal dev launcher: build everything once, then start Electron pointing at
// the built renderer. For a tighter inner loop run `npm --workspace apps/renderer
// run watch` in a second terminal; Electron reloads on relaunch.
import { spawnSync } from 'node:child_process';

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

run('npm', ['run', 'build:core']);
run('npm', ['run', 'build:renderer']);
run('npx', ['electron', 'apps/main/dist/main.js']);

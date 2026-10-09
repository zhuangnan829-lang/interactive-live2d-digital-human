import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const required = [
  'public/Core/live2dcubismcore.js',
  'public/Resources/haru_greeter_t05/haru_greeter_t05.model3.json',
  'public/Resources/haru_greeter_t05/haru_greeter_t05.moc3',
  'public/Resources/haru_greeter_t05/haru_greeter_t05.physics3.json',
  'public/Resources/haru_greeter_t05/haru_greeter_t05.pose3.json',
  'public/Resources/haru_greeter_t05/haru_greeter_t05.1024/texture_00.rgba.gz',
  'public/Resources/haru_greeter_t05/haru_greeter_t05.1024/texture_01.rgba.gz',
  'public/Resources/haru_greeter_t05/motion/haru_g_idle.motion3.json',
  ...Array.from({ length: 26 }, (_, index) =>
    `public/Resources/haru_greeter_t05/motion/haru_g_m${String(index + 1).padStart(2, '0')}.motion3.json`
  ),
];

const checksums = {};
for (const relative of required) {
  const absolute = path.resolve(relative);
  await access(absolute);
  const data = await readFile(absolute);
  checksums[relative] = createHash('sha256').update(data).digest('hex');
}

console.log(JSON.stringify({ verified: required.length, sha256: checksums }, null, 2));

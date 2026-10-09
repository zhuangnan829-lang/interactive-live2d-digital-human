import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import sharp from 'sharp';

const modelRoot = path.resolve('public/Resources/haru_greeter_t05');
const sourceRoot = path.join(modelRoot, 'haru_greeter_t05.2048');
const outputRoot = path.join(modelRoot, 'haru_greeter_t05.1024');
const modelJsonPath = path.join(modelRoot, 'haru_greeter_t05.model3.json');

await mkdir(outputRoot, { recursive: true });

for (let index = 0; index < 2; index++) {
  const name = `texture_0${index}`;
  const source = path.join(sourceRoot, `${name}.png`);
  const pngTarget = path.join(outputRoot, `${name}.png`);
  const rawTarget = path.join(outputRoot, `${name}.rgba.gz`);
  const pipeline = sharp(source).resize(1024, 1024, { fit: 'fill' }).ensureAlpha();
  await pipeline.clone().png({ compressionLevel: 9 }).toFile(pngTarget);
  const { data, info } = await pipeline.clone().raw().toBuffer({ resolveWithObject: true });
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    data[offset] = Math.round(data[offset] * alpha);
    data[offset + 1] = Math.round(data[offset + 1] * alpha);
    data[offset + 2] = Math.round(data[offset + 2] * alpha);
  }
  const header = Buffer.alloc(8);
  header.writeUInt32LE(info.width, 0);
  header.writeUInt32LE(info.height, 4);
  await writeFile(rawTarget, gzipSync(Buffer.concat([header, data]), { level: 9 }));
}

const modelJson = JSON.parse(await readFile(modelJsonPath, 'utf8'));
modelJson.FileReferences.Textures = [
  'haru_greeter_t05.1024/texture_00.rgba.gz',
  'haru_greeter_t05.1024/texture_01.rgba.gz',
];
await writeFile(modelJsonPath, `${JSON.stringify(modelJson, null, 2)}\n`, 'utf8');
console.log('Prepared two 1024px premultiplied RGBA textures and updated model3.json.');

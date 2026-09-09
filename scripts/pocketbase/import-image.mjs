import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const policyDirectory = fileURLToPath(new URL('../../docker/imagemagick/', import.meta.url));
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

// Word can store any format under .image. Trust the bytes, never the filename.
export function browserImageMime(bytes) {
  if (bytes.subarray(0, 8).equals(PNG)) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return '';
}

export async function importImage(bytes, filename) {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error(`Image ${filename} is empty or exceeds 20 MB.`);
  const mime = browserImageMime(bytes);
  // Keep animation, transparency and original quality for browser formats.
  if (mime) return `data:${mime};base64,${bytes.toString('base64')}`;

  const text = bytes.toString('utf8');
  const svg = /<svg[\s>]/i.test(text);
  if (svg && /<!DOCTYPE|<!ENTITY|\b(?:href|src)\s*=\s*["']\s*(?!#)|url\s*\(\s*(?!#)/i.test(text)) {
    throw new Error(`Image ${filename} contains external SVG resources. Embed a self-contained image.`);
  }
  // Some decoders need a hint when input has no suffix. Derive it from headers.
  const icon = bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && [1, 2].includes(bytes.readUInt16LE(2)) && bytes.readUInt16LE(4) > 0;
  const tga = bytes.length >= 18 && [0, 1].includes(bytes[1]) && [1, 2, 3, 9, 10, 11].includes(bytes[2])
    && bytes.readUInt16LE(12) > 0 && bytes.readUInt16LE(14) > 0 && [8, 16, 24, 32].includes(bytes[16]);
  const input = svg ? 'RSVG:-[0]' : icon ? 'ICO:-[0]' : tga ? 'TGA:-[0]' : '-[0]';
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'newsletter-image-'));
  let png;
  try {
    png = await new Promise((resolve, reject) => {
      const converter = execFile('magick', [input, '-auto-orient', '-strip', 'png:-'], {
        encoding: 'buffer', timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, MAGICK_CONFIGURE_PATH: policyDirectory, MAGICK_TEMPORARY_PATH: temporaryDirectory },
        windowsHide: true,
      }, (error, stdout) => {
        if (error) reject(new Error(error.code === 'ENOENT'
          ? `Image ${filename} needs conversion. Install ImageMagick on the server.`
          : `Image ${filename} could not be decoded or exceeds conversion limits. Re-save this image in Word as PNG, JPEG or GIF.`));
        else if (!stdout.subarray(0, 8).equals(PNG)) reject(new Error(`Image ${filename} could not be converted to PNG.`));
        else resolve(stdout);
      });
      // A decoder can exit before consuming its input; its exit reports the error.
      converter.stdin.on('error', () => {});
      converter.stdin.end(bytes);
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  return `data:image/png;base64,${png.toString('base64')}`;
}

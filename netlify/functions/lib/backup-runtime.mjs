import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';

// Solo extrae nuestro paquete de herramientas; no se usa para archivos del usuario.
export async function unpackRuntime(archive) {
  const root = path.join(os.tmpdir(), 'vortex-pg-runtime-v1');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const data = gunzipSync(await readFile(archive));
  for (let offset = 0; offset + 512 <= data.length;) {
    const header = data.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156]);
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Ruta de herramientas inválida');
    if (type === '5') await mkdir(target, { recursive: true, mode: 0o700 });
    else if (type === '0' || header[156] === 0) {
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, data.subarray(offset + 512, offset + 512 + size), { mode: 0o700 });
      await chmod(target, 0o700);
    } else throw new Error('Tipo de archivo de herramientas no permitido');
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  // Wrappers ejecutan cada binario con las bibliotecas exactas del paquete.
  for (const name of ['pg_dump', 'pg_restore', 'psql', 'tar']) {
    const wrapper = path.join(root, name);
    await writeFile(wrapper, `#!/bin/sh\nexec "${root}/lib/ld-linux-x86-64.so.2" --library-path "${root}/lib" "${root}/bin/${name}" "$@"\n`, { mode: 0o700 });
    await chmod(wrapper, 0o700);
  }
  return root;
}

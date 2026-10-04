import {readFileSync, lstatSync, realpathSync} from 'node:fs';
import {resolve, sep} from 'node:path';
import {createHash} from 'node:crypto';

export function sourceAssets(records, root) {
  const files=new Map(), realRoot=realpathSync(root)+sep;
  for(const record of records)for(const material of record.materials || []){
    const image=material.image;
    if(!image)continue;
    if(!/^assets\/img\/[a-z0-9-]+\.jpg$/.test(image.asset || '') || image.path
      || image.required!==true || image.mimeType!=='image/jpeg'
      || !/^[a-f0-9]{64}$/.test(image.sha256 || ''))throw Error(`Invalid source image: ${record.id}/${material.key}`);
    const path=resolve(root,image.asset);
    if(lstatSync(path).isSymbolicLink() || !realpathSync(path).startsWith(realRoot))throw Error('Source image escapes repository');
    const bytes=readFileSync(path);
    if(!bytes.length || bytes.length>5_000_000 || bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255
      || createHash('sha256').update(bytes).digest('hex')!==image.sha256)throw Error(`Source image hash mismatch: ${image.asset}`);
    if(files.has(image.asset)&&files.get(image.asset)!==image.sha256)throw Error('Conflicting source image digest');
    files.set(image.asset,image.sha256);
  }
  return [...files.keys()];
}

import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

// The page loads this catalog plus one year's part instead of data/all.json. contentVersion stays the
// SHA-256 of the exact data/all.json bytes, which is what every learning capture sends as resourceVersion.
export const CATALOG_SCHEMA='gk-content-catalog-v1';
export const CATALOG_PATH='data/catalog.json';
export const PART_PATH=/^data\/parts\/\d+\.[a-f0-9]{16}\.json$/;
// Each published version also has an immutable catalog the shared client reads by version.
export const CATALOGS_DIR='data/catalogs';
// Tracked copies of earlier versions that consumer caches still bind: <hex>/catalog.json, parts/<year>.<hash16>.json.
export const ARCHIVE_DIR='data/published-archive';
const VERSION=/^sha256:([a-f0-9]{64})$/;
export function versionedCatalogPath(contentVersion){
  const match=VERSION.exec(contentVersion);
  if(!match)throw Error(`Invalid content version: ${contentVersion}`);
  return `${CATALOGS_DIR}/${match[1]}.json`;
}
const sha256=value=>createHash('sha256').update(value).digest('hex');
export const corpusText=records=>JSON.stringify(records,null,2)+'\n';
// Same response units buildYearExam() counts: legacy wrong-year aliases are not part of a year collection.
const yearQuestionCount=r=>(r.questions?.length ? r.questions : [{qIndex:1}]).filter(q=>!q.sourceIdentity).length;

export function buildContentCatalog(records){
  const corpus=corpusText(records),years=[...new Set(records.map(r=>r.year))];
  if(!years.every(Number.isInteger))throw Error('Every record needs an integer year');
  const parts=years.map(year=>{
    const body=JSON.stringify(records.filter(r=>r.year===year)),digest=sha256(body);
    return {year,path:`data/parts/${year}.${digest.slice(0,16)}.json`,sha256:digest,bytes:Buffer.byteLength(body),records:records.filter(r=>r.year===year).length,body};
  });
  const partOf=new Map(parts.map((p,i)=>[p.year,i]));
  const catalog={schemaVersion:CATALOG_SCHEMA,contentVersion:`sha256:${sha256(corpus)}`,
    corpus:{path:'data/all.json',bytes:Buffer.byteLength(corpus)},
    records:records.map(r=>({id:r.id,year:r.year,key:r.key,typeLabel:r.typeLabel,topic:r.topic||'',
      ...(r.legacy_progress_key===undefined ? {} : {legacy_progress_key:r.legacy_progress_key}),
      paperComplete:r.source_evidence?.paper_complete===true,questionCount:yearQuestionCount(r),part:partOf.get(r.year)})),
    parts:parts.map(({body,...part})=>part)};
  const catalogText=JSON.stringify(catalog);
  const files=new Map([['data/all.json',corpus],[CATALOG_PATH,catalogText],[versionedCatalogPath(catalog.contentVersion),catalogText],...parts.map(p=>[p.path,p.body])]);
  verifyContentCatalog(files);
  return files;
}

const fileText=(files,path)=>{const value=files.get(path);if(typeof value!=='string')throw Error(`Missing content file: ${path}`);return value;};

// Fails closed unless catalog + parts reassemble to the byte-identical corpus the version names.
export function verifyContentCatalog(files){
  const text=path=>fileText(files,path);
  const corpus=text('data/all.json'),catalogText=text(CATALOG_PATH),catalog=JSON.parse(catalogText);
  if(catalog.schemaVersion!==CATALOG_SCHEMA || catalog.contentVersion!==`sha256:${sha256(corpus)}`
    || catalog.corpus?.path!=='data/all.json' || catalog.corpus.bytes!==Buffer.byteLength(corpus))throw Error('Catalog does not name the published corpus');
  if(reassembleCorpus(catalog,files)!==corpus)throw Error('Catalog parts do not reassemble the corpus');
  if(files.get(versionedCatalogPath(catalog.contentVersion))!==catalogText)throw Error('The versioned catalog differs from data/catalog.json');
  return catalog;
}

// The corpus text a catalog and its parts describe. Throws on any part or entry that does not verify.
function reassembleCorpus(catalog,files){
  const text=path=>fileText(files,path);
  if(!Array.isArray(catalog.parts) || !Array.isArray(catalog.records))throw Error('Catalog has no parts or records');
  const loaded=catalog.parts.map(part=>{
    const body=text(part.path),records=JSON.parse(body);
    if(!PART_PATH.test(part.path) || part.sha256!==sha256(body) || !part.path.includes(`/${part.year}.${part.sha256.slice(0,16)}.`)
      || part.bytes!==Buffer.byteLength(body) || part.records!==records.length || records.some(r=>r.year!==part.year))throw Error(`Invalid content part: ${part.path}`);
    return records;
  });
  const cursor=loaded.map(()=>0),rebuilt=catalog.records.map(entry=>{
    const record=loaded[entry.part]?.[cursor[entry.part]++];
    const expected={id:record?.id,year:record?.year,key:record?.key,typeLabel:record?.typeLabel,topic:record?.topic||'',
      ...(record?.legacy_progress_key===undefined ? {} : {legacy_progress_key:record.legacy_progress_key}),
      paperComplete:record?.source_evidence?.paper_complete===true,questionCount:record ? yearQuestionCount(record) : NaN,part:entry.part};
    if(!record || JSON.stringify(entry)!==JSON.stringify(expected))throw Error(`Catalog entry does not match its part: ${entry.id}`);
    return record;
  });
  if(cursor.some((n,i)=>n!==loaded[i].length))throw Error('Catalog parts do not reassemble the corpus');
  return corpusText(rebuilt);
}

// Reads the tracked archive. Anything other than the documented layout fails the build.
export function readPublishedArchive(dir){
  const catalogs=new Map(),parts=new Map();
  const read=path=>{
    const bytes=readFileSync(path),value=bytes.toString('utf8');
    if(!Buffer.from(value,'utf8').equals(bytes))throw Error(`Archive file is not UTF-8: ${path}`);
    return value;
  };
  if(!existsSync(dir))return {catalogs,parts};
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    if(entry.isDirectory() && entry.name==='parts'){
      for(const part of readdirSync(join(dir,'parts'),{withFileTypes:true})){
        const path=`data/parts/${part.name}`;
        if(!part.isFile() || !PART_PATH.test(path))throw Error(`Unexpected archive file: parts/${part.name}`);
        parts.set(path,read(join(dir,'parts',part.name)));
      }
    }else if(entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name)){
      const names=readdirSync(join(dir,entry.name));
      if(names.length!==1 || names[0]!=='catalog.json')throw Error(`Archive version ${entry.name} must hold only catalog.json`);
      catalogs.set(`sha256:${entry.name}`,read(join(dir,entry.name,'catalog.json')));
    }else throw Error(`Unexpected archive entry: ${entry.name}`);
  }
  return {catalogs,parts};
}

// Files to publish for archived versions: their catalogs and any part the current build does not
// generate. A part name the build generates must carry identical bytes. Every published version
// must be pinned and every pinned version must verify (see verifyPublishedVersions).
export function archivedVersionFiles(content,archive,pinned){
  const current=verifyContentCatalog(content),extra=new Map();
  for(const [version,text] of archive.catalogs){
    if(version===current.contentVersion)throw Error(`Archived version is the current build: ${version}`);
    extra.set(versionedCatalogPath(version),text);
  }
  const used=new Set([...archive.catalogs.values()].flatMap(text=>{
    const parts=JSON.parse(text).parts;
    return Array.isArray(parts) ? parts.map(part=>part?.path) : [];
  }));
  for(const [path,body] of archive.parts){
    if(!used.has(path))throw Error(`Archived part is not used by an archived catalog: ${path}`);
    if(content.has(path) && content.get(path)!==body)throw Error(`Archived part differs from the generated file: ${path}`);
    if(!path.endsWith(`.${sha256(body).slice(0,16)}.json`))throw Error(`Archived part bytes do not match its name: ${path}`);
    if(!content.has(path))extra.set(path,body);
  }
  verifyPublishedVersions(new Map([...content,...extra]),pinned);
  return extra;
}

// Every pinned version has a catalog whose SHA-256 is the pin, names that version, and whose parts are
// present with the declared sha/bytes/records and reassemble the corpus the version is the hash of.
// A versioned catalog that is not pinned is refused: no client could verify it.
export function verifyPublishedVersions(files,pinned){
  const expected=new Set();
  for(const [version,catalogSha] of Object.entries(pinned)){
    const path=versionedCatalogPath(version),text=files.get(path);
    expected.add(path);
    if(typeof text!=='string')throw Error(`Pinned version has no published catalog: ${version}`);
    if(sha256(text)!==catalogSha)throw Error(`${path} has SHA-256 ${sha256(text)}; the shared client pins ${catalogSha}`);
    const catalog=JSON.parse(text),corpus=catalog.schemaVersion===CATALOG_SCHEMA && catalog.contentVersion===version
      && catalog.corpus?.path==='data/all.json' ? reassembleCorpus(catalog,files) : null;
    if(corpus===null || `sha256:${sha256(corpus)}`!==version || catalog.corpus.bytes!==Buffer.byteLength(corpus))
      throw Error(`Published catalog does not reassemble version ${version}`);
  }
  for(const path of files.keys())if(path.startsWith(`${CATALOGS_DIR}/`) && !expected.has(path))
    throw Error(`${path} (catalog SHA-256 ${sha256(files.get(path))}) is not pinned by the shared client`);
}

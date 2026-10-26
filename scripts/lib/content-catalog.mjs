import {createHash} from 'node:crypto';

// The page loads this catalog plus one year's part instead of data/all.json. contentVersion stays the
// SHA-256 of the exact data/all.json bytes, which is what every learning capture sends as resourceVersion.
export const CATALOG_SCHEMA='gk-content-catalog-v1';
export const CATALOG_PATH='data/catalog.json';
export const PART_PATH=/^data\/parts\/\d+\.[a-f0-9]{16}\.json$/;
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
  const files=new Map([['data/all.json',corpus],[CATALOG_PATH,JSON.stringify(catalog)],...parts.map(p=>[p.path,p.body])]);
  verifyContentCatalog(files);
  return files;
}

// Fails closed unless catalog + parts reassemble to the byte-identical corpus the version names.
export function verifyContentCatalog(files){
  const text=path=>{const value=files.get(path);if(typeof value!=='string')throw Error(`Missing content file: ${path}`);return value;};
  const corpus=text('data/all.json'),catalog=JSON.parse(text(CATALOG_PATH));
  if(catalog.schemaVersion!==CATALOG_SCHEMA || catalog.contentVersion!==`sha256:${sha256(corpus)}`
    || catalog.corpus?.path!=='data/all.json' || catalog.corpus.bytes!==Buffer.byteLength(corpus))throw Error('Catalog does not name the published corpus');
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
  if(cursor.some((n,i)=>n!==loaded[i].length) || corpusText(rebuilt)!==corpus)throw Error('Catalog parts do not reassemble the corpus');
  return catalog;
}

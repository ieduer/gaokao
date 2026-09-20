// Single-character simp <-> trad conversion using OpenCC dictionaries.
// Many-to-one for trad->simp, one-to-many for simp->trad (we take the first variant).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDict(file) {
  const map = new Map();
  const text = readFileSync(resolve(__dirname, "..", "data", file), "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [k, v] = line.split("\t");
    if (!k || !v) continue;
    const variants = v.trim().split(/\s+/);
    map.set(k, variants[0]);
  }
  return map;
}

const S2T = loadDict("STCharacters.txt");
const T2S = loadDict("TSCharacters.txt");

export function s2t(s) {
  let out = "";
  for (const ch of String(s)) out += S2T.get(ch) || ch;
  return out;
}

export function t2s(s) {
  let out = "";
  for (const ch of String(s)) out += T2S.get(ch) || ch;
  return out;
}

export function variants(s) {
  // Return the original plus its s2t and t2s variants, deduped.
  const set = new Set([s, s2t(s), t2s(s)]);
  return [...set];
}

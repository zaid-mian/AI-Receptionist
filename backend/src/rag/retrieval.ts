import { DatabaseSync } from "node:sqlite";

export interface RetrievedChunk {
  chunk_id: string;
  doc_id: string;
  title: string;
  section: string;
  content: string;
  snippet: string;
  score: number; // Fused RRF score (higher is better)
}

const STOP = new Set(
  "a,an,the,and,or,but,of,to,in,on,for,with,at,by,from,is,are,was,were,be,been,do,does,did,what,when,where,which,who,how,why,can,could,would,should,i,you,we,they,it,this,that,these,those,my,your,our,their,me,him,her,us,them,have,has,had,having,not,no,yes,please,thanks,thank,hi,hello,hey,there".split(",")
);

/**
 * Healthcare and bilingual (Urdu + English) query synonyms
 * for clinical specialties, hospital departments, and common patient inquiries.
 */
const SYNONYMS: Record<string, string[]> = {
  // Clinical specialties & symptoms
  heart: ["cardiology", "cardiologist", "chest", "angina"],
  dil: ["cardiology", "cardiologist", "heart", "chest"],
  skin: ["dermatology", "dermatologist", "acne", "rash"],
  jild: ["dermatology", "dermatologist", "skin"],
  child: ["pediatrics", "pediatrician", "children", "baby", "neonatal", "nursery"],
  children: ["pediatrics", "pediatrician", "child", "baby"],
  bacha: ["pediatrics", "pediatrician", "child", "children"],
  bachon: ["pediatrics", "pediatrician", "child", "children"],
  bachay: ["pediatrics", "pediatrician", "child", "children"],
  bone: ["orthopedic", "orthopedics", "fracture", "joint", "spine"],
  bones: ["orthopedic", "orthopedics", "fracture", "joint"],
  haddi: ["orthopedic", "orthopedics", "bone", "fracture"],
  haddian: ["orthopedic", "orthopedics", "bone"],
  kidney: ["urology", "urologist", "urine", "bladder", "stone"],
  gurda: ["urology", "urologist", "kidney", "stone"],
  gurday: ["urology", "urologist", "kidney", "stone"],
  peshab: ["urology", "urologist", "kidney", "urine"],
  pregnancy: ["gynecology", "obstetrics", "gynecologist", "maternity", "delivery"],
  pregnant: ["gynecology", "obstetrics", "gynecologist", "maternity", "delivery"],
  hamal: ["gynecology", "obstetrics", "gynecologist", "pregnancy"],
  delivery: ["gynecology", "obstetrics", "labor", "maternity"],
  aurat: ["gynecology", "obstetrics", "women"],
  khawateen: ["gynecology", "obstetrics", "women"],
  surgery: ["surgical", "operation", "surgeon", "laparoscopic"],
  operation: ["surgery", "surgical", "surgeon", "operating"],
  brain: ["neurology", "neurosurgery", "neurologist", "stroke", "spine"],
  dimagh: ["neurology", "neurosurgery", "brain", "neurologist"],
  falij: ["neurology", "stroke", "paralysis"],
  lungs: ["pulmonology", "pulmonologist", "chest", "asthma", "breathing"],
  saans: ["pulmonology", "pulmonologist", "breathing", "asthma", "chest"],
  khansi: ["pulmonology", "chest", "cough"],
  chest: ["pulmonology", "cardiology", "lungs", "heart"],
  sugar: ["diabetes", "diabetic", "endocrinology", "medicine"],
  diabetic: ["sugar", "diabetes", "endocrinology", "medicine"],

  // Hospital operations & queries
  fee: ["charges", "consultation", "price", "pkr", "rate"],
  fees: ["charges", "consultation", "price", "pkr", "rate"],
  charges: ["fees", "consultation", "price", "pkr", "rate"],
  pese: ["fees", "charges", "consultation", "pkr"],
  price: ["fees", "charges", "consultation", "pkr"],
  time: ["hours", "timings", "schedule", "visiting", "open"],
  timing: ["hours", "timings", "schedule", "visiting", "open"],
  timings: ["hours", "timing", "schedule", "visiting", "open"],
  hours: ["timings", "timing", "schedule", "visiting", "open"],
  waqt: ["hours", "timings", "schedule", "time"],
  visiting: ["hours", "attendant", "visitor", "schedule", "inpatient"],
  emergency: ["casualty", "urgent", "24/7", "trauma", "ambulance"],
  hadsa: ["emergency", "casualty", "urgent", "trauma"],
  casualty: ["emergency", "urgent", "24/7", "trauma"],
  wheelchair: ["porter", "assistance", "ramp", "entrance", "accessibility"],
  insurance: ["panel", "sehat", "card", "billing", "claim"],
  sehat: ["insurance", "panel", "card", "sahulat"],
  panel: ["insurance", "sehat", "corporate", "claim"],
  appointment: ["booking", "consultation", "token", "schedule", "opd"],
  cancel: ["cancellation", "reschedule", "refund"],
  lab: ["laboratory", "test", "blood", "pathology", "reports"],
  blood: ["lab", "laboratory", "bank", "test"],
  xray: ["radiology", "ultrasound", "scan", "ct", "imaging"],
  ultrasound: ["radiology", "scan", "xray", "imaging"],
  pharmacy: ["medicine", "medicines", "dawaii", "chemist", "drugs"],
  medicine: ["pharmacy", "medicines", "dawaii", "prescription"],
  dawaii: ["pharmacy", "medicine", "medicines", "prescription"],
  address: ["location", "directions", "canal", "road", "abdullahpur", "building"],
  location: ["address", "directions", "canal", "road", "abdullahpur", "building"],
  rasta: ["address", "location", "directions", "canal", "road"],
};

/**
 * Builds a sanitized FTS5 match query with domain-specific synonym expansion.
 */
export function buildMatchQuery(text: string): { ftsQuery: string; expandedTerms: string[] } {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w));

  const uniqWords = [...new Set(words)];
  if (uniqWords.length === 0) return { ftsQuery: "", expandedTerms: [] };

  const allTerms = new Set<string>();
  for (const w of uniqWords) {
    allTerms.add(w);
    const syns = SYNONYMS[w];
    if (syns) {
      for (const s of syns) allTerms.add(s);
    }
  }

  const termsList = [...allTerms].slice(0, 16);
  // Match terms with prefix wildcard for morphological variations
  const ftsQuery = termsList.map((w) => `"${w.replace(/"/g, '""')}"*`).join(" OR ");
  return { ftsQuery, expandedTerms: termsList };
}

export interface SearchOptions {
  limit?: number;
  /** Minimum bar: chunk must match at least this many query terms. */
  minTermMatches?: number;
}

/**
 * Hybrid retrieval engine combining weighted FTS5 BM25 ranking,
 * semantic keyword intersection, and Reciprocal Rank Fusion (RRF).
 */
export function searchKnowledge(
  db: DatabaseSync,
  query: string,
  opts: SearchOptions = {}
): RetrievedChunk[] {
  const limit = opts.limit ?? 5;
  const { ftsQuery, expandedTerms } = buildMatchQuery(query);
  if (!ftsQuery) return [];

  // 1. Column-weighted FTS5 BM25 retrieval (Title weight 5.0, Section weight 4.0, Content weight 1.0)
  const candidates = db.prepare(
    `SELECT chunk_id, doc_id, title, section, content,
            snippet(kb_chunks_fts, 4, '<b>', '</b>', '…', 24) AS snippet,
            bm25(kb_chunks_fts, 0.0, 0.0, 5.0, 4.0, 1.0) AS bm25_score
     FROM kb_chunks_fts
     WHERE kb_chunks_fts MATCH ?
     ORDER BY bm25_score ASC
     LIMIT ?`
  ).all(ftsQuery, limit * 4) as Array<{
    chunk_id: string;
    doc_id: string;
    title: string;
    section: string;
    content: string;
    snippet: string;
    bm25_score: number;
  }>;

  if (candidates.length === 0) return [];

  // Filter out chunks that do not meet minTermMatches
  const minMatches = opts.minTermMatches ?? 1;
  const validCandidates = candidates.filter((c) => {
    const hay = (c.title + " " + c.section + " " + c.content).toLowerCase();
    const hits = expandedTerms.filter((t) => hay.includes(t)).length;
    return hits >= minMatches;
  });

  if (validCandidates.length === 0) return [];

  // 2. BM25 rank assignment (lower score is better in FTS5 BM25)
  const bm25Ranked = [...validCandidates].sort((a, b) => a.bm25_score - b.bm25_score);

  // 3. Semantic keyword overlap & section alignment ranking
  const userClean = query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const scored = validCandidates.map((c) => {
    const textLower = (c.title + " " + c.section + " " + c.content).toLowerCase();
    const sectionLower = c.section.toLowerCase();
    const titleLower = c.title.toLowerCase();

    let hits = 0;
    let sectionHits = 0;
    for (const t of expandedTerms) {
      if (textLower.includes(t)) hits++;
      if (sectionLower.includes(t) || titleLower.includes(t)) sectionHits++;
    }

    const termRatio = expandedTerms.length > 0 ? hits / expandedTerms.length : 0;
    const sectionBonus = sectionHits > 0 ? 0.35 : 0;
    const phraseBonus = userClean.length > 6 && textLower.includes(userClean) ? 0.4 : 0;
    const semanticScore = termRatio + sectionBonus + phraseBonus;

    return { ...c, semantic_score: semanticScore };
  });

  const semanticRanked = [...scored].sort((a, b) => b.semantic_score - a.semantic_score);

  // 4. Reciprocal Rank Fusion (standard k = 60)
  const k = 60;
  const rrfMap = new Map<string, number>();

  bm25Ranked.forEach((c, idx) => {
    rrfMap.set(c.chunk_id, (rrfMap.get(c.chunk_id) ?? 0) + (1.0 / (k + idx)));
  });
  semanticRanked.forEach((c, idx) => {
    rrfMap.set(c.chunk_id, (rrfMap.get(c.chunk_id) ?? 0) + (1.0 / (k + idx)));
  });

  // 5. Produce fused final ranking
  const fused: RetrievedChunk[] = scored
    .map((c) => ({
      chunk_id: c.chunk_id,
      doc_id: c.doc_id,
      title: c.title,
      section: c.section,
      content: c.content,
      snippet: c.snippet,
      score: rrfMap.get(c.chunk_id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return fused;
}

/** Distinct source list for UI "Knowledge sources used" chips. */
export function sourcesOf(chunks: RetrievedChunk[]): Array<{ doc_id: string; title: string; section: string }> {
  const seen = new Map<string, { doc_id: string; title: string; section: string }>();
  for (const c of chunks) {
    if (!seen.has(c.doc_id)) seen.set(c.doc_id, { doc_id: c.doc_id, title: c.title, section: c.section });
  }
  return [...seen.values()];
}

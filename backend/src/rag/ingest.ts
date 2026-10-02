import { DatabaseSync } from "node:sqlite";
import { chunkDocument } from "./chunker.js";
import { newId, nowIso } from "../db/database.js";

/**
 * Ingestion: document -> chunks -> FTS5 index.
 * Re-ingesting a document replaces its chunks atomically.
 */
export function ingestDocument(
  db: DatabaseSync,
  docId: string,
  title: string,
  category: string,
  content: string
): { chunks: number } {
  const now = nowIso();
  const upsert = db.prepare(
    `INSERT INTO kb_documents (id, title, category, content, status, updated_at)
     VALUES (?, ?, ?, ?, 'indexed', ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category,
       content=excluded.content, status='indexed', updated_at=excluded.updated_at`
  );
  upsert.run(docId, title, category, content, now);

  db.prepare(`DELETE FROM kb_chunks WHERE doc_id = ?`).run(docId);
  db.prepare(`DELETE FROM kb_chunks_fts WHERE doc_id = ?`).run(docId);

  const chunks = chunkDocument(content);
  const insChunk = db.prepare(
    `INSERT INTO kb_chunks (chunk_id, doc_id, title, section, content, ord) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insFts = db.prepare(
    `INSERT INTO kb_chunks_fts (chunk_id, doc_id, title, section, content) VALUES (?, ?, ?, ?, ?)`
  );
  chunks.forEach((c, i) => {
    const cid = newId("chk");
    insChunk.run(cid, docId, title, c.section, c.content, i);
    insFts.run(cid, docId, title, c.section, c.content);
  });
  return { chunks: chunks.length };
}

export function deleteDocument(db: DatabaseSync, docId: string): void {
  db.prepare(`DELETE FROM kb_chunks_fts WHERE doc_id = ?`).run(docId);
  db.prepare(`DELETE FROM kb_chunks WHERE doc_id = ?`).run(docId);
  db.prepare(`DELETE FROM kb_documents WHERE id = ?`).run(docId);
}

/** Rebuild the whole index (used by "Refresh index"). */
export function reindexAll(db: DatabaseSync): { documents: number; chunks: number } {
  const docs = db.prepare(`SELECT id, title, category, content FROM kb_documents`).all() as Array<{
    id: string; title: string; category: string; content: string;
  }>;
  let chunks = 0;
  for (const d of docs) chunks += ingestDocument(db, d.id, d.title, d.category, d.content).chunks;
  return { documents: docs.length, chunks };
}

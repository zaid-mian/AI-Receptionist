import { Router } from "express";
import { z } from "zod";
import { getDb, newId } from "../db/database.js";
import { ingestDocument, deleteDocument, reindexAll } from "../rag/ingest.js";
import { syncKnowledgeBase } from "../rag/sync.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const knowledgeRouter = Router();

// Hospital clinical knowledge base management is restricted to Administrators
knowledgeRouter.use(requireAuth, requireRole(["admin"]));

const CATEGORIES = ["company", "services", "policies", "faq", "other"] as const;

function publicDoc(d: Record<string, unknown>, db: ReturnType<typeof getDb>) {
  const chunks = (db.prepare(`SELECT COUNT(*) AS c FROM kb_chunks WHERE doc_id = ?`).get(d.id as string) as { c: number }).c;
  return { id: d.id, title: d.title, category: d.category, status: d.status, chunks, updated_at: d.updated_at };
}

/** GET /api/v1/knowledge/documents */
knowledgeRouter.get("/documents", (_req, res) => {
  const db = getDb();
  const docs = db.prepare(`SELECT * FROM kb_documents ORDER BY updated_at DESC`).all() as Array<Record<string, unknown>>;
  res.json({ documents: docs.map((d) => publicDoc(d, db)) });
});

const docSchema = z.object({
  title: z.string().min(2).max(120),
  category: z.enum(CATEGORIES),
  content: z.string().min(20).max(60000),
});

/** POST /api/v1/knowledge/documents */
knowledgeRouter.post("/documents", (req, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "invalid_body", message: parsed.error.issues[0]?.message ?? "Invalid document." } });
  }
  const db = getDb();
  const id = newId("kb");
  db.prepare(`UPDATE kb_documents SET status = 'processing' WHERE id = ?`).run(id); // no-op; keeps flow explicit
  try {
    ingestDocument(db, id, parsed.data.title, parsed.data.category, parsed.data.content);
  } catch (e) {
    db.prepare(`INSERT INTO kb_documents (id, title, category, content, status, updated_at) VALUES (?, ?, ?, ?, 'failed', datetime('now'))`)
      .run(id, parsed.data.title, parsed.data.category, parsed.data.content);
    return res.status(500).json({ error: { code: "index_failed", message: "Indexing failed." } });
  }
  const doc = db.prepare(`SELECT * FROM kb_documents WHERE id = ?`).get(id);
  res.status(201).json({ document: publicDoc(doc as Record<string, unknown>, db) });
});

/** PUT /api/v1/knowledge/documents/:id */
knowledgeRouter.put("/documents/:id", (req, res) => {
  const parsed = docSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "invalid_body", message: "Invalid document." } });
  }
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM kb_documents WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: { code: "not_found", message: "Document not found." } });
  const title = (parsed.data.title ?? existing.title) as string;
  const category = (parsed.data.category ?? existing.category) as string;
  const content = (parsed.data.content ?? existing.content) as string;
  try {
    ingestDocument(db, req.params.id, title, category, content);
  } catch {
    db.prepare(`UPDATE kb_documents SET status = 'failed' WHERE id = ?`).run(req.params.id);
    return res.status(500).json({ error: { code: "index_failed", message: "Re-indexing failed." } });
  }
  const doc = db.prepare(`SELECT * FROM kb_documents WHERE id = ?`).get(req.params.id);
  res.json({ document: publicDoc(doc as Record<string, unknown>, db) });
});

/** DELETE /api/v1/knowledge/documents/:id */
knowledgeRouter.delete("/documents/:id", (req, res) => {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM kb_documents WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: { code: "not_found", message: "Document not found." } });
  deleteDocument(db, req.params.id);
  res.json({ ok: true });
});

/** POST /api/v1/knowledge/reindex */
knowledgeRouter.post("/reindex", (_req, res) => {
  const db = getDb();
  try {
    const r = reindexAll(db);
    res.json({ ok: true, documents: r.documents, chunks: r.chunks });
  } catch {
    res.status(500).json({ error: { code: "index_failed", message: "Re-indexing failed." } });
  }
});

/** POST /api/v1/knowledge/sync-markdown */
knowledgeRouter.post("/sync-markdown", (_req, res) => {
  const db = getDb();
  try {
    const r = syncKnowledgeBase(db);
    res.json({ ok: true, synced: r.synced, documents: r.documents, chunks: r.chunks });
  } catch (err) {
    res.status(500).json({ error: { code: "sync_failed", message: err instanceof Error ? err.message : "Sync failed." } });
  }
});

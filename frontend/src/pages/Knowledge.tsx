import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { api, isApiError } from '../api/client';
import type { DocCategory, KnowledgeDocument } from '../api/types';
import { usePageMeta } from '../layout/PageMeta';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import Spinner from '../components/Spinner';
import { SkeletonTable } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { statusBadge } from '../utils/badges';
import { formatClockTime, timeAgo } from '../utils/format';

const CATEGORIES: DocCategory[] = ['company', 'services', 'policies', 'faq', 'other'];

type CatVariant = 'info' | 'accent' | 'warning' | 'success' | 'neutral';

function categoryBadge(cat: string) {
  const v: CatVariant =
    cat === 'services'
      ? 'accent'
      : cat === 'faq'
        ? 'success'
        : cat === 'policies'
          ? 'warning'
          : cat === 'company'
            ? 'info'
            : 'neutral';
  return <Badge variant={v}>{cat}</Badge>;
}

function DocForm({
  initial,
  onSubmit,
  submitting,
  error,
}: {
  initial: { title: string; category: DocCategory; content: string };
  onSubmit: (v: { title: string; category: DocCategory; content: string }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState<DocCategory>(initial.category);
  const [content, setContent] = useState(initial.content);
  const valid = title.trim().length > 0 && content.trim().length > 0;

  return (
    <>
      <div className="field">
        <label htmlFor="doc-title">Title</label>
        <input id="doc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Services & Pricing" />
      </div>
      <div className="field">
        <label htmlFor="doc-cat">Category</label>
        <select id="doc-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value as DocCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="field-hint">Categories help the agent cite the right sources.</div>
      </div>
      <div className="field">
        <label htmlFor="doc-content">Content</label>
        <textarea
          id="doc-content"
          className="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the business information here. It will be chunked, embedded, and indexed for retrieval."
          rows={10}
        />
        <div className="field-hint tnum">{content.trim().length} characters</div>
      </div>
      {error && <div className="error-desc">{error}</div>}
      <div className="save-bar">
        <button className="btn btn-primary" disabled={!valid || submitting} onClick={() => onSubmit({ title: title.trim(), category, content: content.trim() })}>
          {submitting ? 'Saving…' : 'Save document'}
        </button>
      </div>
    </>
  );
}

export default function Knowledge() {
  usePageMeta('Knowledge Base');
  const toast = useToast();

  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<KnowledgeDocument | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeDocument | null>(null);
  const [viewing, setViewing] = useState<KnowledgeDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The API does not return document text on list/get, so we keep text the
  // user uploaded/edited this session for "View source" (see FRONTEND_NOTES).
  const [contentCache, setContentCache] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ documents: KnowledgeDocument[] }>('/knowledge/documents');
      setDocs(r.documents);
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalChunks = docs.reduce((a, d) => a + d.chunks, 0);
  const lastIndexed = docs.length
    ? docs.reduce((a, b) => (a.updated_at > b.updated_at ? a : b)).updated_at
    : null;

  const handleUpload = async (v: { title: string; category: DocCategory; content: string }) => {
    setSaving(true);
    setFormError(null);
    try {
      const r = await api.post<{ document: KnowledgeDocument }>('/knowledge/documents', v);
      setContentCache((c) => ({ ...c, [r.document.id]: v.content }));
      toast('success', `“${r.document.title}” uploaded and indexed.`);
      setShowUpload(false);
      await load();
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Upload failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (v: { title: string; category: DocCategory; content: string }) => {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    try {
      const r = await api.put<{ document: KnowledgeDocument }>(
        `/knowledge/documents/${encodeURIComponent(editing.id)}`,
        v,
      );
      setContentCache((c) => ({ ...c, [r.document.id]: v.content }));
      toast('success', `“${r.document.title}” updated and re-indexed.`);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(isApiError(err) ? err.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.del(`/knowledge/documents/${encodeURIComponent(deleting.id)}`);
      toast('success', `“${deleting.title}” deleted.`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Delete failed.');
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const r = await api.post<{ ok: boolean; documents: number; chunks: number }>('/knowledge/reindex');
      toast('success', `Index rebuilt: ${r.documents} documents, ${r.chunks} chunks.`);
      await load();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Reindex failed.');
    } finally {
      setReindexing(false);
    }
  };

  const syncMarkdown = async () => {
    setReindexing(true);
    try {
      const r = await api.post<{ ok: boolean; synced: boolean; documents: number; chunks: number }>('/knowledge/sync-markdown');
      toast('success', `Synced knowledge-base.md: ${r.documents} sections, ${r.chunks} chunks indexed.`);
      await load();
    } catch (err) {
      toast('error', isApiError(err) ? err.message : 'Sync failed.');
    } finally {
      setReindexing(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Knowledge Base</h1>
          <div className="sub">The verified hospital facts the AI is authorized to answer from. Grounded retrieval only.</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => void syncMarkdown()} disabled={reindexing} title="Sync canonical knowledge-base.md from repo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {reindexing ? <Spinner size="sm" /> : <FileText size={13} strokeWidth={2} />} Sync Markdown
          </button>
          <button className="btn btn-secondary" onClick={() => void reindex()} disabled={reindexing} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {reindexing ? <Spinner size="sm" /> : <RefreshCw size={13} strokeWidth={2} />} Refresh index
          </button>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} strokeWidth={2} /> Upload document
          </button>
        </div>
      </div>

      {loading && <SkeletonTable rows={6} cols={5} />}
      {error && !loading && (
        <div className="error-state card">
          <div className="error-icon" aria-hidden="true">
            <AlertCircle size={28} strokeWidth={1.5} />
          </div>
          <div className="error-title">Couldn&apos;t load the knowledge base</div>
          <div className="error-desc">{error}</div>
          <button className="btn btn-secondary" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="kb-stats">
            <div>
              <span className="big tnum">{docs.length}</span> <span className="lbl">Documents</span>
            </div>
            <div>
              <span className="big tnum">{totalChunks}</span> <span className="lbl">Indexed chunks</span>
            </div>
            {lastIndexed && (
              <div className="lbl">
                Last indexed {timeAgo(lastIndexed)} · {formatClockTime(lastIndexed)}
              </div>
            )}
          </div>

          {docs.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={<BookOpen size={24} strokeWidth={1.5} />}
                title="No documents yet"
                description="Upload hospital service policies, OPD timings, or clinical FAQs to index into the AI receptionist."
                action={
                  <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={13} strokeWidth={2} /> Upload document
                  </button>
                }
              />
            </div>
          ) : (
            <div className="doc-grid">
              {docs.map((d) => (
                <div key={d.id} className="card doc-card">
                  <div className="doc-top">
                    <h3>{d.title}</h3>
                    {statusBadge(d.status)}
                  </div>
                  <div className="doc-meta">
                    {categoryBadge(d.category)}
                    <span className="tnum">{d.chunks} chunks</span>
                    <span>Updated {timeAgo(d.updated_at)}</span>
                  </div>
                  <div className="doc-actions">
                    <button className="btn btn-sm btn-secondary" onClick={() => setViewing(d)}>
                      View source
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setFormError(null); setEditing(d); }}>
                      Edit
                    </button>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDeleting(d)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showUpload && (
        <Modal title="Upload document" onClose={() => setShowUpload(false)} wide>
          <DocForm
            initial={{ title: '', category: 'other', content: '' }}
            onSubmit={(v) => void handleUpload(v)}
            submitting={saving}
            error={formError}
          />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit: ${editing.title}`} onClose={() => setEditing(null)} wide>
          <DocForm
            initial={{
              title: editing.title,
              category: editing.category,
              content: contentCache[editing.id] ?? '',
            }}
            onSubmit={(v) => void handleEdit(v)}
            submitting={saving}
            error={formError}
          />
          {!contentCache[editing.id] && (
            <div className="field-hint" style={{ marginTop: 8 }}>
              Note: the API doesn&apos;t return stored document text, so the content box starts empty.
              Paste the full updated text to re-index it.
            </div>
          )}
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete document"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void confirmDelete()}>
                Yes, delete
              </button>
            </>
          }
        >
          <p style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
            Delete <strong>“{deleting.title}”</strong>? Its chunks will be removed from the index and
            the AI will no longer answer from it. This cannot be undone.
          </p>
        </Modal>
      )}

      {viewing && (
        <Modal title={viewing.title} onClose={() => setViewing(null)} wide>
          <div className="doc-meta" style={{ marginBottom: 12 }}>
            {categoryBadge(viewing.category)}
            {statusBadge(viewing.status)}
            <span className="tnum">{viewing.chunks} chunks</span>
          </div>
          {contentCache[viewing.id] ? (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit',
                fontSize: 13,
                background: '#fafbfc',
                border: '1px solid var(--border-soft)',
                borderRadius: 8,
                padding: 14,
                maxHeight: 380,
                overflowY: 'auto',
                margin: 0,
              }}
            >
              {contentCache[viewing.id]}
            </pre>
          ) : (
            <div className="card-sub">
              Full document text isn&apos;t returned by the API, so it can&apos;t be shown here for
              documents created outside this session. Use Edit to replace its content.
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

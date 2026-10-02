import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ingestDocument } from "./ingest.js";

/**
 * Synchronizes the canonical `knowledge-base.md` from the workspace root
 * into the SQLite `kb_documents`, `kb_chunks`, and `kb_chunks_fts` tables.
 */
export function syncKnowledgeBase(db: DatabaseSync, customPath?: string): {
  synced: boolean;
  documents: number;
  chunks: number;
} {
  const candidatePaths = [
    customPath,
    join(process.cwd(), "knowledge-base.md"),
    join(process.cwd(), "..", "knowledge-base.md"),
    "e:/ai-receptionisst/ai-receptionist/knowledge-base.md",
  ].filter(Boolean) as string[];

  let kbPath: string | null = null;
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      kbPath = p;
      break;
    }
  }

  if (!kbPath) {
    return { synced: false, documents: 0, chunks: 0 };
  }

  const raw = readFileSync(kbPath, "utf8");
  const sections = parseMarkdownSections(raw);

  let totalChunks = 0;
  for (const sec of sections) {
    const { chunks } = ingestDocument(db, sec.id, sec.title, sec.category, sec.content);
    totalChunks += chunks;
  }

  return { synced: true, documents: sections.length, chunks: totalChunks };
}

interface ParsedSection {
  id: string;
  title: string;
  category: "company" | "services" | "policies" | "faq" | "other";
  content: string;
}

function parseMarkdownSections(content: string): ParsedSection[] {
  const lines = content.split("\n");
  const sections: ParsedSection[] = [];
  let currentHeader = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (!currentHeader || currentLines.length === 0) return;
    const body = currentLines.join("\n").trim();
    if (!body) return;

    // e.g. "## 1. HOSPITAL IDENTITY & CONTACT"
    const match = currentHeader.match(/^##\s+(\d+)\.\s+(.*)/);
    const num = match ? match[1] : sections.length.toString();
    const rawTitle = match ? match[2] : currentHeader.replace(/^##\s+/, "");
    // Clean emojis / tags from title
    const cleanTitle = rawTitle.replace(/[✅⛔🟡]/g, "").replace(/\(.*?\)/g, "").trim();

    let category: ParsedSection["category"] = "policies";
    const n = parseInt(num, 10);
    if (n === 1 || n === 2) category = "company";
    else if (n === 3 || n === 4 || n === 9 || n === 12) category = "services";
    else if (n === 15) category = "faq";
    else category = "policies";

    const id = `kb_sec_${num.padStart(2, "0")}`;
    sections.push({
      id,
      title: cleanTitle || `Section ${num}`,
      category,
      content: `# ${cleanTitle}\n\n${body}`,
    });
  };

  for (const line of lines) {
    if (line.trim().startsWith("## ")) {
      flush();
      currentHeader = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

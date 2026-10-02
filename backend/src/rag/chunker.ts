export interface Chunk {
  section: string;
  content: string;
}

const TARGET = 700; // target characters per chunk
const OVERLAP = 120;

/**
 * Split document content into chunks along heading / paragraph boundaries.
 * Keeps each chunk small enough to fit comfortably in an LLM context window
 * (or in a prompt template) while preserving the section it came from.
 */
export function chunkDocument(content: string): Chunk[] {
  const lines = content.split("\n");
  const sections: Array<{ heading: string; body: string[] }> = [];
  let current = { heading: "Overview", body: [] as string[] };

  for (const line of lines) {
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) {
      if (current.body.join("\n").trim()) sections.push(current);
      current = { heading: h[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join("\n").trim()) sections.push(current);

  const chunks: Chunk[] = [];
  for (const s of sections) {
    const paragraphs = s.body.join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let buf = "";
    const flush = () => {
      if (buf.trim()) chunks.push({ section: s.heading, content: buf.trim() });
      buf = "";
    };
    for (const p of paragraphs) {
      if ((buf + "\n\n" + p).length > TARGET && buf) {
        flush();
        // carry a little overlap so context isn't lost at boundaries
        const tail = p.slice(-OVERLAP);
        buf = tail;
      } else {
        buf = buf ? buf + "\n\n" + p : p;
      }
    }
    flush();
  }
  return chunks.filter((c) => c.content.length > 40);
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../db/database.js";
import {
  buildMatchQuery,
  searchKnowledge,
  sourcesOf,
} from "../rag/retrieval.js";

describe("Hybrid In-Process Retrieval & Grounding (RRF + BM25)", () => {
  const db = getDb();

  it("expands bilingual Urdu clinical synonyms", () => {
    const urduQuery = "mujhe dil aur gurday ka masla hai";
    const { expandedTerms, ftsQuery } = buildMatchQuery(urduQuery);

    assert.ok(expandedTerms.includes("cardiology") || expandedTerms.includes("heart"), "Should expand 'dil' to cardiology");
    assert.ok(expandedTerms.includes("urology") || expandedTerms.includes("kidney"), "Should expand 'gurday' to urology");
    assert.ok(ftsQuery.length > 0, "FTS query string must be generated");
  });

  it("expands English colloquial terms to formal specialties", () => {
    const query = "I need skin acne treatment";
    const { expandedTerms } = buildMatchQuery(query);

    assert.ok(expandedTerms.includes("dermatology") || expandedTerms.includes("dermatologist"), "Should expand skin/acne to dermatology");
  });

  it("retrieves high-confidence grounded chunks for hospital policies", () => {
    const query = "What are the visiting hours for ICU and inpatient wards?";
    const results = searchKnowledge(db, query, { limit: 3 });

    assert.ok(results.length > 0, "Should retrieve relevant knowledge base chunks");
    const topChunk = results[0];
    assert.ok(topChunk.score > 0, "Score should be positive");
    assert.ok(
      topChunk.title.toLowerCase().includes("visiting") ||
      topChunk.content.toLowerCase().includes("visiting") ||
      topChunk.content.toLowerCase().includes("icu") ||
      topChunk.section.toLowerCase().includes("visiting"),
      "Top result must be relevant to visiting hours or ICU"
    );
  });

  it("retrieves specialist doctor information accurately via RRF fusion", () => {
    const query = "Who is the dermatologist and what is her fee?";
    const results = searchKnowledge(db, query, { limit: 5 });

    assert.ok(results.length > 0, "Should retrieve dermatologist documents");
    const combinedContent = results.map((r) => r.content).join(" ");
    assert.ok(
      combinedContent.includes("Nadia") || combinedContent.includes("Farah") || combinedContent.includes("Dermatolog"),
      "Retrieved chunks must mention Dr. Nadia Ali or Dr. Farah Khurram"
    );

    const sources = sourcesOf(results);
    assert.ok(sources.length > 0, "sourcesOf should extract citation list");
    assert.ok(sources[0].doc_id, "Source entry must have doc_id");
    assert.ok(sources[0].title, "Source entry must have title");
  });
});

/**
 * Test isolation setup.
 *
 * MUST be the first import in every test file that touches the database.
 * Gives each test file its own throwaway DATA_DIR so parallel test runners
 * never share (or race on) the same SQLite file. config.ts reads DATA_DIR
 * at module-evaluation time, so setting it here — before database.js and
 * config.js are evaluated — is what makes the isolation work.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "receptionist-test-"));

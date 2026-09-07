/**
 * `SpaCyAnalyzer` — the real `NlpAnalyzer`, spawning `analyzer.py`
 * (`./analyzer.py`) as a Python subprocess.
 *
 * §44 process safety, all of it:
 *   - no shell, no string concatenation: `child_process.spawn` with an argv
 *     array and `shell: false` (the default) — story text never becomes a
 *     shell command;
 *   - input/output only ever cross the process boundary as one JSON
 *     document each way, over stdin/stdout — never as CLI arguments;
 *   - an explicit, configurable executable path and script path, never a
 *     `$PATH`-guessed `python`/`python3` unless the caller says so;
 *   - a hard timeout, after which the subprocess is killed and the call
 *     rejects;
 *   - the exit code is checked; a non-zero exit is `ANALYZER_BRIDGE_FAILURE`,
 *     with stderr attached;
 *   - stdout is size-capped, so a runaway/misbehaving script cannot exhaust
 *     memory buffering an unbounded stream.
 *
 * This adapter never lets Python write to PostgreSQL or read/modify the
 * curriculum registry — `analyzer.py` has no code path to either; the only
 * thing that crosses this boundary is the JSON contract (`../../../
 * adapters/spacy/analyzer.py`'s own header comment is the versioned spec).
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NlpError, nlpIssue } from "../../domain/errors.ts";
import { EXPECTED_MODEL_NAME, EXPECTED_MODEL_VERSION, EXPECTED_SPACY_VERSION, assertAnalyzerVersionGoverned } from "../../domain/analyzer-config.ts";
import type { NlpAnalysis, SentenceAnalysis, TokenAnalysis } from "../../domain/analysis.ts";
import type { AnalyzerSentenceInput, NlpAnalyzer } from "../analyzer.ts";

/** Must match `BRIDGE_CONTRACT_VERSION` in `./analyzer.py`. A mismatch is refused, not coerced. */
export const BRIDGE_CONTRACT_VERSION = "1.0.0";

const DEFAULT_SCRIPT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./analyzer.py");
const DEFAULT_TIMEOUT_MS = 30_000;
/** Refuse to buffer more than this many bytes of stdout — a misbehaving script must fail loudly, not exhaust memory. */
const MAX_STDOUT_BYTES = 64 * 1024 * 1024;

export type SpaCyAnalyzerOptions = {
  /**
   * The Python executable to spawn — an absolute path, or a bare command
   * resolved via `PATH`. Defaults to the `SPANSTORIES_PYTHON` env var, then
   * `"python"`. Deliberately not `"python3"` by default: on Windows,
   * `python3` commonly resolves to a Microsoft Store stub distinct from
   * whatever environment spaCy was actually installed into (verified in
   * this environment — see `docs/nlp-annotation-assistant.md` §"Installing
   * the analyzer"), so guessing it would silently run against the wrong
   * interpreter rather than the one with the model installed.
   */
  readonly pythonExecutable?: string;
  /** Absolute path to `analyzer.py`. Defaults to the copy shipped alongside this file. */
  readonly scriptPath?: string;
  readonly modelName?: string;
  readonly timeoutMs?: number;
  /**
   * Corrección E — refuse to accept output from a spaCy/model version other
   * than `../../domain/analyzer-config.ts`'s governed pin
   * (`ANALYZER_VERSION_MISMATCH`). Defaults to `true`; the only reason to
   * disable it is a deliberate, reviewed upgrade in progress that has not
   * yet updated the governed constants.
   */
  readonly enforceGovernedVersion?: boolean;
};

type BridgeOutputToken = {
  readonly index: number;
  readonly surface: string;
  readonly start: number;
  readonly end: number;
  readonly lemma: string;
  readonly pos: string;
  readonly tag: string;
  readonly morphology: string | null;
  readonly depRelation: string;
  readonly headIndex: number;
};

type BridgeOutputSentence = {
  readonly sentenceIndex: number;
  readonly text: string;
  readonly tokens: readonly BridgeOutputToken[];
};

type BridgeOutput = {
  readonly contractVersion: string;
  readonly analyzer: string;
  readonly analyzerVersion: string;
  readonly modelName: string | null;
  readonly modelVersion: string | null;
  readonly sentences: readonly BridgeOutputSentence[];
};

function fail(reason: string): never {
  throw new NlpError([nlpIssue("ANALYZER_BRIDGE_FAILURE", reason)]);
}

export class SpaCyAnalyzer implements NlpAnalyzer {
  private readonly pythonExecutable: string;
  private readonly scriptPath: string;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly enforceGovernedVersion: boolean;

  constructor(options: SpaCyAnalyzerOptions = {}) {
    this.pythonExecutable = options.pythonExecutable ?? process.env.SPANSTORIES_PYTHON ?? "python";
    this.scriptPath = options.scriptPath ?? DEFAULT_SCRIPT_PATH;
    this.modelName = options.modelName ?? EXPECTED_MODEL_NAME;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.enforceGovernedVersion = options.enforceGovernedVersion ?? true;
  }

  async analyze(sentences: readonly AnalyzerSentenceInput[]): Promise<NlpAnalysis> {
    const input = JSON.stringify({
      contractVersion: BRIDGE_CONTRACT_VERSION,
      modelName: this.modelName,
      // Corrección E — Python reads the governed pin from this one payload
      // rather than keeping its own possibly-drifting copy of the version
      // string; see ../../domain/analyzer-config.ts.
      expectedSpacyVersion: this.enforceGovernedVersion ? EXPECTED_SPACY_VERSION : null,
      expectedModelVersion: this.enforceGovernedVersion ? EXPECTED_MODEL_VERSION : null,
      sentences,
    });

    const raw = await this.runSubprocess(input);

    let parsed: BridgeOutput;
    try {
      parsed = JSON.parse(raw) as BridgeOutput;
    } catch (error) {
      fail(`analyzer produced invalid JSON on stdout: ${(error as Error).message}`);
    }

    if (parsed.contractVersion !== BRIDGE_CONTRACT_VERSION) {
      fail(`bridge contract version mismatch: expected ${BRIDGE_CONTRACT_VERSION}, got ${parsed.contractVersion}`);
    }

    // Corrección E §31 — a second, independent check on the Node side: never
    // trust that Python's own check (analyzer.py, same governed constants
    // passed above) ran or was honest about it.
    if (this.enforceGovernedVersion) {
      assertAnalyzerVersionGoverned({ analyzerVersion: parsed.analyzerVersion, modelName: parsed.modelName, modelVersion: parsed.modelVersion });
    }

    const resolvedSentences: SentenceAnalysis[] = parsed.sentences.map((s) => ({
      sentenceIndex: s.sentenceIndex,
      text: s.text,
      tokens: s.tokens.map(
        (t): TokenAnalysis => ({
          index: t.index,
          surface: t.surface,
          start: t.start,
          end: t.end,
          lemma: t.lemma,
          pos: t.pos,
          tag: t.tag,
          morphology: t.morphology,
          depRelation: t.depRelation,
          headIndex: t.headIndex,
        }),
      ),
    }));

    return {
      sentences: resolvedSentences,
      provenance: {
        analyzer: parsed.analyzer,
        analyzerVersion: parsed.analyzerVersion,
        modelName: parsed.modelName,
        modelVersion: parsed.modelVersion,
        algorithmVersion: BRIDGE_CONTRACT_VERSION,
        createdAt: new Date().toISOString(),
      },
    };
  }

  private runSubprocess(input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonExecutable, [this.scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });

      let stdout = "";
      let stdoutBytes = 0;
      let stderr = "";
      let settled = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, this.timeoutMs);

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > MAX_STDOUT_BYTES) {
          finish(() => reject(new NlpError([nlpIssue("ANALYZER_BRIDGE_FAILURE", `analyzer stdout exceeded ${MAX_STDOUT_BYTES} bytes`)])));
          child.kill("SIGKILL");
          return;
        }
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        finish(() => reject(new NlpError([nlpIssue("ANALYZER_BRIDGE_FAILURE", `failed to spawn analyzer subprocess: ${error.message}`)])));
      });

      child.on("close", (code) => {
        finish(() => {
          if (timedOut) {
            reject(new NlpError([nlpIssue("ANALYZER_BRIDGE_FAILURE", `analyzer subprocess timed out after ${this.timeoutMs}ms`)]));
            return;
          }
          if (code !== 0) {
            reject(new NlpError([nlpIssue("ANALYZER_BRIDGE_FAILURE", `analyzer subprocess exited ${code}: ${stderr.trim() || "(no stderr)"}`)]));
            return;
          }
          resolve(stdout);
        });
      });

      child.stdin.write(input, "utf8");
      child.stdin.end();
    });
  }
}

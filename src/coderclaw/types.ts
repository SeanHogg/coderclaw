/**
 * Type definitions for coderClaw project-specific context
 */

export type ProjectContext = {
  version: number;
  projectName: string;
  description?: string;
  rootPath: string;
  languages: string[];
  frameworks: string[];
  architecture: {
    style: string;
    layers: string[];
    patterns: string[];
  };
  buildSystem?: string;
  testFramework?: string;
  lintingTools: string[];
  dependencies: {
    production: Record<string, string>;
    development: Record<string, string>;
  };
  customRules: string[];
  metadata?: Record<string, unknown>;
  llm?: {
    provider: string;
    model: string;
  };
  clawLink?: {
    /** Numeric claw ID returned by POST /api/claws */
    instanceId: string;
    /** URL-safe slug returned by POST /api/claws */
    instanceSlug?: string;
    /** Human-readable name for this project's claw instance */
    instanceName?: string;
    /** Linked project id in coderClawLink */
    projectId?: string;
    /** Tenant this claw belongs to */
    tenantId?: number;
    /** CoderClawLink server URL */
    url?: string;
  };
};

/**
 * Persona definition for an agent role — shapes tone, perspective, and decision style.
 * Injected into the system prompt prefix so every spawned sub-agent has a consistent identity.
 */
export type AgentPersona = {
  /** How the agent communicates, e.g. "methodical and detail-oriented" */
  voice: string;
  /** The lens through which the agent evaluates all inputs, e.g. "views code through a security lens" */
  perspective: string;
  /** How the agent makes trade-off decisions, e.g. "conservative: prefer proven patterns" */
  decisionStyle: string;
};

/**
 * Output format contract for an agent role.
 * Tells downstream agents and the orchestrator how to parse this role's output.
 */
export type AgentOutputFormat = {
  /** Preferred output structure */
  structure: "markdown" | "json" | "structured-text";
  /** Section headings the agent should always include (in order) */
  requiredSections?: string[];
  /** Short label prepended to handoff summaries, e.g. "REVIEW:" */
  outputPrefix?: string;
};

/**
 * Structured handoff block passed from one agent to the next in a workflow.
 * Replaces plain-text result concatenation with a typed context object.
 */
export type TaskHandoff = {
  workflowId: string;
  taskId: string;
  fromRole: string;
  /** One-paragraph summary of what was produced */
  summary: string;
  /** Specific findings, decisions, or recommendations for the next agent */
  keyFindings: string[];
  /** Files, functions, or other artifacts produced or modified */
  artifacts: string[];
  /** ISO timestamp when this handoff was created */
  timestamp: string;
};

export type AgentRole = {
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  systemPrompt?: string;
  /** Optional persona definition injected into the system prompt */
  persona?: AgentPersona;
  /** Optional output contract so downstream agents know how to interpret results */
  outputFormat?: AgentOutputFormat;
  model?: string;
  thinking?: string;
  constraints?: string[];
};

export type ProjectRules = {
  version: number;
  codeStyle: {
    indentation: "tabs" | "spaces";
    indentSize?: number;
    lineLength?: number;
    namingConventions?: Record<string, string>;
  };
  testing: {
    required: boolean;
    coverage?: number;
    frameworks: string[];
  };
  documentation: {
    required: boolean;
    format?: string;
    location?: string;
  };
  git: {
    branchNaming?: string;
    commitFormat?: string;
    requireReview?: boolean;
  };
  constraints: string[];
  customRules: string[];
};

export type CodeMap = {
  files: Map<string, FileInfo>;
  dependencies: Map<string, string[]>;
  exports: Map<string, ExportInfo>;
  imports: Map<string, ImportInfo[]>;
};

export type FileInfo = {
  path: string;
  language: string;
  size: number;
  lastModified: Date;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  types: TypeInfo[];
};

export type FunctionInfo = {
  name: string;
  line: number;
  params: string[];
  returnType?: string;
  exported: boolean;
  async: boolean;
};

export type ClassInfo = {
  name: string;
  line: number;
  extends?: string;
  implements: string[];
  methods: MethodInfo[];
  exported: boolean;
};

export type MethodInfo = {
  name: string;
  line: number;
  params: string[];
  returnType?: string;
  visibility: "public" | "private" | "protected";
  static: boolean;
  async: boolean;
};

export type InterfaceInfo = {
  name: string;
  line: number;
  extends: string[];
  properties: PropertyInfo[];
  methods: MethodInfo[];
  exported: boolean;
};

export type PropertyInfo = {
  name: string;
  type?: string;
  optional: boolean;
  readonly: boolean;
};

export type TypeInfo = {
  name: string;
  line: number;
  definition: string;
  exported: boolean;
};

export type ExportInfo = {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "let" | "var";
  file: string;
  line: number;
};

export type ImportInfo = {
  source: string;
  imports: string[];
  file: string;
  line: number;
};

export type DependencyNode = {
  file: string;
  dependencies: string[];
  dependents: string[];
};

export type GitHistoryEntry = {
  sha: string;
  author: string;
  date: Date;
  message: string;
  filesChanged: string[];
};

export type ProjectKnowledge = {
  context: ProjectContext;
  codeMap: CodeMap;
  dependencyGraph: Map<string, DependencyNode>;
  gitHistory: GitHistoryEntry[];
  lastUpdated: Date;
};

/**
 * A session handoff document that lets the next agent session resume where
 * the last one stopped — the CoderClaw alternative to Claude Projects session notes.
 */
export type SessionHandoff = {
  /** Unique identifier for this session */
  sessionId: string;
  /** ISO timestamp of when the session ended */
  timestamp: string;
  /** One-paragraph summary of what was accomplished */
  summary: string;
  /** Key decisions made during the session */
  decisions: string[];
  /** Concrete next steps for the following session */
  nextSteps: string[];
  /** Unresolved questions to revisit */
  openQuestions: string[];
  /** Files, docs, or other artifacts produced */
  artifacts: string[];
  /** Arbitrary extra context to carry forward */
  context?: Record<string, unknown>;
};

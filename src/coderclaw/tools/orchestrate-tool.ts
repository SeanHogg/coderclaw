/**
 * Tool for orchestrating multi-agent workflows
 */

import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { jsonResult } from "../../agents/tools/common.js";
import {
  globalOrchestrator,
  createFeatureWorkflow,
  createBugFixWorkflow,
  createRefactorWorkflow,
  type WorkflowStep,
  type SpawnSubagentContext,
} from "../orchestrator.js";

const OrchestrateSchema = Type.Object({
  workflow: Type.String({
    description:
      "Type of workflow: 'feature', 'bugfix', 'refactor', or 'custom'. Use 'custom' to define your own steps.",
  }),
  description: Type.String({
    description:
      "Description of the task (e.g., 'Add user authentication', 'Fix memory leak in parser', 'Refactor API module')",
  }),
  customSteps: Type.Optional(
    Type.Array(
      Type.Object({
        role: Type.String({
          description:
            "Agent role: 'code-creator', 'code-reviewer', 'test-generator', 'bug-analyzer', 'refactor-agent', 'documentation-agent', or 'architecture-advisor'",
        }),
        task: Type.String({
          description: "Task description for this step",
        }),
        dependsOn: Type.Optional(
          Type.Array(Type.String(), {
            description: "Task descriptions this step depends on",
          }),
        ),
      }),
      {
        description: "Custom workflow steps (required if workflow='custom')",
      },
    ),
  ),
});

type OrchestrateParams = {
  workflow: string;
  description: string;
  customSteps?: Array<{ role: string; task: string; dependsOn?: string[] }>;
};

export function createOrchestrateTool(options?: {
  agentSessionKey?: string;
  agentChannel?: string;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  requesterAgentIdOverride?: string;
}): AgentTool<typeof OrchestrateSchema, string> {
  const context: SpawnSubagentContext = {
    agentSessionKey: options?.agentSessionKey,
    agentChannel: options?.agentChannel,
    agentAccountId: options?.agentAccountId,
    agentTo: options?.agentTo,
    agentThreadId: options?.agentThreadId,
    agentGroupId: options?.agentGroupId,
    agentGroupChannel: options?.agentGroupChannel,
    agentGroupSpace: options?.agentGroupSpace,
    requesterAgentIdOverride: options?.requesterAgentIdOverride,
  };

  return {
    name: "orchestrate",
    label: "Orchestrate Workflow",
    description:
      "Create and execute multi-agent workflows for complex development tasks. Coordinates multiple specialized agents (code-creator, code-reviewer, test-generator, etc.) to work together.",
    parameters: OrchestrateSchema,
    async execute(_toolCallId: string, params: OrchestrateParams) {
      const { workflow, description, customSteps } = params;

      try {
        let steps: WorkflowStep[];

        switch (workflow) {
          case "feature":
            steps = createFeatureWorkflow(description);
            break;
          case "bugfix":
            steps = createBugFixWorkflow(description);
            break;
          case "refactor":
            steps = createRefactorWorkflow(description);
            break;
          case "custom":
            if (!customSteps || customSteps.length === 0) {
              return jsonResult({
                error: "Custom workflow requires customSteps to be provided",
              }) as AgentToolResult<string>;
            }
            steps = customSteps;
            break;
          default:
            return jsonResult({
              error: `Unknown workflow type: ${workflow}. Use 'feature', 'bugfix', 'refactor', or 'custom'.`,
            }) as AgentToolResult<string>;
        }

        // Create workflow
        const wf = globalOrchestrator.createWorkflow(steps);

        // Execute workflow asynchronously (fire-and-forget)
        // We don't await this - the workflow runs in the background
        globalOrchestrator.executeWorkflow(wf.id, context).catch((error) => {
          console.error(`Workflow ${wf.id} failed:`, error);
        });

        return jsonResult({
          workflowId: wf.id,
          status: "executing",
          taskCount: wf.tasks.size,
          steps: steps.map((s, i) => ({
            step: i + 1,
            role: s.role,
            task: s.task,
            dependencies: s.dependsOn || [],
          })),
          note: "Workflow started executing. Use workflow_status to check progress.",
        }) as AgentToolResult<string>;
      } catch (error) {
        return jsonResult({
          error: `Failed to create workflow: ${error instanceof Error ? error.message : String(error)}`,
        }) as AgentToolResult<string>;
      }
    },
  };
}

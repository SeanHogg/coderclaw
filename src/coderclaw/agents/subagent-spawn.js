/**
 * src/coderclaw/agents/subagent-spawn.js
 *
 * Stub implementation of spawnSubagentDirect.
 *
 * This stub returns a mock 'accepted' result so that the orchestrate
 * tool can proceed with wiring executeWorkflow() without needing
 * real sub-agent infrastructure during initial Phase-1 development.
 *
 * TODO: Replace with real sub-agent spawning via sessions_spawn
 * when the multi-agent system is ready.
 */
export async function spawnSubagentDirect(payload, context = {}) {
  // Basic validation
  if (!payload || typeof payload.task !== "string") {
    return { status: "rejected", error: "Invalid payload" };
  }

  // Generate a simple unique session key for the stub.
  // In a real implementation this would be provided by the session manager.
  const childSessionKey = `stub-${Math.random()
    .toString(36)
    .substring(2, 8)}`;

  // Return an accepted result so the caller thinks the sub-agent was spawned.
  return {
    status: "accepted",
    childSessionKey,
  };
}
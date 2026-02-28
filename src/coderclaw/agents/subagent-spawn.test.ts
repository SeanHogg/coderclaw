import { spawnSubagentDirect } from "./subagent-spawn.js";

describe("spawnSubagentDirect (stub)", () => {
  test("returns accepted result with childSessionKey", async () => {
    const result = await spawnSubagentDirect({
      task: "Test task",
      label: "Test Label",
      agentId: "test-agent",
    });
    expect(result).toHaveProperty("status", "accepted");
    expect(result).toHaveProperty("childSessionKey");
    expect(typeof result.childSessionKey).toBe("string");
  });
});
import { describe, it, expect } from "vitest";
import { TaskGraph } from "../src/agents/task-graph.js";

function makeTask(
  id: string,
  dependencies: string[] = [],
  priority = 1,
) {
  return {
    id,
    agent: "backend-lead",
    description: `Task ${id}`,
    dependencies,
    estimatedTime: 10,
    priority,
    status: "pending" as const,
  };
}

describe("TaskGraph", () => {
  it("returns tasks with no dependencies as executable first", () => {
    const graph = new TaskGraph();
    graph.addTask(makeTask("a"));
    graph.addTask(makeTask("b", ["a"]));
    graph.buildGraph();

    const executable = graph.getExecutableTasks();
    expect(executable.map((t) => t.id)).toEqual(["a"]);
  });

  it("unblocks dependents after parent completes", () => {
    const graph = new TaskGraph();
    graph.addTask(makeTask("a"));
    graph.addTask(makeTask("b", ["a"]));
    graph.buildGraph();

    graph.markTaskComplete("a");
    const executable = graph.getExecutableTasks();
    expect(executable.map((t) => t.id)).toEqual(["b"]);
  });

  it("detects circular dependencies", () => {
    const graph = new TaskGraph();
    graph.addTask(makeTask("a", ["b"]));
    graph.addTask(makeTask("b", ["a"]));

    expect(() => graph.buildGraph()).toThrow(/Circular dependency/);
  });

  it("sorts executable tasks by priority descending", () => {
    const graph = new TaskGraph();
    graph.addTask(makeTask("low", [], 1));
    graph.addTask(makeTask("high", [], 5));
    graph.buildGraph();

    const executable = graph.getExecutableTasks();
    expect(executable.map((t) => t.id)).toEqual(["high", "low"]);
  });
});

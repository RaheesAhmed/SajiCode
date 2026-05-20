import type { TaskNode, AgentLoad } from "./task-types.js";

const DEFAULT_MAX_LOAD = 2;
const DEFAULT_AVG_COMPLETION_TIME = 60000; // 1 minute default

/**
 * WorkloadBalancer manages agent load distribution across tasks.
 * Tracks agent capacity, historical performance, and assigns tasks optimally.
 * 
 * @example
 * const balancer = new WorkloadBalancer();
 * balancer.registerAgent("backend-agent", 3);
 * balancer.registerAgent("frontend-agent", 2);
 * 
 * const task = { id: "task1", agent: "", description: "Build API", dependencies: [], estimatedTime: 30, priority: 1, status: "pending" };
 * const assignedAgent = balancer.assignTask(task);
 */
export class WorkloadBalancer {
  private agentLoads: Map<string, AgentLoad> = new Map();
  private completionTimes: Map<string, number[]> = new Map();

  /**
   * Register a new agent with the balancer.
   * @param agent - The agent identifier
   * @param maxLoad - Maximum concurrent tasks (default: 2)
   */
  registerAgent(agent: string, maxLoad: number = DEFAULT_MAX_LOAD): void {
    this.agentLoads.set(agent, {
      agent,
      currentLoad: 0,
      maxLoad,
      avgCompletionTime: DEFAULT_AVG_COMPLETION_TIME,
    });
    this.completionTimes.set(agent, []);
  }

  /**
   * Get all available agents that can accept new tasks.
   * @param domain - Optional domain filter
   * @returns Array of available agent names
   */
  getAvailableAgents(domain?: string): string[] {
    const available: string[] = [];

    for (const [name, load] of this.agentLoads) {
      if (load.currentLoad < load.maxLoad) {
        if (!domain || name.toLowerCase().includes(domain.toLowerCase())) {
          available.push(name);
        }
      }
    }

    return available;
  }

  /**
   * Score an agent for a given task. Higher score = better fit.
   * Considers: current load, priority match, estimated time vs avg completion.
   * @param agent - Agent name
   * @param task - Task to score
   * @returns Score (higher = better)
   */
  scoreAgent(agent: string, task: TaskNode): number {
    const load = this.agentLoads.get(agent);
    if (!load) return -Infinity;

    // Penalize if at max capacity
    if (load.currentLoad >= load.maxLoad) return -Infinity;

    let score = 100;

    // Factor 1: Available capacity (more available = higher score)
    const capacityRatio = (load.maxLoad - load.currentLoad) / load.maxLoad;
    score += capacityRatio * 30;

    // Factor 2: Priority match (task priority 1-10)
    score += task.priority * 5;

    // Factor 3: Estimated time vs historical average
    const timeRatio = task.estimatedTime * 1000 / load.avgCompletionTime;
    if (timeRatio <= 1) {
      score += 20; // Task fits well within average completion time
    } else {
      score -= (timeRatio - 1) * 10; // Penalize for longer tasks
    }

    // Factor 4: Lower current load = higher score
    score -= load.currentLoad * 10;

    return score;
  }

  /**
   * Assign a task to the best available agent.
   * @param task - Task to assign
   * @returns Agent name or empty string if none available
   */
  assignTask(task: TaskNode): string {
    if (task.agent) {
      const preferred = this.agentLoads.get(task.agent);
      if (preferred && preferred.currentLoad < preferred.maxLoad) {
        this.trackAgentStart(task.agent);
        return task.agent;
      }
    }

    const domainAgents = task.agent ? this.getAvailableAgents(task.agent) : [];
    const availableAgents = domainAgents.length > 0 ? domainAgents : this.getAvailableAgents();
    
    if (availableAgents.length === 0) {
      return "";
    }

    let bestAgent = "";
    let bestScore = -Infinity;

    for (const agent of availableAgents) {
      const score = this.scoreAgent(agent, task);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    if (bestAgent) {
      this.trackAgentStart(bestAgent);
    }

    return bestAgent;
  }

  /**
   * Track that an agent has started working on a task.
   * @param agent - Agent name
   */
  trackAgentStart(agent: string): void {
    const load = this.agentLoads.get(agent);
    if (load) {
      load.currentLoad += 1;
    }
  }

  /**
   * Track that an agent has completed a task.
   * Updates historical performance data for future assignments.
   * @param agent - Agent name
   * @param duration - Time taken in milliseconds
   */
  trackAgentComplete(agent: string, duration: number): void {
    const load = this.agentLoads.get(agent);
    if (load) {
      load.currentLoad = Math.max(0, load.currentLoad - 1);
      
      // Update average completion time (rolling average of last 10)
      const times = this.completionTimes.get(agent) || [];
      times.push(duration);
      if (times.length > 10) times.shift();
      
      const total = times.reduce((sum, t) => sum + t, 0);
      load.avgCompletionTime = total / times.length;
    }
  }

  /**
   * Get load information for a specific agent.
   * @param agent - Agent name
   * @returns AgentLoad or undefined if not registered
   */
  getAgentLoad(agent: string): AgentLoad | undefined {
    return this.agentLoads.get(agent);
  }

  /**
   * Get load information for all agents.
   * @returns Array of all agent loads
   */
  getAllLoads(): AgentLoad[] {
    return Array.from(this.agentLoads.values());
  }

  /**
   * Unregister an agent.
   * @param agent - Agent name
   */
  unregisterAgent(agent: string): void {
    this.agentLoads.delete(agent);
    this.completionTimes.delete(agent);
  }

  /** Get the number of registered agents. */
  get agentCount(): number {
    return this.agentLoads.size;
  }

  /** Get total available capacity across all agents. */
  get totalAvailableCapacity(): number {
    let capacity = 0;
    for (const load of this.agentLoads.values()) {
      capacity += load.maxLoad - load.currentLoad;
    }
    return capacity;
  }
}

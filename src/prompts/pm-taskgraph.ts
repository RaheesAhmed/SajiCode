/**
 * PM Agent - Task Graph Integration
 * 
 * This module provides the parallel execution instructions for the PM agent.
 * Import this content and add it to the PM prompt for TaskGraph support.
 */

export const TASK_GRAPH_INTEGRATION = `

PARALLEL EXECUTION WITH TASK GRAPH:
For MEDIUM/LARGE tasks with multiple independent subtasks, use the TaskGraph system:
1. Build a task graph with create_task_graph, then add_task_node for each subtask
2. Add dependencies with add_task_dependency where needed (e.g., types before implementations)
3. Use get_executable_tasks to find all tasks ready to run in parallel
4. Dispatch all executable tasks in ONE parallel task() call
5. Before dispatching, call mark_task_running for each dispatched graph node
6. When tasks complete, call mark_task_complete and check for newly unblocked tasks
7. Repeat until all tasks complete

Example: For a full-stack app with 3 agents needed:
- Task A (backend-lead): API routes - NO deps → dispatch immediately
- Task B (frontend-lead): UI components - NO deps → dispatch immediately  
- Task C (qa-lead): Tests - depends on A,B → dispatch after both complete

Tools available:
- create_task_graph: Reset/create the active TaskGraph
- add_task_node: Add a task node to the graph
- add_task_dependency: Add dependency relationship
- get_executable_tasks: Get tasks with no pending dependencies
- mark_task_running: Mark dispatched task as running
- mark_task_complete: Mark task as complete, unblock dependents
- mark_task_failed: Mark task failed, block dependents
- get_task_graph_progress: Get progress of all tasks

Example usage pattern:
1. create_task_graph
2. add_task_node(id='backend', agent='backend-lead', description='Build API')
3. add_task_node(id='frontend', agent='frontend-lead', description='Build UI')
4. add_task_node(id='tests', agent='qa-lead', description='Write tests', dependencies=['backend', 'frontend'])
5. get_executable_tasks returns backend + frontend
6. mark_task_running for both, then dispatch both in parallel
7. mark_task_complete for backend and frontend
8. get_executable_tasks now returns tests
`;

export const WORKLOAD_BALANCER_INTEGRATION = `

SMART WORKLOAD DISTRIBUTION:
Use WorkloadBalancer to assign tasks to the best-fit agent:
- get_available_agents(domain?): Get agents under capacity
- assign_task_agent(task): Get the best agent for a task and reserve capacity
- track_agent_complete(agent, duration): Release capacity and record completion for learning
- get_agent_loads: Inspect current load

Scoring factors:
- Current load vs max load (lower = better)
- Task priority match
- Estimated time vs agent's historical average
`;

import { Database } from "bun:sqlite";
import {
  Scheduler,
  createExecutor,
  defineWorkflow,
  sqliteAdapter,
  createDefinitionStore,
  serializeDefinition,
  CREATE_WORKFLOW_INSTANCES,
  CREATE_TIMEOUT_ENTRIES,
} from "@petriflow/engine";
import type {
  WorkflowDefinition,
  ExtendedInstanceState,
  SchedulerEvents,
  SerializedDefinition,
  DefinitionStore,
} from "@petriflow/engine";
import type { Marking } from "petri-ts";

export type RuntimeEvent =
  | {
      type: "fire";
      workflow: string;
      instanceId: string;
      transition: string;
      marking: Record<string, number>;
      context: Record<string, unknown>;
    }
  | { type: "complete"; workflow: string; instanceId: string }
  | { type: "error"; workflow: string; instanceId: string; error: string }
  | {
      type: "timeout";
      workflow: string;
      instanceId: string;
      transition: string;
      place: string;
    }
  | {
      type: "decision";
      workflow: string;
      instanceId: string;
      transition: string;
      reasoning: string;
      candidates: string[];
    };

export type RuntimeOptions = {
  db: Database;
  pollIntervalMs?: number;
};

type RegisteredWorkflow = {
  name: string;
  places: string[];
  transitions: string[];
  scheduler: Scheduler<any, any>;
};

type InstanceRow = {
  id: string;
  workflow_name: string;
  status: string;
};

export class WorkflowRuntime {
  private readonly db: Database;
  private readonly pollIntervalMs: number;
  private readonly workflows = new Map<string, RegisteredWorkflow>();
  private readonly listeners = new Set<(event: RuntimeEvent) => void>();
  private readonly definitionStore: DefinitionStore;

  private readonly selectInstanceById;
  private readonly selectInstances;
  private readonly selectInstancesByWorkflow;
  private readonly selectInstancesByStatus;
  private readonly selectInstancesByWorkflowAndStatus;

  constructor(options: RuntimeOptions) {
    this.db = options.db;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;

    // Ensure tables exist for cross-workflow queries
    this.db.run(CREATE_WORKFLOW_INSTANCES);
    this.db.run(CREATE_TIMEOUT_ENTRIES);
    this.definitionStore = createDefinitionStore(this.db);

    this.selectInstanceById = this.db.query<InstanceRow, [string]>(
      "SELECT id, workflow_name, status FROM workflow_instances WHERE id = ?",
    );
    this.selectInstances = this.db.query<InstanceRow, []>(
      "SELECT id, workflow_name, status FROM workflow_instances",
    );
    this.selectInstancesByWorkflow = this.db.query<InstanceRow, [string]>(
      "SELECT id, workflow_name, status FROM workflow_instances WHERE workflow_name = ?",
    );
    this.selectInstancesByStatus = this.db.query<InstanceRow, [string]>(
      "SELECT id, workflow_name, status FROM workflow_instances WHERE status = ?",
    );
    this.selectInstancesByWorkflowAndStatus = this.db.query<InstanceRow, [string, string]>(
      "SELECT id, workflow_name, status FROM workflow_instances WHERE workflow_name = ? AND status = ?",
    );
  }

  register(definition: WorkflowDefinition<string, Record<string, unknown>>): void {
    if (this.workflows.has(definition.name)) {
      throw new Error(`Workflow already registered: ${definition.name}`);
    }

    const adapter = sqliteAdapter(this.db, definition.name);
    const executor = createExecutor(definition);

    const events: SchedulerEvents<string, Record<string, unknown>> = {
      onFire: (instanceId, transition, result) => {
        this.emit({
          type: "fire",
          workflow: definition.name,
          instanceId,
          transition,
          marking: result.marking,
          context: result.context,
        });
      },
      onComplete: (instanceId) => {
        this.emit({
          type: "complete",
          workflow: definition.name,
          instanceId,
        });
      },
      onError: (instanceId, error) => {
        this.emit({
          type: "error",
          workflow: definition.name,
          instanceId,
          error: error instanceof Error ? error.message : String(error),
        });
      },
      onTimeout: (instanceId, transition, place) => {
        this.emit({
          type: "timeout",
          workflow: definition.name,
          instanceId,
          transition,
          place,
        });
      },
      onDecision: (instanceId, transition, reasoning, candidates) => {
        this.emit({
          type: "decision",
          workflow: definition.name,
          instanceId,
          transition,
          reasoning,
          candidates,
        });
      },
    };

    const scheduler = new Scheduler(
      executor,
      {
        adapter,
        pollIntervalMs: this.pollIntervalMs,
      },
      events,
    );

    this.workflows.set(definition.name, {
      name: definition.name,
      places: Object.keys(definition.net.initialMarking),
      transitions: definition.net.transitions.map((t) => t.name),
      scheduler,
    });
  }

  listWorkflows(): { name: string; places: string[]; transitions: string[] }[] {
    return Array.from(this.workflows.values()).map((w) => ({
      name: w.name,
      places: w.places,
      transitions: w.transitions,
    }));
  }

  async createInstance(workflowName: string, instanceId: string): Promise<Marking<string>> {
    const wf = this.workflows.get(workflowName);
    if (!wf) throw new Error(`Unknown workflow: ${workflowName}`);
    return wf.scheduler.createInstance(instanceId);
  }

  async inspect(
    instanceId: string,
  ): Promise<ExtendedInstanceState<string, Record<string, unknown>>> {
    const row = this.selectInstanceById.get(instanceId);
    if (!row) throw new Error(`Instance not found: ${instanceId}`);

    const wf = this.workflows.get(row.workflow_name);
    if (!wf) throw new Error(`Workflow not registered: ${row.workflow_name}`);

    return wf.scheduler.inspect(instanceId);
  }

  async getHistory(instanceId: string) {
    const row = this.selectInstanceById.get(instanceId);
    if (!row) throw new Error(`Instance not found: ${instanceId}`);

    const wf = this.workflows.get(row.workflow_name);
    if (!wf) throw new Error(`Workflow not registered: ${row.workflow_name}`);

    return wf.scheduler.getHistory(instanceId);
  }

  async injectToken(instanceId: string, place: string, count: number = 1): Promise<void> {
    const row = this.selectInstanceById.get(instanceId);
    if (!row) throw new Error(`Instance not found: ${instanceId}`);

    const wf = this.workflows.get(row.workflow_name);
    if (!wf) throw new Error(`Workflow not registered: ${row.workflow_name}`);

    await wf.scheduler.injectToken(instanceId, place, count);
  }

  async listInstances(
    workflowName?: string,
    status?: string,
  ): Promise<{ id: string; workflowName: string; status: string }[]> {
    let rows: InstanceRow[];
    if (workflowName && status) {
      rows = this.selectInstancesByWorkflowAndStatus.all(workflowName, status);
    } else if (workflowName) {
      rows = this.selectInstancesByWorkflow.all(workflowName);
    } else if (status) {
      rows = this.selectInstancesByStatus.all(status);
    } else {
      rows = this.selectInstances.all();
    }
    return rows.map((r) => ({
      id: r.id,
      workflowName: r.workflow_name,
      status: r.status,
    }));
  }

  start(): void {
    for (const wf of this.workflows.values()) {
      wf.scheduler.start();
    }
  }

  stop(): void {
    for (const wf of this.workflows.values()) {
      wf.scheduler.stop();
    }
  }

  async tick(): Promise<number> {
    let total = 0;
    for (const wf of this.workflows.values()) {
      total += await wf.scheduler.tick();
    }
    return total;
  }

  saveDefinition(serialized: SerializedDefinition): void {
    // Validate by compiling — throws on bad places/guards
    const definition = defineWorkflow(serialized);

    // Persist to DB
    this.definitionStore.save(serialized);

    // Re-register (or register for the first time)
    if (this.workflows.has(definition.name)) {
      this.workflows.get(definition.name)!.scheduler.stop();
      this.workflows.delete(definition.name);
    }
    this.register(definition);
  }

  loadDefinition(name: string): SerializedDefinition | null {
    return this.definitionStore.load(name);
  }

  listDefinitions(): string[] {
    return this.definitionStore.list();
  }

  deleteDefinition(name: string): boolean {
    if (this.workflows.has(name)) {
      this.workflows.get(name)!.scheduler.stop();
      this.workflows.delete(name);
    }
    return this.definitionStore.delete(name);
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: RuntimeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

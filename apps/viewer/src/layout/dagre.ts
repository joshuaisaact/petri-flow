import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { Marking, PetriNet } from "petri-ts";
import type { PlaceMetadata } from "../types";

export type TokenDisplay = "numbers" | "dots";

export type PlaceNodeData = {
  label: string;
  tokens: number;
  category: PlaceMetadata["category"];
  tokenDisplay: TokenDisplay;
  isTerminal: boolean;
};

export type TransitionNodeData = {
  label: string;
  enabled: boolean;
  justFired: boolean;
  inputs: string[];
  outputs: string[];
  hasGuard: boolean;
  hasExecute: boolean;
  guardCode?: string;
  executeCode?: string;
  timeout?: { place: string; ms: number };
};

// 56px circle + label below ≈ 72px total. 80px wide for label clearance.
const PLACE_W = 80;
const PLACE_H = 72;
const TRANS_W = 140;
const TRANS_H = 36;

export type WorkflowTransitionMeta = {
  name: string;
  guard?: string;
  execute?: Function;
  timeout?: { place: string; ms: number };
};

export function layoutNet(
  net: PetriNet<string>,
  marking: Marking<string>,
  placeMetadata?: Record<string, PlaceMetadata>,
  workflowTransitions?: WorkflowTransitionMeta[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 100,
    edgesep: 20,
    align: "UL",
  });

  const places = new Set<string>();
  for (const t of net.transitions) {
    for (const p of t.inputs) places.add(p);
    for (const p of t.outputs) places.add(p);
  }
  for (const p of Object.keys(net.initialMarking)) places.add(p);

  for (const place of places) {
    g.setNode(place, { width: PLACE_W, height: PLACE_H });
  }

  for (const t of net.transitions) {
    const tid = `t:${t.name}`;
    g.setNode(tid, { width: TRANS_W, height: TRANS_H });
  }

  // Build timeout lookup for layout hints
  const timeoutLookup = new Map<string, { transitionId: string; place: string }>();
  if (workflowTransitions) {
    for (const wt of workflowTransitions) {
      if (wt.timeout) {
        timeoutLookup.set(wt.name, { transitionId: `t:${wt.name}`, place: wt.timeout.place });
      }
    }
  }

  for (const t of net.transitions) {
    const tid = `t:${t.name}`;
    for (const input of t.inputs) {
      g.setEdge(input, tid);
    }
    for (const output of t.outputs) {
      g.setEdge(tid, output);
    }
  }

  // Add layout-only edges from timed transitions to their timeout places
  // so Dagre positions timeout places near the transitions that trigger them
  for (const [, info] of timeoutLookup) {
    if (places.has(info.place) && !g.hasEdge(info.transitionId, info.place)) {
      g.setEdge(info.transitionId, info.place);
    }
  }

  dagre.layout(g);

  // --- Detect feedback (back-edge) transitions ---
  const feedbackTransitions = new Set<string>();
  for (const t of net.transitions) {
    if (t.inputs.length === 0 || t.outputs.length === 0) continue;
    const inputMaxY = Math.max(
      ...t.inputs.map((p) => g.node(p).y as number),
    );
    const outputMinY = Math.min(
      ...t.outputs.map((p) => g.node(p).y as number),
    );
    if (outputMinY < inputMaxY - 50) {
      feedbackTransitions.add(`t:${t.name}`);
    }
  }

  // Reposition feedback transitions (and their exclusive input places) to the left
  if (feedbackTransitions.size > 0) {
    // Find places that ONLY connect to feedback transitions (e.g. iterationBudget)
    const feedbackOnlyPlaces = new Set<string>();
    for (const t of net.transitions) {
      if (!feedbackTransitions.has(`t:${t.name}`)) continue;
      for (const input of t.inputs) {
        // Check if this place is ONLY used by feedback transitions
        const usedByNonFeedback = net.transitions.some(
          (other) =>
            !feedbackTransitions.has(`t:${other.name}`) &&
            (other.inputs.includes(input) || other.outputs.includes(input)),
        );
        if (!usedByNonFeedback) {
          feedbackOnlyPlaces.add(input);
        }
      }
    }

    let minX = Infinity;
    for (const id of g.nodes() as string[]) {
      if (!feedbackTransitions.has(id) && !feedbackOnlyPlaces.has(id)) {
        minX = Math.min(minX, g.node(id).x as number);
      }
    }
    for (const tid of feedbackTransitions) {
      const n = g.node(tid);
      n.x = minX - 180;
    }
    for (const pid of feedbackOnlyPlaces) {
      const n = g.node(pid);
      n.x = minX - 180;
    }
  }

  // --- Pin resource places to the top row ---
  if (placeMetadata) {
    const resourcePlaces = [...places].filter(
      (p) => placeMetadata[p]?.category === "resource",
    );
    if (resourcePlaces.length > 0) {
      let minY = Infinity;
      for (const id of g.nodes() as string[]) {
        minY = Math.min(minY, g.node(id).y as number);
      }
      for (const p of resourcePlaces) {
        g.node(p).y = minY;
      }
    }
  }

  // --- Build React Flow nodes ---
  const nodes: Node[] = [];

  for (const place of places) {
    const pos = g.node(place);
    const meta = placeMetadata?.[place];
    nodes.push({
      id: place,
      type: "place",
      position: { x: pos.x - PLACE_W / 2, y: pos.y - PLACE_H / 2 },
      width: PLACE_W,
      height: PLACE_H,
      measured: { width: PLACE_W, height: PLACE_H },
      data: {
        label: meta?.label ?? place,
        tokens: marking[place] ?? 0,
        category: meta?.category ?? "default",
        tokenDisplay: "numbers",
        isTerminal: false,
      } satisfies PlaceNodeData,
    });
  }

  // Build a lookup of place labels for transition tooltips
  const placeLabel = (p: string) => placeMetadata?.[p]?.label ?? p;

  // Build lookup for workflow transition metadata (guard/execute/timeout)
  const wfLookup = new Map<string, WorkflowTransitionMeta>();
  if (workflowTransitions) {
    for (const wt of workflowTransitions) {
      wfLookup.set(wt.name, wt);
    }
  }

  for (const t of net.transitions) {
    const tid = `t:${t.name}`;
    const pos = g.node(tid);
    const wt = wfLookup.get(t.name);
    nodes.push({
      id: tid,
      type: "transition",
      position: { x: pos.x - TRANS_W / 2, y: pos.y - TRANS_H / 2 },
      width: TRANS_W,
      height: TRANS_H,
      measured: { width: TRANS_W, height: TRANS_H },
      data: {
        label: t.name,
        enabled: false,
        justFired: false,
        inputs: t.inputs.map(placeLabel),
        outputs: t.outputs.map(placeLabel),
        hasGuard: !!wt?.guard,
        hasExecute: !!wt?.execute,
        guardCode: wt?.guard?.toString(),
        executeCode: wt?.execute?.toString(),
        timeout: wt?.timeout,
      } satisfies TransitionNodeData,
    });
  }

  // --- Build React Flow edges ---
  const edges: Edge[] = [];
  for (const t of net.transitions) {
    const tid = `t:${t.name}`;
    const isFeedback = feedbackTransitions.has(tid);

    for (const input of t.inputs) {
      edges.push({
        id: `${input}->${tid}`,
        source: input,
        target: tid,
        animated: false,
      });
    }
    for (const output of t.outputs) {
      edges.push({
        id: `${tid}->${output}`,
        source: tid,
        target: output,
        ...(isFeedback && {
          sourceHandle: "left-source",
          targetHandle: "left-target",
        }),
      });
    }
  }

  // Add dashed timeout edges (transition → timeout place)
  for (const [, info] of timeoutLookup) {
    if (places.has(info.place)) {
      edges.push({
        id: `${info.transitionId}->timeout:${info.place}`,
        source: info.transitionId,
        target: info.place,
        animated: false,
        style: { strokeDasharray: "6 3", stroke: "#ef4444", strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

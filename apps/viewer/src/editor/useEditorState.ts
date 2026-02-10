import { useRef, useState } from "react";
import type { SerializedDefinition } from "@petriflow/engine";
import type { Node, Edge } from "@xyflow/react";
import type { PlaceNodeData, TransitionNodeData } from "../layout/dagre";
import { layoutNet } from "../layout/dagre";

export type NodePositions = Record<string, { x: number; y: number }>;

type Snapshot = { definition: SerializedDefinition; positions: NodePositions };
const MAX_UNDO = 5;

const PLACE_W = 80;
const PLACE_H = 72;
const TRANS_W = 140;
const TRANS_H = 36;

function emptyDefinition(): SerializedDefinition {
  return {
    name: "untitled",
    places: [],
    transitions: [],
    initialMarking: {},
    initialContext: {},
    terminalPlaces: [],
  };
}

function buildNodes(
  def: SerializedDefinition,
  positions: NodePositions,
): Node[] {
  const nodes: Node[] = [];

  for (const place of def.places) {
    const pos = positions[place] ?? { x: 0, y: 0 };
    nodes.push({
      id: place,
      type: "place",
      position: pos,
      width: PLACE_W,
      height: PLACE_H,
      measured: { width: PLACE_W, height: PLACE_H },
      data: {
        label: place,
        tokens: def.initialMarking[place] ?? 0,
        category: def.terminalPlaces.includes(place) ? "terminal" : "default",
        tokenDisplay: "numbers",
        isTerminal: false,
      } satisfies PlaceNodeData,
    });
  }

  for (const t of def.transitions) {
    const tid = `t:${t.name}`;
    const pos = positions[tid] ?? { x: 0, y: 0 };
    nodes.push({
      id: tid,
      type: "transition",
      position: pos,
      width: TRANS_W,
      height: TRANS_H,
      measured: { width: TRANS_W, height: TRANS_H },
      data: {
        label: t.name,
        transitionType: t.type ?? "automatic",
        enabled: false,
        justFired: false,
        inputs: t.inputs,
        outputs: t.outputs,
        hasGuard: !!t.guard,
        hasExecute: false,
        guardCode: t.guard ?? undefined,
        timeout: t.timeout,
        config: t.config,
      } satisfies TransitionNodeData,
    });
  }

  return nodes;
}

function buildEdges(def: SerializedDefinition): Edge[] {
  const edges: Edge[] = [];
  for (const t of def.transitions) {
    const tid = `t:${t.name}`;
    for (const input of t.inputs) {
      edges.push({ id: `${input}->${tid}`, source: input, target: tid });
    }
    for (const output of t.outputs) {
      edges.push({ id: `${tid}->${output}`, source: tid, target: output });
    }
    if (t.timeout) {
      edges.push({
        id: `${tid}->timeout:${t.timeout.place}`,
        source: tid,
        target: t.timeout.place,
        style: { strokeDasharray: "6 3", stroke: "#ef4444", strokeWidth: 1.5 },
      });
    }
  }
  return edges;
}

/** Compute initial positions using dagre layout. */
function computeLayout(def: SerializedDefinition): NodePositions {
  if (def.places.length === 0 && def.transitions.length === 0) return {};

  const net = {
    transitions: def.transitions.map((t) => ({
      name: t.name,
      inputs: t.inputs,
      outputs: t.outputs,
    })),
    initialMarking: def.initialMarking,
  };

  const { nodes } = layoutNet(net, def.initialMarking, undefined, def.transitions);
  const positions: NodePositions = {};
  for (const node of nodes) {
    positions[node.id] = node.position;
  }
  return positions;
}

export function useEditorState() {
  const [definition, setDefinition] = useState<SerializedDefinition>(emptyDefinition);
  const [positions, setPositions] = useState<NodePositions>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);

  const nodes = buildNodes(definition, positions);
  const edges = buildEdges(definition);
  const canUndo = history.length > 0;

  /** Push current state onto the undo stack. Call before any mutation. */
  function snapshot() {
    setHistory((h) => [...h.slice(-(MAX_UNDO - 1)), { definition, positions }]);
  }

  function undo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    setDefinition(prev.definition);
    setPositions(prev.positions);
    setHistory((h) => h.slice(0, -1));
    setSelectedId(null);
  }

  function loadDefinition(def: SerializedDefinition) {
    setDefinition(def);
    setPositions(computeLayout(def));
    setSelectedId(null);
    setHistory([]);
  }

  function newDefinition(name?: string) {
    const def = emptyDefinition();
    if (name) def.name = name;
    setDefinition(def);
    setPositions({});
    setSelectedId(null);
    setHistory([]);
  }

  function setName(name: string) {
    snapshot();
    setDefinition((d) => ({ ...d, name }));
  }

  function addPlace(name: string, at?: { x: number; y: number }) {
    if (definition.places.includes(name)) return;
    snapshot();
    setDefinition((d) => ({
      ...d,
      places: [...d.places, name],
      initialMarking: { ...d.initialMarking, [name]: 0 },
    }));
    const pos = at ?? { x: 200 + definition.places.length * 100, y: 200 };
    setPositions((p) => ({ ...p, [name]: pos }));
  }

  function removePlace(name: string) {
    snapshot();
    setDefinition((d) => {
      const { [name]: _, ...marking } = d.initialMarking;
      return {
        ...d,
        places: d.places.filter((p) => p !== name),
        initialMarking: marking,
        terminalPlaces: d.terminalPlaces.filter((p) => p !== name),
        transitions: d.transitions.map((t) => ({
          ...t,
          inputs: t.inputs.filter((p) => p !== name),
          outputs: t.outputs.filter((p) => p !== name),
        })),
      };
    });
    setPositions((p) => {
      const { [name]: _, ...rest } = p;
      return rest;
    });
    if (selectedId === name) setSelectedId(null);
  }

  function addTransition(name: string, at?: { x: number; y: number }) {
    if (definition.transitions.some((t) => t.name === name)) return;
    snapshot();
    setDefinition((d) => ({
      ...d,
      transitions: [
        ...d.transitions,
        { name, type: "automatic", inputs: [], outputs: [], guard: null },
      ],
    }));
    const tid = `t:${name}`;
    const pos = at ?? { x: 250 + definition.transitions.length * 120, y: 300 };
    setPositions((p) => ({ ...p, [tid]: pos }));
  }

  function removeTransition(name: string) {
    snapshot();
    setDefinition((d) => ({
      ...d,
      transitions: d.transitions.filter((t) => t.name !== name),
    }));
    const tid = `t:${name}`;
    setPositions((p) => {
      const { [tid]: _, ...rest } = p;
      return rest;
    });
    if (selectedId === `t:${name}`) setSelectedId(null);
  }

  function addArc(sourceId: string, targetId: string) {
    const sourceIsTransition = sourceId.startsWith("t:");
    const targetIsTransition = targetId.startsWith("t:");

    // Only allow place→transition or transition→place
    if (sourceIsTransition === targetIsTransition) return;
    snapshot();

    if (sourceIsTransition) {
      // transition → place: add place to outputs
      const tName = sourceId.slice(2);
      const place = targetId;
      setDefinition((d) => ({
        ...d,
        transitions: d.transitions.map((t) =>
          t.name === tName && !t.outputs.includes(place)
            ? { ...t, outputs: [...t.outputs, place] }
            : t,
        ),
      }));
    } else {
      // place → transition: add place to inputs
      const place = sourceId;
      const tName = targetId.slice(2);
      setDefinition((d) => ({
        ...d,
        transitions: d.transitions.map((t) =>
          t.name === tName && !t.inputs.includes(place)
            ? { ...t, inputs: [...t.inputs, place] }
            : t,
        ),
      }));
    }
  }

  function removeEdge(edgeId: string) {
    // Edge IDs: "place->t:name" or "t:name->place"
    const [source, target] = edgeId.split("->");
    if (!source || !target) return;
    snapshot();

    if (source.startsWith("t:")) {
      const tName = source.slice(2);
      const place = target;
      setDefinition((d) => ({
        ...d,
        transitions: d.transitions.map((t) =>
          t.name === tName
            ? { ...t, outputs: t.outputs.filter((p) => p !== place) }
            : t,
        ),
      }));
    } else {
      const place = source;
      const tName = target.slice(2);
      setDefinition((d) => ({
        ...d,
        transitions: d.transitions.map((t) =>
          t.name === tName
            ? { ...t, inputs: t.inputs.filter((p) => p !== place) }
            : t,
        ),
      }));
    }
  }

  function updateNodePosition(id: string, pos: { x: number; y: number }) {
    setPositions((p) => ({ ...p, [id]: pos }));
  }

  function setInitialTokens(place: string, count: number) {
    snapshot();
    setDefinition((d) => ({
      ...d,
      initialMarking: { ...d.initialMarking, [place]: count },
    }));
  }

  function toggleTerminal(place: string) {
    snapshot();
    setDefinition((d) => ({
      ...d,
      terminalPlaces: d.terminalPlaces.includes(place)
        ? d.terminalPlaces.filter((p) => p !== place)
        : [...d.terminalPlaces, place],
    }));
  }

  function setGuard(transitionName: string, guard: string | null) {
    snapshot();
    setDefinition((d) => ({
      ...d,
      transitions: d.transitions.map((t) =>
        t.name === transitionName ? { ...t, guard } : t,
      ),
    }));
  }

  function setTimeout(transitionName: string, timeout: { place: string; ms: number } | undefined) {
    snapshot();
    setDefinition((d) => ({
      ...d,
      transitions: d.transitions.map((t) =>
        t.name === transitionName ? { ...t, timeout } : t,
      ),
    }));
  }

  function setTransitionType(transitionName: string, type: string) {
    snapshot();
    setDefinition((d) => ({
      ...d,
      transitions: d.transitions.map((t) =>
        t.name === transitionName ? { ...t, type, config: undefined } : t,
      ),
    }));
  }

  function setConfig(transitionName: string, config: Record<string, unknown> | undefined) {
    snapshot();
    setDefinition((d) => ({
      ...d,
      transitions: d.transitions.map((t) =>
        t.name === transitionName ? { ...t, config } : t,
      ),
    }));
  }

  function autoLayout() {
    snapshot();
    setPositions(computeLayout(definition));
  }

  function renamePlace(oldName: string, newName: string) {
    if (oldName === newName || definition.places.includes(newName)) return;
    snapshot();
    setDefinition((d) => ({
      ...d,
      places: d.places.map((p) => (p === oldName ? newName : p)),
      initialMarking: Object.fromEntries(
        Object.entries(d.initialMarking).map(([k, v]) => [k === oldName ? newName : k, v]),
      ),
      terminalPlaces: d.terminalPlaces.map((p) => (p === oldName ? newName : p)),
      transitions: d.transitions.map((t) => ({
        ...t,
        inputs: t.inputs.map((p) => (p === oldName ? newName : p)),
        outputs: t.outputs.map((p) => (p === oldName ? newName : p)),
        timeout: t.timeout?.place === oldName ? { ...t.timeout, place: newName } : t.timeout,
      })),
    }));
    setPositions((p) => {
      const { [oldName]: pos, ...rest } = p;
      return pos ? { ...rest, [newName]: pos } : rest;
    });
    if (selectedId === oldName) setSelectedId(newName);
  }

  function renameTransition(oldName: string, newName: string) {
    if (oldName === newName || definition.transitions.some((t) => t.name === newName)) return;
    snapshot();
    setDefinition((d) => ({
      ...d,
      transitions: d.transitions.map((t) =>
        t.name === oldName ? { ...t, name: newName } : t,
      ),
    }));
    const oldTid = `t:${oldName}`;
    const newTid = `t:${newName}`;
    setPositions((p) => {
      const { [oldTid]: pos, ...rest } = p;
      return pos ? { ...rest, [newTid]: pos } : rest;
    });
    if (selectedId === oldTid) setSelectedId(newTid);
  }

  return {
    definition,
    nodes,
    edges,
    selectedId,
    setSelectedId,
    canUndo,
    undo,
    loadDefinition,
    newDefinition,
    setName,
    addPlace,
    removePlace,
    addTransition,
    removeTransition,
    addArc,
    removeEdge,
    snapshot,
    updateNodePosition,
    setInitialTokens,
    toggleTerminal,
    setGuard,
    setTimeout,
    setTransitionType,
    setConfig,
    autoLayout,
    renamePlace,
    renameTransition,
  };
}

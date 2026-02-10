import { useState } from "react";
import { useTheme } from "../theme";
import { useDefinitionsApi } from "./useDefinitionsApi";
import { useEditorState } from "./useEditorState";
import { WorkflowList } from "./WorkflowList";
import { EditorToolbar } from "./EditorToolbar";
import { EditorCanvas } from "./EditorCanvas";
import { PropertyPanel } from "./PropertyPanel";
import { EditorAnalysis } from "./EditorAnalysis";
import { NameDialog, ConfirmDialog } from "./Dialog";

export function Editor() {
  const { t } = useTheme();
  const api = useDefinitionsApi();
  const editor = useEditorState();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const isEmpty =
    editor.definition.name === "untitled" &&
    editor.definition.places.length === 0 &&
    editor.definition.transitions.length === 0;

  async function handleSelect(name: string) {
    const def = await api.load(name);
    if (def) {
      editor.loadDefinition(def);
      setSaveError(null);
    }
  }

  function handleNew(name: string) {
    editor.newDefinition(name);
    setSaveError(null);
    setShowNewDialog(false);
  }

  async function handleDelete(name: string) {
    await api.remove(name);
    if (editor.definition.name === name) {
      editor.newDefinition();
    }
    setDeleteTarget(null);
  }

  async function handleSave() {
    setSaveError(null);
    setSaveSuccess(false);
    const result = await api.save(editor.definition);
    if (!result.ok) {
      setSaveError(result.error ?? "Save failed");
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  }

  function handleDeleteNode(id: string) {
    if (id.startsWith("t:")) {
      editor.removeTransition(id.slice(2));
    } else {
      editor.removePlace(id);
    }
  }

  return (
    <div className="flex flex-1 min-h-0">
      <WorkflowList
        names={api.names}
        activeName={editor.definition.name}
        onSelect={handleSelect}
        onNew={() => setShowNewDialog(true)}
        onDelete={setDeleteTarget}
      />
      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className={`text-center px-8 py-6 rounded-lg border ${t(
            "bg-slate-900/80 border-slate-700",
            "bg-white/80 border-slate-200",
          )}`}>
            <p className={`text-sm font-medium mb-1 ${t("text-slate-300", "text-slate-600")}`}>
              No workflow selected
            </p>
            <p className={`text-xs mb-4 ${t("text-slate-500", "text-slate-400")}`}>
              Select a workflow from the sidebar or create a new one
            </p>
            <button
              onClick={() => setShowNewDialog(true)}
              className={`text-xs px-4 py-2 rounded-md font-medium transition-colors cursor-pointer ${t(
                "bg-indigo-600 text-white hover:bg-indigo-500",
                "bg-indigo-600 text-white hover:bg-indigo-500",
              )}`}
            >
              Create Workflow
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 flex flex-col min-w-0">
            <EditorToolbar
              name={editor.definition.name}
              onNameChange={editor.setName}
              onAutoLayout={editor.autoLayout}
              onUndo={editor.undo}
              canUndo={editor.canUndo}
              onSave={handleSave}
              saving={api.loading}
              saveError={saveError}
              saveSuccess={saveSuccess}
            />
            <div className="flex-1">
              <EditorCanvas
                nodes={editor.nodes}
                edges={editor.edges}
                selectedId={editor.selectedId}
                onSelect={editor.setSelectedId}
                onConnect={editor.addArc}
                onNodeDragStart={editor.snapshot}
                onNodeDrag={editor.updateNodePosition}
                onDeleteEdge={editor.removeEdge}
                onDeleteNode={handleDeleteNode}
                onAddPlace={editor.addPlace}
                onAddTransition={editor.addTransition}
                onUndo={editor.undo}
              />
            </div>
          </div>
          <div className={`w-64 border-l flex flex-col gap-4 overflow-y-auto ${t("bg-slate-950 border-slate-800", "bg-slate-50 border-slate-200")}`}>
            <PropertyPanel
              definition={editor.definition}
              selectedId={editor.selectedId}
              onRemovePlace={editor.removePlace}
              onRemoveTransition={editor.removeTransition}
              onSetTokens={editor.setInitialTokens}
              onToggleTerminal={editor.toggleTerminal}
              onSetGuard={editor.setGuard}
              onSetTimeout={editor.setTimeout}
              onSetType={editor.setTransitionType}
              onSetConfig={editor.setConfig}
              onRenamePlace={editor.renamePlace}
              onRenameTransition={editor.renameTransition}
            />
            <div className="px-4 pb-4">
              <EditorAnalysis definition={editor.definition} />
            </div>
          </div>
        </>
      )}

      <NameDialog
        open={showNewDialog}
        title="New Workflow"
        placeholder="Workflow name"
        confirmLabel="Create"
        onConfirm={handleNew}
        onCancel={() => setShowNewDialog(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Workflow"
        message={`Are you sure you want to delete "${deleteTarget}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

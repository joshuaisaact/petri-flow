import { useState } from "react";
import { useTheme } from "../theme";
import { useDefinitionsApi } from "./useDefinitionsApi";
import { useEditorState } from "./useEditorState";
import { WorkflowList } from "./WorkflowList";
import { EditorToolbar } from "./EditorToolbar";
import { EditorCanvas } from "./EditorCanvas";
import { PropertyPanel } from "./PropertyPanel";
import { EditorAnalysis } from "./EditorAnalysis";
import { NameDialog } from "./Dialog";

export function Editor() {
  const { t } = useTheme();
  const api = useDefinitionsApi();
  const editor = useEditorState();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

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
  }

  async function handleSave() {
    setSaveError(null);
    const result = await api.save(editor.definition);
    if (!result.ok) {
      setSaveError(result.error ?? "Save failed");
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
        onDelete={handleDelete}
      />
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
        />
        <div className="flex-1">
          <EditorCanvas
            nodes={editor.nodes}
            edges={editor.edges}
            selectedId={editor.selectedId}
            onSelect={editor.setSelectedId}
            onConnect={editor.addArc}
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
          onRenamePlace={editor.renamePlace}
          onRenameTransition={editor.renameTransition}
        />
        <div className="px-4 pb-4">
          <EditorAnalysis definition={editor.definition} />
        </div>
      </div>

      <NameDialog
        open={showNewDialog}
        title="New Workflow"
        placeholder="Workflow name"
        confirmLabel="Create"
        onConfirm={handleNew}
        onCancel={() => setShowNewDialog(false)}
      />
    </div>
  );
}

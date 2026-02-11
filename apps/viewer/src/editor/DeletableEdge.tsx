import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const onDelete = data?.onDelete as ((id: string) => void) | undefined;
  const hovered = data?.hovered as boolean | undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerEnd}
        interactionWidth={20}
      />
      {hovered && onDelete && (
        <EdgeLabelRenderer>
          <button
            className="nodrag nopan absolute flex items-center justify-center w-4 h-4 rounded-sm bg-red-500 hover:bg-red-400 text-white text-[10px] cursor-pointer leading-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              border: "none",
            }}
            onClick={() => onDelete(id)}
          >
            &times;
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

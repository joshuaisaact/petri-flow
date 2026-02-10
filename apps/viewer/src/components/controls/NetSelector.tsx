import type { ViewerNet } from "../../types";
import { useTheme } from "../../theme";
import { displayName } from "../../utils/displayName";

type Props = {
  nets: ViewerNet[];
  selected: string;
  onSelect: (name: string) => void;
};

export function NetSelector({ nets, selected, onSelect }: Props) {
  const { t } = useTheme();

  return (
    <select
      value={selected}
      onChange={(e) => onSelect(e.target.value)}
      className={`text-xs rounded-md px-2.5 py-1.5 border focus:outline-none focus:ring-1 cursor-pointer ${t(
        "bg-slate-900 border-slate-700 text-slate-300 focus:ring-slate-500",
        "bg-white border-slate-300 text-slate-700 focus:ring-slate-400",
      )}`}
    >
      {nets.map((net) => (
        <option key={net.name} value={net.name}>
          {displayName(net.name)}
        </option>
      ))}
    </select>
  );
}

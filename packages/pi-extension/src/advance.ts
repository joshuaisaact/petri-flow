import { canFire, fire } from "@petriflow/engine";
import type { Marking } from "@petriflow/engine";
import type { GatedTransition, SkillNet } from "./types.js";

/** A structural transition: type=auto, no tools property */
function isStructural<P extends string>(t: GatedTransition<P>): boolean {
  return t.type === "auto" && (t.tools === undefined || t.tools.length === 0);
}

/**
 * Check if two transitions compete for the same input token.
 * Two transitions conflict if they share an input place and the
 * marking doesn't have enough tokens for both.
 */
function hasInputConflict<P extends string>(
  a: GatedTransition<P>,
  b: GatedTransition<P>,
  marking: Marking<P>,
): boolean {
  for (const place of a.inputs) {
    if (b.inputs.includes(place)) {
      // Count how many tokens each needs from this place
      const aNeeds = a.inputs.filter((p) => p === place).length;
      const bNeeds = b.inputs.filter((p) => p === place).length;
      if ((marking[place] ?? 0) < aNeeds + bNeeds) return true;
    }
  }
  return false;
}

/**
 * Auto-advance: fire all enabled structural transitions (type=auto,
 * no tools) in a loop until quiescent.
 *
 * When multiple structural transitions compete for the same input
 * token, none of them fire (avoids ambiguous choices).
 */
export function autoAdvance<P extends string>(
  net: SkillNet<P>,
  marking: Marking<P>,
): Marking<P> {
  let current = { ...marking };

  for (;;) {
    const structural = net.transitions.filter(
      (t) => isStructural(t) && canFire(current, t),
    );
    if (structural.length === 0) break;

    // Filter out transitions that conflict with another enabled one
    const unambiguous = structural.filter((t) =>
      structural.every((other) => other === t || !hasInputConflict(t, other, current)),
    );
    if (unambiguous.length === 0) break;

    for (const t of unambiguous) {
      // Re-check enablement — earlier firings in this batch may have consumed tokens
      if (canFire(current, t)) {
        current = fire(current, t);
      }
    }
  }

  return current;
}

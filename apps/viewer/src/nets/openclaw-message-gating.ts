import { definition } from "@comparisons/openclaw-safety/src/scenarios/message-gating";
import { toNet } from "@petriflow/engine/workflow";
import type { ViewerNet } from "../types";

export const openclawMessageGating: ViewerNet = {
  name: definition.name,
  description:
    "A linear message pipeline. Unknown senders must complete a pairing flow before reaching processing. No structural path bypasses the sender check.",
  definition,
  net: toNet(definition.net),
  placeMetadata: {
    inboundMessage: { category: "default", label: "Inbound Message" },
    senderCheck: { category: "default", label: "Sender Check" },
    unknownSender: { category: "default", label: "Unknown Sender" },
    pairingPrompted: { category: "human", label: "Pairing Prompted" },
    pairingCodeReceived: { category: "human", label: "Pairing Code Received" },
    pairedSender: { category: "default", label: "Paired Sender" },
    processing: { category: "default", label: "Processing" },
    responseDelivered: { category: "terminal", label: "Response Delivered" },
    rejected: { category: "terminal", label: "Rejected" },
  },
  invariants: [
    {
      weights: {
        inboundMessage: 1,
        senderCheck: 1,
        unknownSender: 1,
        pairingPrompted: 1,
        pairingCodeReceived: 1,
        pairedSender: 1,
        processing: 1,
        responseDelivered: 1,
        rejected: 1,
      },
      label: "1-token conservation (sum always 1)",
    },
  ],
  intro: {
    title: "Linear Pipeline Guarantee",
    bullets: [
      "There is no structural path from inboundMessage to processing that bypasses senderCheck — the pipeline is linear.",
      "1-token conservation: exactly one token exists at all times, preventing duplication or loss.",
      "Unknown senders must complete human pairing before reaching processing. A DB allowlist is a runtime check; this is a structural guarantee.",
    ],
    tip: "Watch the single token move through the pipeline. Try the unknown-sender path to see the pairing gate.",
  },
  deriveProperties: (analysis) => {
    const allTerminal = analysis.terminalStates.every(
      (s) =>
        (s["responseDelivered"] ?? 0) > 0 || (s["rejected"] ?? 0) > 0,
    );
    const invariantHolds = analysis.invariants.length > 0 && analysis.invariants[0]!.holds;
    return [
      {
        name: "No direct path to processing",
        holds: true,
        description:
          "No structural path from inboundMessage to processing bypasses senderCheck",
      },
      {
        name: "1-token conservation",
        holds: invariantHolds,
        description: "Exactly one token is present across all places at all times",
      },
      {
        name: "Termination",
        holds: allTerminal && analysis.terminalStates.length > 0,
        description: `All ${analysis.terminalStates.length} terminal states end in responseDelivered or rejected`,
      },
    ];
  },
};

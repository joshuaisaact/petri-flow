import { defineWorkflow } from "@petriflow/engine/workflow";

type Place =
  | "inboundMessage"
  | "senderCheck"
  | "unknownSender"
  | "pairingPrompted"
  | "pairingCodeReceived"
  | "pairedSender"
  | "processing"
  | "responseDelivered"
  | "rejected";

type Ctx = {
  isPaired: boolean;
};

export const definition = defineWorkflow<Place, Ctx>({
  name: "message-gating",
  places: [
    "inboundMessage",
    "senderCheck",
    "unknownSender",
    "pairingPrompted",
    "pairingCodeReceived",
    "pairedSender",
    "processing",
    "responseDelivered",
    "rejected",
  ],
  transitions: [
    // Receive message
    {
      name: "receive",
      type: "automatic",
      inputs: ["inboundMessage"],
      outputs: ["senderCheck"],
      guard: null,
    },

    // Known sender → paired
    {
      name: "identifyKnown",
      type: "automatic",
      inputs: ["senderCheck"],
      outputs: ["pairedSender"],
      guard: "isPaired",
    },

    // Unknown sender → pairing flow
    {
      name: "identifyUnknown",
      type: "automatic",
      inputs: ["senderCheck"],
      outputs: ["unknownSender"],
      guard: "not isPaired",
    },

    // Prompt for pairing code
    {
      name: "promptPairing",
      type: "automatic",
      inputs: ["unknownSender"],
      outputs: ["pairingPrompted"],
      guard: null,
    },

    // User submits pairing code
    {
      name: "submitCode",
      type: "manual",
      inputs: ["pairingPrompted"],
      outputs: ["pairingCodeReceived"],
      guard: null,
    },

    // Valid code → paired
    {
      name: "validateCode",
      type: "automatic",
      inputs: ["pairingCodeReceived"],
      outputs: ["pairedSender"],
      guard: null,
    },

    // Invalid code → rejected
    {
      name: "rejectInvalidCode",
      type: "automatic",
      inputs: ["pairingCodeReceived"],
      outputs: ["rejected"],
      guard: null,
    },

    // Reject unknown sender directly
    {
      name: "rejectUnknown",
      type: "automatic",
      inputs: ["unknownSender"],
      outputs: ["rejected"],
      guard: null,
    },

    // Paired sender proceeds to processing
    {
      name: "authorize",
      type: "automatic",
      inputs: ["pairedSender"],
      outputs: ["processing"],
      guard: null,
    },

    // Process and deliver
    {
      name: "deliverResponse",
      type: "ai",
      inputs: ["processing"],
      outputs: ["responseDelivered"],
      guard: null,
    },
  ],
  initialMarking: {
    inboundMessage: 1,
    senderCheck: 0,
    unknownSender: 0,
    pairingPrompted: 0,
    pairingCodeReceived: 0,
    pairedSender: 0,
    processing: 0,
    responseDelivered: 0,
    rejected: 0,
  },
  initialContext: {
    isPaired: false,
  },
  terminalPlaces: ["responseDelivered", "rejected"],
});

export default definition;

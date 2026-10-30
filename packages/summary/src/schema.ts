export const DECISION_STATUSES = ["decided", "proposed", "tentatively agreed", "unresolved"] as const;
export const ACTION_STATUSES = ["agreed", "proposed", "unconfirmed"] as const;
export const IMPACT_AREAS = ["scope", "schedule", "cost", "risk", "deliverables", "technical approach", "not specified"] as const;

const MAX_LIST = 30;
const stamp = { type: "string", pattern: "^[0-9]{2,3}:[0-9]{2}$" };
const text = { type: "string", minLength: 3 };

const action = {
  type: "object",
  properties: {
    text,
    owner: { type: "string" },
    deadline: { type: "string" },
    status: { enum: ACTION_STATUSES },
    timestamp: stamp,
    quote: { type: "string" },
  },
  required: ["text", "owner", "deadline", "status", "timestamp", "quote"],
};

const decision = {
  type: "object",
  properties: {
    text,
    status: { enum: DECISION_STATUSES },
    impact_area: { enum: IMPACT_AREAS },
    timestamp: stamp,
    quote: { type: "string" },
  },
  required: ["text", "status", "impact_area", "timestamp", "quote"],
};

const impact = {
  type: "object",
  properties: {
    text,
    impact_area: { enum: IMPACT_AREAS },
    basis: { enum: ["stated", "inferred"] },
    timestamp: stamp,
    quote: { type: "string" },
  },
  required: ["text", "impact_area", "basis", "timestamp", "quote"],
};

const openQuestion = {
  type: "object",
  properties: { text, timestamp: stamp, quote: { type: "string" } },
  required: ["text", "timestamp", "quote"],
};

const list = (items: object) => ({ type: "array", items, maxItems: MAX_LIST });

/** The gist comes first so a loop in the lists cannot cost it. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    gist: { type: "string" },
    action_items: list(action),
    decisions: list(decision),
    impacts: list(impact),
    open_questions: list(openQuestion),
  },
  required: ["gist", "action_items", "decisions", "impacts", "open_questions"],
};

export const ACTIONS_ONLY_SCHEMA = {
  type: "object",
  properties: { action_items: list(action) },
  required: ["action_items"],
};

export const DECISIONS_ONLY_SCHEMA = {
  type: "object",
  properties: { decisions: list(decision) },
  required: ["decisions"],
};

export const BRIEF_SCHEMA = {
  type: "object",
  properties: { paragraphs: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 } },
  required: ["paragraphs"],
};

export const FULL_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    main_topics: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, summary: { type: "string" } },
        required: ["title", "summary"],
      },
      minItems: 1,
      maxItems: 8,
    },
  },
  required: ["overview", "main_topics"],
};

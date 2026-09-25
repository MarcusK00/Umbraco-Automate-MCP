/**
 * Canvas Layout
 *
 * Positions an automation's trigger and steps for the backoffice canvas (React Flow).
 *
 * The canvas places nodes by their top-left corner and draws smooth-step edges between
 * handles, so an edge is only straight when the source handle and the target handle
 * share an x coordinate - a few pixels off and it gets a visible sideways jog. Getting
 * that right needs each node's rendered size, which depends on its label, so the
 * geometry below mirrors the Automate canvas's own markup and CSS (identical in 18.2
 * and 18.4): nodes are `min-width: 220px; max-width: 280px` plus a 1px border, the
 * header is icon + label + action bar, action/container nodes always show the 36-char
 * step id chip (so they always hit the max width), If/Approval/container handles sit
 * at 30%/70% of the bottom edge, and Switch handles sit on the right edge, one per row.
 * Widths were measured in the rendered canvas (label font: Lato 700 14px).
 *
 * The layout is a tidy tree from the trigger: every step sits one fixed gap below the
 * lowest of its parents, children are ordered by the parent's outputs (true/false,
 * case order, body/done) and centred under it, a single child from an off-centre
 * output sits right under that output, and each subtree only takes the width it needs.
 * A step with several parents (a join) is placed under the parent directly above it.
 */

import type {
  StepConfigurationModel,
  StepConnectionModel,
} from "../../../api/generated/umbracoAutomateManagementApi.js";
import { getStepOutputs } from "./step-outputs.js";

// Same sentinel as automation-graph.ts (not imported from there, which imports this module).
const TRIGGER_STEP_ID = "00000000-0000-0000-0000-000000000000";

// Spacing between nodes: vertical gap from a parent's bottom edge to a child's top
// edge (room for the add-action button and edge labels), and horizontal gap between
// neighbouring subtrees.
const VERTICAL_GAP = 72;
const HORIZONTAL_GAP = 40;
// A Switch's outputs leave from its right edge, so its children start just right of it.
const SWITCH_CHILD_OFFSET = 32;
// Space kept below every node for its add-action button.
const ADD_BUTTON_ROOM = 28;

const NODE_MIN_WIDTH = 220;
const NODE_MAX_WIDTH = 280;
const NODE_BORDER = 2;
// Header = padding + icon + gaps + label + edit/delete action bar. The edit button
// (28px) is left out for a trigger with no settings.
const HEADER_CHROME = 146;
const EDIT_BUTTON_WIDTH = 28;
// Body = padding + chip padding + monospace (11px) characters.
const BODY_CHROME = 28;
const CHIP_PADDING = 12;
const MONOSPACE_CHAR_WIDTH = 6.6;
// Switch case rows: padding either side of the label.
const SWITCH_ROW_CHROME = 34;
const TRIGGER_TAG_WIDTH = 68.3;

const HEIGHTS = { trigger: 65, action: 115, branch: 117, container: 144 } as const;
const SWITCH_HEADER_HEIGHT = 88;
const SWITCH_ROW_HEIGHT = 45;
const SWITCH_FIRST_HANDLE_Y = 110;

const APPROVAL_ALIAS = "umbracoAutomate.requestApproval";
const BRANCH_ALIASES = new Set(["umbracoAutomate.if", APPROVAL_ALIAS]);
const CONTAINER_ALIASES = new Set(["umbracoAutomate.while", "umbracoAutomate.forEach", "umbracoAutomate.parallel"]);
const SWITCH_ALIAS = "umbracoAutomate.switch";

// Character advance widths for ASCII 32-126, measured in the canvas.
const asciiTable = (csv: string) => csv.split(",").map(Number);
const LABEL_WIDTHS = asciiTable(
  "3.4,3.93,5.54,8.12,8.12,11.47,10.13,2.96,3.84,3.84,5.95,8.12,3.28,5.22,3.33,6.52,8.12,8.12,8.12,8.12,8.12,8.12,8.12,8.12,8.12,8.12,3.6,3.79,8.12,8.12,8.12,6.44,11.81,9.72,9.22,9.26,10.65,8.05,7.92,10.16,10.79,4.15,6.01,9.6,7.27,13.23,10.79,11.31,8.67,11.31,9,7.68,8.4,10.39,9.72,14.71,9.39,9.07,8.48,4.39,6.52,4.39,8.12,6.53,5.6,7.11,7.95,6.75,7.95,7.48,5.02,7.39,7.9,3.56,3.56,7.48,3.48,11.72,7.9,8.04,7.95,7.95,5.22,6.15,5.21,7.9,7.39,11.23,7.31,7.38,6.43,4.28,3.65,4.28,8.12",
);
const CASE_WIDTHS = asciiTable(
  "3.07,3.23,4.45,6.96,6.96,9.62,8.54,2.45,3.2,3.2,5.1,6.96,2.72,4.46,2.83,5.42,6.96,6.96,6.96,6.96,6.96,6.96,6.96,6.96,6.96,6.96,3,3.14,6.96,6.96,6.96,5.37,10.04,8.12,7.76,8.02,9.13,6.93,6.79,8.77,9.16,3.36,5.07,7.95,6.16,11.14,9.16,9.61,7.21,9.61,7.52,6.51,7.09,8.83,8.12,12.43,7.79,7.49,7.22,3.67,5.42,3.67,6.96,5.51,4.8,5.96,6.72,5.73,6.72,6.34,4.21,6.24,6.7,2.88,2.88,6.1,2.83,9.87,6.7,6.8,6.73,6.72,4.37,5.2,4.3,6.69,6.19,9.43,5.98,6.19,5.42,3.61,3.01,3.61,6.96",
);

function textWidth(text: string, table: number[]): number {
  const fallback = table[33 + 1] ?? 8; // "B"-ish width for characters outside ASCII
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code >= 32 && code <= 126 ? table[code - 32] : fallback;
  }
  return width;
}

const clampWidth = (content: number) =>
  Math.min(NODE_MAX_WIDTH, Math.max(NODE_MIN_WIDTH, content)) + NODE_BORDER;

const chipWidth = (text: string | null | undefined) =>
  text ? BODY_CHROME + CHIP_PADDING + text.length * MONOSPACE_CHAR_WIDTH : 0;

interface NodeBox {
  width: number;
  height: number;
  /** Output handle x positions relative to the node's left edge, by output name. */
  outputX: (output: string | null) => number;
  isSwitch: boolean;
}

// The canvas shows the step's name, or the catalogue name when the name is just the alias.
function stepBox(step: StepConfigurationModel, options: CanvasLayoutOptions): NodeBox {
  const label = step.name ?? step.actionAlias;
  const header = textWidth(label, LABEL_WIDTHS) + HEADER_CHROME;

  // Before Request Approval had approved/rejected outputs the canvas drew it as a plain action.
  const isBranch =
    BRANCH_ALIASES.has(step.actionAlias) && (step.actionAlias !== APPROVAL_ALIAS || options.approvalOutcomes !== false);
  if (isBranch) {
    const width = clampWidth(Math.max(header, chipWidth(step.alias)));
    const [first] = getStepOutputs(step) ?? [];
    return {
      width,
      height: HEIGHTS.branch,
      outputX: (o) => (o === first ? 0.3 : 0.7) * width,
      isSwitch: false,
    };
  }
  if (CONTAINER_ALIASES.has(step.actionAlias)) {
    const width = NODE_MAX_WIDTH + NODE_BORDER;
    return { width, height: HEIGHTS.container, outputX: (o) => (o === "done" ? 0.7 : 0.3) * width, isSwitch: false };
  }
  if (step.actionAlias === SWITCH_ALIAS) {
    const outputs = getStepOutputs(step) ?? ["default"];
    const rows = Math.max(0, ...outputs.map((o) => SWITCH_ROW_CHROME + textWidth(o, CASE_WIDTHS)));
    const width = clampWidth(Math.max(header, chipWidth(step.alias), rows));
    return { width, height: SWITCH_HEADER_HEIGHT + SWITCH_ROW_HEIGHT * outputs.length, outputX: () => width, isSwitch: true };
  }
  const width = NODE_MAX_WIDTH + NODE_BORDER;
  return { width, height: HEIGHTS.action, outputX: () => width / 2, isSwitch: false };
}

/** How the canvas labels the trigger node: catalogue name (or alias) and whether it shows an edit button. */
export interface TriggerLabel {
  name: string;
  hasSettings: boolean;
}

function triggerBox({ name, hasSettings }: TriggerLabel): NodeBox {
  const chrome = HEADER_CHROME - (hasSettings ? 0 : EDIT_BUTTON_WIDTH);
  const width = clampWidth(Math.max(textWidth(name, LABEL_WIDTHS), TRIGGER_TAG_WIDTH) + chrome);
  return { width, height: HEIGHTS.trigger, outputX: () => width / 2, isSwitch: false };
}

/** Y of each Switch output handle, relative to the node's top (for callers that need it). */
export const switchHandleY = (index: number) => SWITCH_FIRST_HANDLE_Y + SWITCH_ROW_HEIGHT * index;

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface CanvasLayoutOptions {
  /** Whether Request Approval steps have approved/rejected outputs (Automate 17.2 / 18.2+). Defaults to true. */
  approvalOutcomes?: boolean;
}

export interface CanvasLayout {
  stepPositions: Record<string, { x: number; y: number }>;
  triggerPosition: { x: number; y: number };
}

export function computeCanvasLayout(
  steps: StepConfigurationModel[],
  connections: StepConnectionModel[],
  triggerLabel: TriggerLabel,
  options: CanvasLayoutOptions = {},
): CanvasLayout {
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const boxes = new Map<string, NodeBox>(steps.map((s) => [s.id, stepBox(s, options)]));
  boxes.set(TRIGGER_STEP_ID, triggerBox(triggerLabel));

  // Outgoing connections per node, ordered by the source's outputs (then as saved).
  const outputRank = (sourceId: string, c: StepConnectionModel) => {
    const outputs = stepById.has(sourceId) ? getStepOutputs(stepById.get(sourceId)!) : undefined;
    const name = c.sourceHandle ?? c.outcome ?? null;
    const rank = outputs && name ? outputs.indexOf(name) : -1;
    return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
  };
  const outgoing = new Map<string, StepConnectionModel[]>();
  const incoming = new Map<string, StepConnectionModel[]>();
  connections.forEach((c) => {
    if (!boxes.has(c.sourceStepId) || !stepById.has(c.targetStepId)) return;
    (outgoing.get(c.sourceStepId) ?? outgoing.set(c.sourceStepId, []).get(c.sourceStepId)!).push(c);
    (incoming.get(c.targetStepId) ?? incoming.set(c.targetStepId, []).get(c.targetStepId)!).push(c);
  });
  for (const [sourceId, list] of outgoing) {
    const order = new Map(list.map((c, i) => [c, i]));
    list.sort((a, b) => outputRank(sourceId, a) - outputRank(sourceId, b) || order.get(a)! - order.get(b)!);
  }

  // Top edge of every reachable node: one gap below the lowest parent (Kahn's order, so
  // joins wait for all parents). Nodes on a cycle or not reachable from the trigger stay unset.
  const top = new Map<string, number>([[TRIGGER_STEP_ID, 0]]);
  const pending = new Map(steps.map((s) => [s.id, incoming.get(s.id)?.length ?? 0]));
  const queue = [TRIGGER_STEP_ID];
  while (queue.length) {
    const id = queue.shift()!;
    const bottom = top.get(id)! + boxes.get(id)!.height;
    for (const c of outgoing.get(id) ?? []) {
      top.set(c.targetStepId, Math.max(top.get(c.targetStepId) ?? 0, bottom + VERTICAL_GAP));
      const left = pending.get(c.targetStepId)! - 1;
      pending.set(c.targetStepId, left);
      if (left === 0) queue.push(c.targetStepId);
    }
  }
  const reached = (id: string) => id === TRIGGER_STEP_ID || (pending.get(id) === 0 && top.has(id));

  // Tree: each step hangs off the reachable parent directly above it (the lowest one).
  const treeChildren = new Map<string, { id: string; output: string | null }[]>();
  for (const step of steps) {
    if (!reached(step.id)) continue;
    const parents = (incoming.get(step.id) ?? []).filter((c) => reached(c.sourceStepId));
    const primary = parents.reduce<StepConnectionModel | undefined>((best, c) => {
      const bottom = (c: StepConnectionModel) => top.get(c.sourceStepId)! + boxes.get(c.sourceStepId)!.height;
      return !best || bottom(c) > bottom(best) ? c : best;
    }, undefined);
    if (primary) {
      const list = treeChildren.get(primary.sourceStepId) ?? [];
      list.push({ id: step.id, output: primary.sourceHandle ?? primary.outcome ?? null });
      treeChildren.set(primary.sourceStepId, list);
    }
  }
  for (const [parentId, list] of treeChildren) {
    const rank = new Map((outgoing.get(parentId) ?? []).map((c, i) => [c.targetStepId, i]));
    list.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }

  // Bottom-up: where each child's centre sits relative to its parent's centre. Each
  // subtree is kept as the boxes it occupies (x relative to its root's centre, y
  // absolute): its nodes, plus the corridor its edges run through down to its
  // children. Siblings are packed left to right as close as those boxes allow where
  // they overlap vertically, so a short branch can tuck in beside a deep one without
  // any node landing on another node or across an edge.
  const offset = new Map<string, number>();
  const shiftBoxes = (boxes: Box[], dx: number) => boxes.map((b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx }));
  const measure = (id: string): Box[] => {
    const box = boxes.get(id)!;
    const nodeTop = top.get(id)!;
    const own: Box = { x0: -box.width / 2, x1: box.width / 2, y0: nodeTop, y1: nodeTop + box.height + ADD_BUTTON_ROOM };
    const children = treeChildren.get(id) ?? [];
    if (!children.length) return [own];
    const childBoxes = children.map((c) => measure(c.id));

    let centres: number[];
    if (children.length === 1 && !box.isSwitch) {
      centres = [box.outputX(children[0].output) - box.width / 2];
    } else {
      centres = [0];
      let placed = childBoxes[0];
      for (let i = 1; i < children.length; i++) {
        const previous = boxes.get(children[i - 1].id)!.width;
        let centre = centres[i - 1] + (previous + boxes.get(children[i].id)!.width) / 2 + HORIZONTAL_GAP;
        for (const a of placed) {
          for (const b of childBoxes[i]) {
            if (a.y0 < b.y1 && b.y0 < a.y1) centre = Math.max(centre, a.x1 + HORIZONTAL_GAP - b.x0);
          }
        }
        centres.push(centre);
        placed = placed.concat(shiftBoxes(childBoxes[i], centre));
      }
      const shift = box.isSwitch
        ? box.width / 2 + SWITCH_CHILD_OFFSET - centres[0]
        : -(centres[0] + centres[centres.length - 1]) / 2;
      centres = centres.map((x) => x + shift);
    }

    children.forEach((c, i) => offset.set(c.id, centres[i]));
    const handles = children.map((c) => box.outputX(c.output) - box.width / 2);
    const corridor: Box = {
      x0: Math.min(...centres, ...handles),
      x1: Math.max(...centres, ...handles),
      y0: nodeTop + (box.isSwitch ? SWITCH_FIRST_HANDLE_Y : box.height),
      y1: Math.min(...children.map((c) => top.get(c.id)!)),
    };
    return [own, corridor, ...childBoxes.flatMap((b, i) => shiftBoxes(b, centres[i]))];
  };
  const treeBoxes = measure(TRIGGER_STEP_ID);
  const treeExtent = { left: Math.min(...treeBoxes.map((b) => b.x0)) };

  // Top-down: absolute centres, then top-left positions.
  const centre = new Map<string, number>([[TRIGGER_STEP_ID, 0]]);
  const place = (id: string) => {
    for (const c of treeChildren.get(id) ?? []) {
      centre.set(c.id, centre.get(id)! + offset.get(c.id)!);
      place(c.id);
    }
  };
  place(TRIGGER_STEP_ID);

  const stepPositions: Record<string, { x: number; y: number }> = {};
  let lowest: number = HEIGHTS.trigger;
  for (const [id, x] of centre) {
    if (id === TRIGGER_STEP_ID) continue;
    const box = boxes.get(id)!;
    stepPositions[id] = { x: Math.round(x - box.width / 2), y: Math.round(top.get(id)!) };
    lowest = Math.max(lowest, top.get(id)! + box.height);
  }

  // Steps not reachable from the trigger (not connected yet, or on a cycle): one row
  // below everything, starting at the left edge of the tree.
  const loose = steps.filter((s) => !centre.has(s.id));
  let cursor = Math.min(treeExtent.left, -boxes.get(TRIGGER_STEP_ID)!.width / 2);
  for (const step of loose) {
    stepPositions[step.id] = { x: Math.round(cursor), y: Math.round(lowest + VERTICAL_GAP * 2) };
    cursor += boxes.get(step.id)!.width + HORIZONTAL_GAP;
  }

  const trigger = boxes.get(TRIGGER_STEP_ID)!;
  return { stepPositions, triggerPosition: { x: Math.round(-trigger.width / 2), y: 0 } };
}

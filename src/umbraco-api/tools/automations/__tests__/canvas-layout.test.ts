import { computeCanvasLayout } from "../_shared/canvas-layout.js";
import type {
  StepConfigurationModel,
  StepConnectionModel,
} from "../../../api/generated/umbracoAutomateManagementApi.js";

const TRIGGER = "00000000-0000-0000-0000-000000000000";
const ACTION_WIDTH = 282;
const ACTION_HEIGHT = 115;

const step = (id: string, actionAlias = "umbracoAutomate.logMessage", settings: Record<string, unknown> = {}): StepConfigurationModel => ({
  id,
  actionAlias,
  name: id,
  alias: id,
  settings,
  inputMappings: {},
  position: { x: 0, y: 0 },
  errorBehavior: "Terminate",
  retryInterval: null,
  maxRetries: null,
});
const edge = (sourceStepId: string, targetStepId: string, output: string | null = null): StepConnectionModel => ({
  sourceStepId,
  sourceHandle: output,
  targetStepId,
  targetHandle: null,
  outcome: output,
  filter: null,
});
const cond = { Groups: [{ Conditions: [{ LeftOperand: "x", Operator: "Equals", RightOperand: "x" }] }] };
const centre = (p: { x: number }, width = ACTION_WIDTH) => p.x + width / 2;
const MANUAL = { name: "Manual Trigger", hasSettings: false };

describe("computeCanvasLayout", () => {
  it("should centre a chain on the trigger so every edge in it is straight", () => {
    const layout = computeCanvasLayout([step("a"), step("b")], [edge(TRIGGER, "a"), edge("a", "b")], MANUAL);

    expect(layout.stepPositions.a).toEqual({ x: -ACTION_WIDTH / 2, y: 137 });
    expect(layout.stepPositions.b).toEqual({ x: -ACTION_WIDTH / 2, y: 137 + ACTION_HEIGHT + 72 });
    expect(layout.triggerPosition.y).toBe(0);
    // Trigger width follows its label, clamped to the canvas's 220-280px (+2px border).
    expect(layout.triggerPosition.x).toBeGreaterThanOrEqual(-141);
    expect(layout.triggerPosition.x).toBeLessThanOrEqual(-111);
  });

  it("should place If branches in output order, symmetric under the If", () => {
    const steps = [step("check", "umbracoAutomate.if", { conditions: cond }), step("yes"), step("no")];
    // Connected false-first, to prove ordering follows the outputs rather than save order.
    const layout = computeCanvasLayout(steps, [edge(TRIGGER, "check"), edge("check", "no", "false"), edge("check", "yes", "true")], MANUAL);
    const { check, yes, no } = layout.stepPositions;

    expect(yes.x).toBeLessThan(no.x);
    expect(yes.y).toBe(no.y);
    expect(no.x - yes.x).toBeGreaterThanOrEqual(ACTION_WIDTH);
    // The If is centred on x=0 under the trigger, and its two children mirror each other.
    expect(check.x).toBeLessThan(0);
    expect(centre(yes) + centre(no)).toBeCloseTo(0, 0);
  });

  it("should lay out Request Approval as a plain action when it has no approved/rejected outputs", () => {
    const steps = [step("approve", "umbracoAutomate.requestApproval"), step("after")];
    const connections = [edge(TRIGGER, "approve"), edge("approve", "after")];

    // Automate before 17.2 / 18.2: one centred handle, so the chain is straight.
    const plain = computeCanvasLayout(steps, connections, MANUAL, { approvalOutcomes: false });
    expect(plain.stepPositions.approve).toEqual({ x: -ACTION_WIDTH / 2, y: 137 });
    expect(centre(plain.stepPositions.after)).toBeCloseTo(0, 5);
    expect(plain.stepPositions.after.y).toBe(137 + ACTION_HEIGHT + 72);

    // With outputs it is a branch node, and the default keeps that.
    const branch = computeCanvasLayout(steps, [edge(TRIGGER, "approve"), edge("approve", "after", "approved")], MANUAL);
    expect(centre(branch.stepPositions.after)).not.toBeCloseTo(0, 0);
  });

  it("should put a lone branch child directly under the output it leaves from", () => {
    const steps = [step("check", "umbracoAutomate.if", { conditions: cond }), step("no")];
    const layout = computeCanvasLayout(steps, [edge(TRIGGER, "check"), edge("check", "no", "false")], MANUAL);
    const ifLeft = layout.stepPositions.check.x;
    const ifWidth = -2 * ifLeft; // centred on x=0

    // The canvas draws the false handle at 70% of the If's width.
    expect(centre(layout.stepPositions.no)).toBeCloseTo(ifLeft + 0.7 * ifWidth, 0);
  });

  it("should put a container's body and done steps under their outputs, body first", () => {
    const steps = [step("loop", "umbracoAutomate.while", { conditions: cond }), step("inside"), step("after")];
    const layout = computeCanvasLayout(steps, [edge(TRIGGER, "loop"), edge("loop", "after", "done"), edge("loop", "inside", "body")], MANUAL);

    expect(layout.stepPositions.inside.x).toBeLessThan(layout.stepPositions.after.x);
  });

  it("should start Switch children to the right of the Switch, in case order", () => {
    const cases = [{ Name: "one", Conditions: cond }, { Name: "two", Conditions: cond }];
    const steps = [step("route", "umbracoAutomate.switch", { cases }), step("a"), step("b"), step("fallback")];
    const layout = computeCanvasLayout(
      steps,
      [edge(TRIGGER, "route"), edge("route", "fallback", "default"), edge("route", "b", "two"), edge("route", "a", "one")],
      MANUAL,
    );
    const { route, a, b, fallback } = layout.stepPositions;
    const switchRight = route.x + -2 * route.x; // centred on x=0

    expect(centre(a)).toBeGreaterThan(switchRight);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(fallback.x);
    // Below the Switch, which grows 45px per output row (2 cases + default).
    expect(a.y).toBe(137 + 88 + 45 * 3 + 72);
  });

  it("should never overlap nodes in a large branching graph", () => {
    const cases = ["danish", "english", "german"].map((Name) => ({ Name, Conditions: cond }));
    const steps = [
      step("start"), step("check", "umbracoAutomate.if", { conditions: cond }), step("notify"), step("details"),
      step("route", "umbracoAutomate.switch", { cases }), step("danish"), step("crm"), step("english"), step("german"),
      step("none"), step("other"), step("loop", "umbracoAutomate.while", { conditions: cond }), step("inside"), step("after"), step("audit"),
    ];
    const connections = [
      edge(TRIGGER, "start"), edge("start", "check"), edge("check", "notify", "true"), edge("notify", "details"), edge("details", "route"),
      edge("route", "danish", "danish"), edge("danish", "crm"), edge("route", "english", "english"), edge("route", "german", "german"),
      edge("route", "none", "default"), edge("check", "other", "false"), edge("other", "loop"), edge("loop", "inside", "body"),
      edge("loop", "after", "done"), edge("crm", "audit"), edge("after", "audit"),
    ];
    const layout = computeCanvasLayout(steps, connections, { name: "Content Published", hasSettings: false });
    // Generous size bound per node (widest node, tallest Switch here), for the overlap check.
    const rects = Object.entries(layout.stepPositions).map(([id, p]) => ({ id, ...p, w: ACTION_WIDTH, h: id === "route" ? 268 : 144 }));

    for (const r of rects) {
      for (const o of rects) {
        if (r.id >= o.id) continue;
        const overlaps = r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h;
        expect({ pair: [r.id, o.id], overlaps }).toEqual({ pair: [r.id, o.id], overlaps: false });
      }
    }
    // A join sits below both of its parents.
    expect(layout.stepPositions.audit.y).toBeGreaterThan(layout.stepPositions.crm.y);
    expect(layout.stepPositions.audit.y).toBeGreaterThan(layout.stepPositions.after.y);
  });

  it("should size the trigger like the canvas does, so it centres over the first step", () => {
    // Widths measured in the rendered canvas: "Manual Trigger" (no settings, so no edit
    // button) renders at the 222px minimum, "Content Published" with an edit button at 263px.
    const manual = computeCanvasLayout([step("a")], [edge(TRIGGER, "a")], MANUAL);
    const published = computeCanvasLayout([step("a")], [edge(TRIGGER, "a")], { name: "Content Published", hasSettings: true });

    // The step is centred on x=0, so the trigger's centre (left + measured width / 2) should be too.
    expect(Math.abs(manual.triggerPosition.x + 222 / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(published.triggerPosition.x + 263 / 2)).toBeLessThanOrEqual(1);
  });

  it("should park steps that are not connected yet in a row below the graph", () => {
    const layout = computeCanvasLayout([step("a"), step("loose")], [edge(TRIGGER, "a")], MANUAL);

    expect(layout.stepPositions.loose.y).toBeGreaterThan(layout.stepPositions.a.y + ACTION_HEIGHT);
  });
});

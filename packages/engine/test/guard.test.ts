import { describe, it, expect } from "bun:test";
import { compileGuard } from "../src/guard.js";

describe("compileGuard", () => {
  it("numeric comparison: waterTemp >= 90", () => {
    const guard = compileGuard("waterTemp >= 90");
    expect(guard({ waterTemp: 96 }, {})).toBe(true);
    expect(guard({ waterTemp: 80 }, {})).toBe(false);
    expect(guard({ waterTemp: 90 }, {})).toBe(true);
  });

  it("boolean field: approved", () => {
    const guard = compileGuard("approved");
    expect(guard({ approved: true }, {})).toBe(true);
    expect(guard({ approved: false }, {})).toBe(false);
  });

  it("boolean logic: paid and approved", () => {
    const guard = compileGuard("paid and approved");
    expect(guard({ paid: true, approved: true }, {})).toBe(true);
    expect(guard({ paid: true, approved: false }, {})).toBe(false);
    expect(guard({ paid: false, approved: true }, {})).toBe(false);
  });

  it("marking access: marking.inventory == 0", () => {
    const guard = compileGuard("marking.inventory == 0");
    expect(guard({}, { inventory: 0 })).toBe(true);
    expect(guard({}, { inventory: 3 })).toBe(false);
  });

  it("always-false: 0", () => {
    const guard = compileGuard("0");
    expect(guard({}, {})).toBe(false);
  });

  it("invalid expression throws at compile time", () => {
    expect(() => compileGuard("@@@")).toThrow();
  });
});

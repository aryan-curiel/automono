import { describe, expect, it } from "vitest";
import { HOME, parseHash, toHash } from "./hashRoute";

describe("parseHash", () => {
  it("returns dashboard for an empty or bare hash", () => {
    expect(parseHash("")).toEqual(HOME);
    expect(parseHash("#")).toEqual(HOME);
    expect(parseHash("#/")).toEqual(HOME);
  });

  it("parses a screen with no id", () => {
    expect(parseHash("#/facturas")).toEqual({ screen: "facturas", id: null });
  });

  it("parses a screen with a record id", () => {
    expect(parseHash("#/factura-detalle/12")).toEqual({
      screen: "factura-detalle",
      id: "12",
    });
  });

  it("keeps a non-numeric id (e.g. a quarter key)", () => {
    expect(parseHash("#/resumen-trimestral/2025-Q1")).toEqual({
      screen: "resumen-trimestral",
      id: "2025-Q1",
    });
  });

  it("falls back to dashboard for an unknown screen", () => {
    expect(parseHash("#/not-a-screen/9")).toEqual(HOME);
  });

  it("decodes a percent-encoded id", () => {
    expect(parseHash("#/resumen-trimestral/a%2Fb")).toEqual({
      screen: "resumen-trimestral",
      id: "a/b",
    });
  });
});

describe("toHash", () => {
  it("round-trips a screen with and without an id", () => {
    for (const hash of ["#/dashboard", "#/factura-detalle/12", "#/gastos"]) {
      expect(toHash(parseHash(hash))).toBe(hash);
    }
  });

  it("omits the id segment when there is none", () => {
    expect(toHash({ screen: "clientes", id: null })).toBe("#/clientes");
  });

  it("encodes an id with a slash", () => {
    expect(toHash({ screen: "resumen-trimestral", id: "a/b" })).toBe("#/resumen-trimestral/a%2Fb");
  });
});

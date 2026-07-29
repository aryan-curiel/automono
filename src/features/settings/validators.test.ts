import { describe, expect, it } from "vitest";
import { isValidIban } from "./validators";

describe("isValidIban", () => {
  it("accepts a valid German IBAN", () => {
    expect(isValidIban("DE89370400440532013000")).toBe(true);
  });

  it("accepts a valid Spanish IBAN with spaces", () => {
    expect(isValidIban("ES91 2100 0418 4502 0005 1332")).toBe(true);
  });

  it("accepts a valid UK IBAN", () => {
    expect(isValidIban("GB29NWBK60161331926819")).toBe(true);
  });

  it("accepts lowercase input", () => {
    expect(isValidIban("de89370400440532013000")).toBe(true);
  });

  it("rejects a checksum-broken IBAN", () => {
    expect(isValidIban("DE89370400440532013001")).toBe(false);
  });

  it("rejects a value missing the country prefix", () => {
    expect(isValidIban("370400440532013000")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidIban("")).toBe(false);
  });
});

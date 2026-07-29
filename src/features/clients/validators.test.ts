import { describe, expect, it } from "vitest";
import { isValidInvoicePrefix, isValidNifCif, isValidVatNumber } from "./validators";

describe("isValidNifCif", () => {
  it("accepts a valid DNI", () => {
    expect(isValidNifCif("12345678Z")).toBe(true);
  });

  it("accepts a valid NIE", () => {
    expect(isValidNifCif("X1234567L")).toBe(true);
  });

  it("accepts a valid CIF", () => {
    expect(isValidNifCif("B12345678")).toBe(true);
  });

  it("accepts lowercase input", () => {
    expect(isValidNifCif("b12345678")).toBe(true);
  });

  it("accepts a plain foreign tax number (e.g. Bulgarian)", () => {
    expect(isValidNifCif("123456789")).toBe(true);
  });

  it("rejects a value that is too short", () => {
    expect(isValidNifCif("1234")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidNifCif("")).toBe(false);
  });
});

describe("isValidVatNumber", () => {
  it("accepts an empty string (field is optional)", () => {
    expect(isValidVatNumber("")).toBe(true);
  });

  it("accepts a valid EU VAT number", () => {
    expect(isValidVatNumber("BG123456789")).toBe(true);
  });

  it("accepts lowercase input", () => {
    expect(isValidVatNumber("bg123456789")).toBe(true);
  });

  it("rejects a value missing the country prefix", () => {
    expect(isValidVatNumber("123456789")).toBe(false);
  });

  it("rejects a value with digits in the country prefix", () => {
    expect(isValidVatNumber("1G123456789")).toBe(false);
  });
});

describe("isValidInvoicePrefix", () => {
  it("accepts three uppercase letters", () => {
    expect(isValidInvoicePrefix("IMO")).toBe(true);
  });

  it("accepts lowercase and normalizes", () => {
    expect(isValidInvoicePrefix("imo")).toBe(true);
  });

  it("rejects fewer than three letters", () => {
    expect(isValidInvoicePrefix("AB")).toBe(false);
  });

  it("rejects more than three letters", () => {
    expect(isValidInvoicePrefix("ABCD")).toBe(false);
  });

  it("rejects digits", () => {
    expect(isValidInvoicePrefix("AB1")).toBe(false);
  });
});

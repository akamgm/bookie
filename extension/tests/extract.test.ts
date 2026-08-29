import { describe, expect, test } from "bun:test";
import "../lib/extract.js";

const extractor = (globalThis as any).BookieExtractor;

describe("book page metadata helpers", () => {
  test("normalizes ISBN punctuation and direction markers", () => {
    expect(extractor.isbn("978-0-525-55947-4")).toBe("9780525559474");
    expect(extractor.isbn("\u200e 0-525-55949-3")).toBe("0525559493");
  });

  test("rejects values that are not ISBN-shaped", () => {
    expect(extractor.isbn("B0D1234567")).toBe("");
    expect(extractor.isbn("1234")).toBe("");
  });

  test("collapses publisher whitespace", () => {
    expect(extractor.clean("  Ursula   K. Le Guin\n")).toBe("Ursula K. Le Guin");
  });
});

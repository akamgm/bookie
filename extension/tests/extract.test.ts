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

  test("recognizes supported bookstore and book-sharing subdomains", () => {
    expect(extractor.siteProfile("www.goodreads.com")?.hosts).toContain("goodreads.com");
    expect(extractor.siteProfile("app.thestorygraph.com")?.hosts).toContain("thestorygraph.com");
    expect(extractor.siteProfile("books.google.com")?.hosts).toContain("books.google.com");
    expect(extractor.siteProfile("www.barnesandnoble.com")?.hosts).toContain(
      "barnesandnoble.com",
    );
    expect(extractor.siteProfile("example.com")).toBeUndefined();
  });

  test("classifies generic structured ISBN values by length", () => {
    expect(
      extractor.splitIsbns(["978-0-525-55947-4", "0-525-55949-3"]),
    ).toEqual({
      isbn10: "0525559493",
      isbn13: "9780525559474",
    });
  });
});

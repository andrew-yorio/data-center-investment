import { describe, expect, it } from "vitest";
import { domainAcceptsMail, typoDomainSuggestion } from "./mx";

const dns = (body: unknown, ok = true) => (async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;

describe("domainAcceptsMail", () => {
  it("accepts a domain with an MX record", async () => {
    expect(await domainAcceptsMail("a@gmail.com", dns({ Status: 0, Answer: [{ type: 15, data: "5 gmail-smtp-in.l.google.com." }] }))).toBe(true);
  });
  it("rejects a domain that doesn't exist", async () => {
    expect(await domainAcceptsMail("a@gmial.con", dns({ Status: 3 }))).toBe(false);
  });
  it("rejects a domain with no MX record", async () => {
    expect(await domainAcceptsMail("a@example.org", dns({ Status: 0, Answer: [] }))).toBe(false);
  });
  it("rejects a null MX", async () => {
    expect(await domainAcceptsMail("a@example.com", dns({ Status: 0, Answer: [{ type: 15, data: "0 ." }] }))).toBe(false);
  });
  it("suggests the right domain for common provider typos", () => {
    expect(typoDomainSuggestion("ada@Gmial.com")).toBe("gmail.com");
    expect(typoDomainSuggestion("ada@gmail.com")).toBeNull();
  });
  it("fails open when the resolver errors", async () => {
    expect(await domainAcceptsMail("a@x.com", dns({}, false))).toBe(true);
    expect(await domainAcceptsMail("a@x.com", (async () => { throw new Error("net"); }) as unknown as typeof fetch)).toBe(true);
  });
});

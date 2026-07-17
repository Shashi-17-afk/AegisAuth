import { describe, expect, it } from "vitest";
import { maskIpAddress, normalizeIpAddress } from "./net.js";

describe("IP normalization", () => {
  it("normalizes IPv4-mapped IPv6", () => {
    expect(normalizeIpAddress("::ffff:203.0.113.10")).toBe("203.0.113.10");
  });

  it("masks IPv4 for display", () => {
    expect(maskIpAddress("203.0.113.10")).toBe("203.0.113.xxx");
  });
});

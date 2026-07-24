import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("local host validation", () => {
  it("accepts loopback host names", () => {
    const response = proxy(
      new NextRequest("http://localhost/", {
        headers: { host: "localhost:3000" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects an unrecognised Host header", async () => {
    const response = proxy(
      new NextRequest("http://localhost/", {
        headers: { host: "attacker.example" },
      }),
    );
    expect(response.status).toBe(421);
    expect(await response.text()).toBe("Unrecognised host");
  });
});

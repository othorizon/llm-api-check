import { describe, expect, it } from "vitest";
import { addressSpaceOf, fetchInitFor } from "@/lib/llm/network";

describe("address space classification", () => {
  it("recognises loopback, local and public hosts", () => {
    expect(addressSpaceOf("localhost")).toBe("loopback");
    expect(addressSpaceOf("app.localhost")).toBe("loopback");
    expect(addressSpaceOf("127.0.0.1")).toBe("loopback");
    expect(addressSpaceOf("[::1]")).toBe("loopback");
    expect(addressSpaceOf("192.168.1.10")).toBe("local");
    expect(addressSpaceOf("10.0.0.5")).toBe("local");
    expect(addressSpaceOf("172.20.3.4")).toBe("local");
    expect(addressSpaceOf("172.32.0.1")).toBe("public");
    expect(addressSpaceOf("nas")).toBe("local");
    expect(addressSpaceOf("gpu-box.lan")).toBe("local");
    expect(addressSpaceOf("api.deepseek.com")).toBe("public");
    expect(addressSpaceOf("fd12:3456::1")).toBe("local");
  });
  it("adds the Local Network Access hint only for plain-http local addresses", () => {
    expect(fetchInitFor("http://192.168.1.10:8000/v1/chat/completions")).toEqual({ targetAddressSpace: "local" });
    expect(fetchInitFor("https://192.168.1.10:8000/v1")).toEqual({});
    expect(fetchInitFor("http://localhost:11434/v1")).toEqual({});
    expect(fetchInitFor("http://example.com/v1")).toEqual({});
  });
});

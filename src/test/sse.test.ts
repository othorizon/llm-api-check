import { describe, expect, it } from "vitest";
import { createSseParser, iterateSse } from "@/lib/llm/sse";

describe("SSE parser", () => {
  it("parses events split across chunks with CRLF", () => {
    const events: string[] = [];
    const p = createSseParser((e) => events.push(e.data));
    p.feed('data: {"a":1}\r\n\r\nda');
    p.feed('ta: {"b":2}\r\n\r\n: keep-alive\r\n\r\ndata: [DONE]\r\n\r\n');
    p.end();
    expect(events).toEqual(['{"a":1}', '{"b":2}', "[DONE]"]);
  });
  it("joins multi-line data fields", () => {
    const events: string[] = [];
    const p = createSseParser((e) => events.push(e.data));
    p.feed("data: line1\ndata: line2\n\n");
    expect(events).toEqual(["line1\nline2"]);
  });
  it("iterates a ReadableStream", async () => {
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode("data: 1\n\n"));
        c.enqueue(enc.encode("data: 2\n\ndata: 3"));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const ev of iterateSse(stream)) out.push(ev.data);
    expect(out).toEqual(["1", "2", "3"]);
  });
});

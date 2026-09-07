/**
 * Minimal, robust Server-Sent Events parser for fetch() bodies.
 * Handles CRLF/LF, multi-line `data:` fields, comments and partial chunks.
 */
export interface SseEvent {
  event: string | null;
  data: string;
  id: string | null;
}

export function createSseParser(onEvent: (ev: SseEvent) => void) {
  let buffer = "";
  let dataLines: string[] = [];
  let eventName: string | null = null;
  let id: string | null = null;

  const dispatch = () => {
    if (dataLines.length === 0 && eventName === null) return;
    onEvent({ event: eventName, data: dataLines.join("\n"), id });
    dataLines = [];
    eventName = null;
  };

  const handleLine = (line: string) => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return; // comment / keep-alive
    const colon = line.indexOf(":");
    let field: string, value: string;
    if (colon === -1) {
      field = line;
      value = "";
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
    }
    switch (field) {
      case "data":
        dataLines.push(value);
        break;
      case "event":
        eventName = value;
        break;
      case "id":
        id = value;
        break;
      default:
        break; // retry / unknown fields ignored
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      let idx: number;
      // Process complete lines. A line ends with \n, \r\n or \r.
      while ((idx = buffer.search(/\r\n|\n|\r/)) !== -1) {
        const line = buffer.slice(0, idx);
        const sepLen = buffer[idx] === "\r" && buffer[idx + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(idx + sepLen);
        handleLine(line);
      }
    },
    /** Flush any trailing data without a final blank line. */
    end() {
      if (buffer.length > 0) {
        handleLine(buffer);
        buffer = "";
      }
      dispatch();
    },
  };
}

/** Convenience: async-iterate SSE events over a fetch Response body. */
export async function* iterateSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const queue: SseEvent[] = [];
  const parser = createSseParser((ev) => queue.push(ev));
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
      while (queue.length) yield queue.shift()!;
    }
    parser.feed(decoder.decode());
    parser.end();
    while (queue.length) yield queue.shift()!;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

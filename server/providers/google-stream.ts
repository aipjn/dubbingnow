import { requireValue } from "../errors";

/** Extract only closed objects from a named root array; quoted braces are data. */
export class JsonArrayObjects {
  text = "";
  private stack: string[] = [];
  private cursor = 0;
  private quoted = false;
  private escaped = false;
  private stringStart = 0;
  private rootKey = "";
  private expectKey = false;
  private inArray = false;
  private objectStart = -1;
  push(delta: string): unknown[] {
    this.text += delta;
    const objects: unknown[] = [];
    for (; this.cursor < this.text.length; this.cursor++) {
      const c = this.text[this.cursor];
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (c === "\\") this.escaped = true;
        else if (c === '"') {
          this.quoted = false;
          if (this.stack.length === 1 && this.expectKey) {
            this.rootKey = JSON.parse(
              this.text.slice(this.stringStart, this.cursor + 1),
            );
            this.expectKey = false;
          }
        }
        continue;
      }
      if (c === '"') {
        this.quoted = true;
        this.stringStart = this.cursor;
      } else if (c === "{") {
        if (this.inArray && this.stack.length === 2)
          this.objectStart = this.cursor;
        this.stack.push(c);
        if (this.stack.length === 1) this.expectKey = true;
      } else if (c === "[") {
        if (this.stack.length === 1 && this.rootKey === "segments")
          this.inArray = true;
        this.stack.push(c);
      } else if (c === "}" || c === "]") {
        const expected = c === "}" ? "{" : "[";
        requireValue(
          this.stack.pop() === expected,
          "PROCESSING_FAILED",
          "Invalid streamed transcript.",
          502,
        );
        if (
          this.inArray &&
          c === "}" &&
          this.stack.length === 2 &&
          this.objectStart >= 0
        ) {
          objects.push(
            JSON.parse(this.text.slice(this.objectStart, this.cursor + 1)),
          );
          this.objectStart = -1;
        }
        if (c === "]" && this.stack.length === 1) this.inArray = false;
      } else if (c === "," && this.stack.length === 1) this.expectKey = true;
    }
    return objects;
  }
}

/** Read model output only, never thoughts/tools; truncated streams never succeed. */
export async function readGoogleTextStream(
  response: Response,
  onText: (text: string) => Promise<void>,
) {
  requireValue(
    response.headers.get("content-type")?.includes("text/event-stream"),
    "PROCESSING_FAILED",
    "Google returned no event stream.",
    502,
  );
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    size = 0,
    completed = false;
  const modelSteps = new Set<number>();
  async function frame(value: string) {
    const data = value
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data);
    requireValue(
      !completed,
      "PROCESSING_FAILED",
      "Unexpected events after stream completion.",
      502,
    );
    if (
      event.event_type === "step.start" &&
      event.step?.type === "model_output"
    )
      modelSteps.add(event.index);
    if (
      event.event_type === "step.delta" &&
      modelSteps.has(event.index) &&
      event.delta?.type === "text"
    ) {
      requireValue(
        typeof event.delta.text === "string",
        "PROCESSING_FAILED",
        "Invalid streamed text.",
        502,
      );
      await onText(event.delta.text);
    }
    if (event.event_type === "interaction.completed") {
      requireValue(
        event.interaction?.status === "completed",
        "PROCESSING_FAILED",
        "Google did not finish the recording.",
        502,
      );
      completed = true;
    }
    requireValue(
      !["error", "interaction.failed"].includes(event.event_type),
      "PROCESSING_FAILED",
      "Google streaming failed. Your reservation will be returned.",
      502,
    );
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      requireValue(
        size <= 16 * 1024 * 1024,
        "PROCESSING_FAILED",
        "The speech response is too large.",
        502,
      );
      pending += decoder.decode(value, { stream: true });
      // Normalize per frame, including CRLF split across network chunks.
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        await frame(pending.slice(0, match.index).replace(/\r\n/g, "\n"));
        pending = pending.slice(match.index + match[0].length);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) await frame(pending.replace(/\r\n/g, "\n"));
    requireValue(
      completed,
      "PROCESSING_FAILED",
      "Google streaming was interrupted. Your reservation will be returned.",
      502,
    );
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

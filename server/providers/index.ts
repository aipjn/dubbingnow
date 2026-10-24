import type { ServerConfig } from "../config";
import { GoogleProvider, type SpeechProvider } from "./google";
import { FishDubbingProvider } from "./fish";
import type { PipelineMetrics } from "../pipeline-metrics";
export function speechProvider(
  config: ServerConfig,
  mode: "clone" | "preset",
  observe?: PipelineMetrics["observe"],
  scope?: { owner: string; jobId: string },
): SpeechProvider {
  return mode === "clone" && config.cloneProvider === "fish"
    ? new FishDubbingProvider(config, fetch, observe, scope)
    : new GoogleProvider(config, fetch, observe);
}

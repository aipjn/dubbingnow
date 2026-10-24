import { DemoDubbingApi } from "./demo";
import { HttpDubbingApi } from "./http";
import type { DubbingApi } from "./types";

let api: DubbingApi | undefined;
export function getApi(): DubbingApi {
  if (!api) {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    api = baseUrl ? new HttpDubbingApi(baseUrl) : new DemoDubbingApi();
  }
  return api;
}

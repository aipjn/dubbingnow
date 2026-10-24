import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import YAML from "yaml";

test("OpenAPI defines every client operation and all internal references resolve", () => {
  const doc = YAML.parse(readFileSync("docs/openapi.yaml", "utf8"));
  assert.equal(doc.openapi, "3.1.0");
  const operations: string[] = [];
  for (const item of Object.values(doc.paths) as Record<string, any>[]) {
    for (const method of ["get", "post", "patch", "put", "head"])
      if (item[method]) operations.push(item[method].operationId);
  }
  assert.deepEqual(
    operations.sort(),
    [
      "createSession",
      "getPolicy",
      "verifyGuest",
      "getCurrentUser",
      "updateProfile",
      "getCreditHistory",
      "quoteJob",
      "listUsers",
      "updateUser",
      "adjustCredits",
      "updatePolicy",
      "getCheckout",
      "getCapabilities",
      "getQuota",
      "createUpload",
      "completeUpload",
      "createJob",
      "getJob",
      "listJobs",
      "getReadiness",
      "cancelJob",
      "getPlans",
      "createCheckout",
      "getHealth",
      "putSignedUpload",
      "getSignedResult",
      "headSignedResult",
    ].sort(),
  );
  function walk(value: unknown) {
    if (!value || typeof value !== "object") return;
    if ("$ref" in value) {
      const ref = String(value.$ref);
      const resolved = ref
        .slice(2)
        .split("/")
        .reduce((current, key) => current?.[key], doc);
      assert.ok(resolved, `Unresolved reference ${ref}`);
    }
    Object.values(value).forEach(walk);
  }
  walk(doc);
  assert.equal(
    doc.components.schemas.UploadRequest.properties.sizeBytes.maximum,
    500_000_000,
  );
  assert.equal(doc.components.schemas.JobResult.properties.isDemo.const, false);
  assert.deepEqual(
    doc.components.schemas.UploadRequest.properties.contentType.enum,
    ["audio/mp4", "audio/mpeg", "audio/wav"],
  );
  assert.equal(
    doc.components.schemas.UploadedMedia.properties.mediaType.const,
    "audio",
  );
  assert.equal(
    doc.components.schemas.JobResult.properties.mediaType.const,
    "audio",
  );
  assert.equal(
    doc.components.schemas.CreateJobRequest.properties.timeline.$ref,
    "#/components/schemas/VideoTimeline",
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  makeBuildId,
  buildConfigProblems,
  publicBuildKeys,
} from "../server/build-config";

test("production startup rejects a missing, old or differently configured frontend build", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "web-vc-build-"));
  const env = Object.fromEntries(
    publicBuildKeys.map((key) => [key, `test-${key}`]),
  );
  try {
    assert.match((await buildConfigProblems(env, root))[0], /missing/);
    await mkdir(path.join(root, ".next"));
    const filename = path.join(root, ".next", "BUILD_ID");
    await writeFile(filename, "old-next-build\n");
    assert.match((await buildConfigProblems(env, root))[0], /does not match/);
    await writeFile(filename, makeBuildId(env) + "\n");
    assert.deepEqual(await buildConfigProblems(env, root), []);
    for (const key of publicBuildKeys) {
      assert.match(
        (await buildConfigProblems({ ...env, [key]: "changed" }, root))[0],
        /does not match/,
        `${key} must require a rebuild`,
      );
    }
    // Clearing the API setting produces a demo frontend; it cannot pass as a live build.
    await writeFile(
      filename,
      makeBuildId({ ...env, NEXT_PUBLIC_API_BASE_URL: "" }),
    );
    assert.match((await buildConfigProblems(env, root))[0], /does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("server key rotation does not require a frontend rebuild or enter the public build ID", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "web-vc-build-"));
  const env = {
    NEXT_PUBLIC_API_BASE_URL: "/",
    FISH_API_KEY: "private-test-only",
  };
  try {
    const id = makeBuildId(env);
    assert.equal(id.includes(env.FISH_API_KEY), false);
    assert.notEqual(id, makeBuildId(env));
    await mkdir(path.join(root, ".next"));
    await writeFile(path.join(root, ".next", "BUILD_ID"), id);
    assert.deepEqual(
      await buildConfigProblems(
        { ...env, FISH_API_KEY: "rotated-test-only" },
        root,
      ),
      [],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

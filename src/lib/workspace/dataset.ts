import rawWorkspace from "../../../shared/demo-workspace.json";
import type { DemoWorkspace } from "../../types/domain";

/**
 * The deterministic demo workspace. Authored once in
 * scripts/generate-demo-data.mjs, loaded by SQLite on the desktop and read
 * directly by the browser preview.
 */
// JSON is the seed boundary; schemaVersion guards the shape at startup.
export const demoWorkspace = rawWorkspace as unknown as DemoWorkspace;

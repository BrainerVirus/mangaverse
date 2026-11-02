// @app/db/host — the Electron data host's entry (ADR 0001). Node only: it loads node:sqlite,
// so no renderer or web bundle may import it.
export { createDataHost, type DataHost, type DataHostPort } from './serve.js';
export { importSnapshot, importMarkerPath } from './import-snapshot.js';
export { openNativeDatabase, NATIVE_PRAGMAS, type NativeDatabase } from './open-native.js';
export { PROCEDURES, PROCEDURE_INPUTS } from './procedures.js';

// The marker parser lives in `@falang/debug` (shared with the logic constructor's C++ output and the Arduino IDE's code
// viewer); re-exported here so existing imports of `@falang/workflow-compiler` keep working.
export { parseCompiledMarkers, resolveMarkerLocation, type IMarkerLocation, type IMarkerRange } from '@falang/debug';

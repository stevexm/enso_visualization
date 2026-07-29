import katex from "katex";

export function renderMath(tex: string, displayMode = false): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode });
}

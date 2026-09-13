import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }

  if (specifier.startsWith("@/")) {
    const basePath = resolvePath(process.cwd(), "src", specifier.slice(2));
    const resolvedPath = existsSync(basePath) ? basePath : `${basePath}.ts`;
    return {
      url: pathToFileURL(resolvedPath).href,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}

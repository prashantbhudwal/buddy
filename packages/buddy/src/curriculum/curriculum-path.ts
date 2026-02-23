import path from "node:path"
import { Instance } from "../project/instance.js"

export namespace CurriculumPath {
  export function directory() {
    return path.join(Instance.directory, ".buddy")
  }

  export function file() {
    return path.join(directory(), "curriculum.md")
  }
}

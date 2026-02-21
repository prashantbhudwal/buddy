import path from "node:path"
import { Instance } from "../project/instance.js"
import { Global } from "../storage/global.js"

export namespace CurriculumPath {
  export function directory() {
    return path.join(Instance.directory, ".buddy")
  }

  export function file() {
    return path.join(directory(), "curriculum.md")
  }

  export function legacyDirectory(projectID = Instance.project.id) {
    return path.join(Global.Path.data, "notebooks", projectID)
  }

  export function legacyFile(projectID = Instance.project.id) {
    return path.join(legacyDirectory(projectID), "curriculum.md")
  }
}

import { describe, expect, test } from "bun:test"
import path from "node:path"
import { app } from "../src/index.ts"

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe("multi-tenant session routes", () => {
  test("rejects directories outside allowed roots", async () => {
    const create = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": "/",
      },
    })
    expect(create.status).toBe(403)
    const body = await json(create)
    expect(body.error).toBe("Directory is outside allowed roots")
  })

  test("isolates sessions by directory header", async () => {
    const dirA = "/tmp/buddy-route-tenant-a"
    const dirB = "/tmp/buddy-route-tenant-b"

    const createA = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": dirA,
      },
    })
    expect(createA.status).toBe(200)
    const bodyA = await json(createA)
    const sessionID = String(bodyA.id)

    const getA = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": dirA,
      },
    })
    expect(getA.status).toBe(200)

    const getB = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": dirB,
      },
    })
    expect(getB.status).toBe(404)
  })

  test("uses query directory before directory header", async () => {
    const queryDirectory = "/tmp/buddy-route-query-priority"
    const headerDirectory = "/tmp/buddy-route-header-priority"

    const create = await app.request(`/api/session?directory=${encodeURIComponent(queryDirectory)}`, {
      method: "POST",
      headers: {
        "x-buddy-directory": headerDirectory,
      },
    })
    expect(create.status).toBe(200)
    const body = await json(create)
    const sessionID = String(body.id)

    const fromQueryDirectory = await app.request(`/api/session/${sessionID}?directory=${encodeURIComponent(queryDirectory)}`)
    expect(fromQueryDirectory.status).toBe(200)

    const fromHeaderDirectory = await app.request(`/api/session/${sessionID}`, {
      headers: {
        "x-buddy-directory": headerDirectory,
      },
    })
    expect(fromHeaderDirectory.status).toBe(404)
  })

  test("lists sessions scoped to directory", async () => {
    const directory = "/tmp/buddy-route-list-sessions"
    const otherDirectory = "/tmp/buddy-route-list-sessions-other"

    const createOne = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": directory,
      },
    })
    expect(createOne.status).toBe(200)

    const createTwo = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": directory,
      },
    })
    expect(createTwo.status).toBe(200)

    const createOther = await app.request("/api/session", {
      method: "POST",
      headers: {
        "x-buddy-directory": otherDirectory,
      },
    })
    expect(createOther.status).toBe(200)

    const listed = await app.request("/api/session", {
      headers: {
        "x-buddy-directory": directory,
      },
    })
    expect(listed.status).toBe(200)
    const listBody = (await listed.json()) as Array<{ id: string }>
    expect(listBody).toHaveLength(2)

    const limited = await app.request("/api/session?limit=1", {
      headers: {
        "x-buddy-directory": directory,
      },
    })
    expect(limited.status).toBe(200)
    const limitBody = (await limited.json()) as Array<{ id: string }>
    expect(limitBody).toHaveLength(1)
  })

  test("allows sibling repository directories under monorepo parent", async () => {
    const siblingDirectory = path.resolve(process.cwd(), "../injectbook")
    const create = await app.request(`/api/session?directory=${encodeURIComponent(siblingDirectory)}`, {
      method: "POST",
    })
    expect(create.status).toBe(200)
  })
})

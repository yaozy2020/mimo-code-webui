import assert from "node:assert/strict"
import { claimRequest, releaseRequest } from "./requestOwnership.ts"

async function runOverlap(firstCompletesFirst) {
  const owners = new Map()
  const statuses = []
  const cleanups = []
  let finishFirstProbe
  let finishSecondProbe
  const firstProbe = new Promise((resolve) => { finishFirstProbe = resolve })
  const secondProbe = new Promise((resolve) => { finishSecondProbe = resolve })

  const run = async (request, probe) => {
    claimRequest(owners, "directory\nsession", request)
    statuses.push("busy")
    try {
      await probe
    } finally {
      cleanups.push(request.id)
      if (releaseRequest(owners, "directory\nsession", request)) statuses.push("idle")
    }
  }

  const first = run({ id: "first" }, firstProbe)
  const second = run({ id: "second" }, secondProbe)
  if (firstCompletesFirst) {
    finishFirstProbe()
    await first
    assert.deepEqual(statuses, ["busy", "busy"], "an old request must not idle the newer request")
    finishSecondProbe()
  } else {
    finishSecondProbe()
    await second
    assert.deepEqual(statuses, ["busy", "busy", "idle"], "the current request may idle its session")
    finishFirstProbe()
  }
  await Promise.all([first, second])
  assert.deepEqual(statuses, ["busy", "busy", "idle"], "overlapping requests should produce exactly one owner idle")
  assert.deepEqual(new Set(cleanups), new Set(["first", "second"]), "each request should still clean up its own resources")
  assert.equal(owners.size, 0)
}

await runOverlap(true)
await runOverlap(false)

console.log("prompt request ownership tests passed")

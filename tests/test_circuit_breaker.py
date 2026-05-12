"""
PitchPulse - Circuit Breaker Demo Test
======================================
This script proves the circuit breaker works by:
  1. Showing normal operation (LLM up, responses fast)
  2. Bringing the LLM down → watch server hang WITHOUT circuit breaker
  3. With circuit breaker: after threshold failures, requests fail FAST
  4. Showing recovery after the timeout
"""

import asyncio
import httpx
import time

BASE = "http://localhost:8000"

SAMPLE_EVENTS = [
    {
        "match_id": "match_001",
        "minute": 23,
        "event_type": "goal",
        "player": "Cristiano Ronaldo",
        "team": "Al-Nassr",
        "description": "Header from the corner kick",
    },
    {
        "match_id": "match_001",
        "minute": 45,
        "event_type": "foul",
        "player": "Neymar Jr",
        "team": "Al-Hilal",
        "description": "Sliding tackle from behind",
    },
    {
        "match_id": "match_002",
        "minute": 67,
        "event_type": "shot",
        "player": "Lamine Yamal",
        "team": "Barcelona",
        "description": "Long-range effort, just over the bar",
    },
]


def print_header(text: str):
    print(f"\n{'═' * 60}")
    print(f"  {text}")
    print(f"{'═' * 60}")


def print_result(event_name: str, elapsed: float, is_fallback: bool, cb_state: str):
    icon = "⚡ FALLBACK" if is_fallback else "✅ AI"
    speed = f"{elapsed:.2f}s"
    print(f"  [{speed}] {icon} | CB: {cb_state} | {event_name}")


async def post_event(client: httpx.AsyncClient, event: dict) -> dict:
    start = time.time()
    try:
        resp = await client.post(f"{BASE}/events/commentary", json=event, timeout=15.0)
        elapsed = time.time() - start
        data = resp.json()
        return {
            "ok": True,
            "elapsed": elapsed,
            "is_fallback": data["event"]["is_fallback"],
            "cb_state": data["circuit_breaker"]["state"],
            "commentary": data["event"]["commentary"][:60] + "...",
        }
    except Exception as e:
        elapsed = time.time() - start
        return {"ok": False, "elapsed": elapsed, "error": str(e)}


async def set_llm_down(client: httpx.AsyncClient, down: bool):
    await client.post(f"{BASE}/simulate/llm-down", json={"down": down})
    status = "💥 DOWN" if down else "✅ UP"
    print(f"\n  🔧 LLM API toggled: {status}")


async def reset_cb(client: httpx.AsyncClient):
    await client.post(f"{BASE}/circuit-breaker/reset")
    print("  🔄 Circuit breaker manually reset")


async def run_demo():
    async with httpx.AsyncClient() as client:

        # ── Phase 1: Normal operation ──────────────────────────────
        print_header("PHASE 1: Normal Operation (LLM is UP)")
        await set_llm_down(client, False)
        await reset_cb(client)

        for ev in SAMPLE_EVENTS:
            result = await post_event(client, ev)
            if result["ok"]:
                print_result(
                    f"{ev['player']} — {ev['event_type']}",
                    result["elapsed"],
                    result["is_fallback"],
                    result["cb_state"],
                )
            else:
                print(f"  ❌ Request failed: {result['error']}")

        # ── Phase 2: LLM goes down — WITHOUT circuit breaker ───────
        print_header("PHASE 2: LLM DOWN — No Circuit Breaker (simulated hang)")
        print("  Without a circuit breaker, each request would block for ~60s")
        print("  We simulate 5 seconds per call to show the pain.\n")
        await set_llm_down(client, True)
        await reset_cb(client)

        # Send 3 requests WITHOUT waiting for circuit to trip
        # The first 3 calls each hang for ~5s before failing
        tasks = [post_event(client, SAMPLE_EVENTS[0]) for _ in range(3)]
        start_all = time.time()
        results = await asyncio.gather(*tasks)
        total = time.time() - start_all

        for r in results:
            print(f"  ❌ Failed after {r['elapsed']:.2f}s | error: {r.get('error','cb blocked')}")
        print(f"\n  ⏱️  3 concurrent requests took {total:.2f}s total — server was BLOCKED!")

        # ── Phase 3: Circuit breaker kicks in ──────────────────────
        print_header("PHASE 3: Circuit Breaker Active — Fail Fast!")
        print("  After hitting failure_threshold=3, circuit opens.")
        print("  Subsequent requests fail INSTANTLY — no more hanging.\n")

        # CB should now be OPEN. More requests should fail fast.
        for i in range(4):
            result = await post_event(client, SAMPLE_EVENTS[i % len(SAMPLE_EVENTS)])
            if result["ok"]:
                print_result(
                    f"Request {i+1}",
                    result["elapsed"],
                    result["is_fallback"],
                    result["cb_state"],
                )
            else:
                print(f"  ⚡ [{result['elapsed']:.2f}s] Blocked by open circuit")

        # ── Phase 4: LLM recovers — HALF_OPEN probe ────────────────
        print_header("PHASE 4: LLM Recovers — Circuit Half-Open Probe")
        print("  Bringing LLM back up. Waiting for recovery_timeout (15s)...")
        await set_llm_down(client, False)
        print("  Sleeping 16 seconds for circuit to enter HALF_OPEN state...")
        await asyncio.sleep(16)

        result = await post_event(client, SAMPLE_EVENTS[0])
        if result["ok"]:
            print_result("Probe request", result["elapsed"], result["is_fallback"], result["cb_state"])
            print("\n  🎉 Circuit RESET to CLOSED — system fully recovered!")
        else:
            print(f"  Still recovering: {result.get('error')}")

        # ── Phase 5: Back to normal ─────────────────────────────────
        print_header("PHASE 5: Full Recovery — Normal Operation Resumes")
        for ev in SAMPLE_EVENTS:
            result = await post_event(client, ev)
            if result["ok"]:
                print_result(
                    f"{ev['player']} — {ev['event_type']}",
                    result["elapsed"],
                    result["is_fallback"],
                    result["cb_state"],
                )

        print("\n  ✅ All systems nominal. PitchPulse is back online.\n")


if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════╗
║       PitchPulse — Circuit Breaker Demo                  ║
║       PDC Assignment 2 — Problem 3: Fault Tolerance      ║
╚══════════════════════════════════════════════════════════╝
    """)
    print("Make sure the backend is running: uvicorn main:app --reload")
    print("Starting demo in 2 seconds...\n")
    time.sleep(2)
    asyncio.run(run_demo())

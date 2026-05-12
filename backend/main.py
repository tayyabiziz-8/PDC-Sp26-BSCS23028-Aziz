"""
PitchPulse - Soccer Match Analysis Platform
PDC Assignment 2 - Problem 3: Fault Tolerance via Circuit Breaker Pattern
"""

import asyncio
import time
import random
from enum import Enum
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel


# ─────────────────────────────────────────────
#  CIRCUIT BREAKER IMPLEMENTATION
# ─────────────────────────────────────────────

class CircuitState(str, Enum):
    CLOSED = "CLOSED"        # Normal operation, requests flow through
    OPEN = "OPEN"            # Tripped, requests blocked immediately
    HALF_OPEN = "HALF_OPEN"  # Recovery probe: let one request through


class CircuitBreaker:
    """
    Circuit Breaker for the external LLM commentary API.

    States:
      CLOSED    → requests pass through normally
      OPEN      → requests fail fast (no waiting 60s for timeout!)
      HALF_OPEN → one probe request allowed; success → CLOSED, fail → OPEN

    This prevents one slow/broken dependency from hanging the entire server.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout: float = 15.0,  # seconds before trying HALF_OPEN
        name: str = "default",
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time: Optional[float] = None
        self.success_count = 0
        self.total_requests = 0
        self.tripped_at: Optional[float] = None

    def _trip(self):
        self.state = CircuitState.OPEN
        self.tripped_at = time.time()
        print(f"[CircuitBreaker:{self.name}] ⚡ TRIPPED → OPEN after {self.failure_count} failures")

    def _reset(self):
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        print(f"[CircuitBreaker:{self.name}] ✅ RESET → CLOSED")

    def record_success(self):
        self.success_count += 1
        if self.state == CircuitState.HALF_OPEN:
            self._reset()

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self._trip()

    def can_attempt(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            # Check if recovery timeout has elapsed
            if time.time() - (self.tripped_at or 0) >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                print(f"[CircuitBreaker:{self.name}] 🔄 HALF_OPEN — probing...")
                return True
            return False
        if self.state == CircuitState.HALF_OPEN:
            return True
        return False

    def status(self) -> dict:
        age = round(time.time() - self.tripped_at, 1) if self.tripped_at else None
        recovery_in = None
        if self.state == CircuitState.OPEN and self.tripped_at:
            remaining = self.recovery_timeout - (time.time() - self.tripped_at)
            recovery_in = round(max(0, remaining), 1)

        return {
            "state": self.state,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "success_count": self.success_count,
            "tripped_seconds_ago": age,
            "recovery_in_seconds": recovery_in,
        }


# ─────────────────────────────────────────────
#  FAKE LLM SERVICE (simulates external API)
# ─────────────────────────────────────────────

llm_circuit = CircuitBreaker(
    name="llm-commentary",
    failure_threshold=3,
    recovery_timeout=15.0,
)

# Global flag to simulate the LLM being "down"
llm_is_down = False


async def call_llm_api(prompt: str) -> str:
    """
    Simulates an external LLM API call.
    When llm_is_down=True, it hangs for 60 seconds then raises — exactly
    what causes the real-world server freeze described in the assignment.
    """
    if llm_is_down:
        # Simulate the painful 60-second timeout (we cap at 5s for demo speed)
        print("[LLM API] ❌ Service is down — hanging...")
        await asyncio.sleep(5)
        raise ConnectionError("LLM API timed out after 60 seconds")

    # Simulate slight network latency on success
    await asyncio.sleep(0.3)

    templates = [
        f"What a moment! {prompt} — the crowd erupts as the play unfolds with breathtaking precision.",
        f"Incredible vision from the midfielder! {prompt} — a tactical masterclass in real time.",
        f"The striker cuts inside and — {prompt}! The keeper had no chance whatsoever.",
        f"Textbook pressing from the front line. {prompt} — high-intensity football at its finest.",
        f"Set piece perfection. {prompt} — hours of training sessions paying off right now.",
    ]
    return random.choice(templates)


FALLBACK_COMMENTARY = [
    "⚡ AI commentary unavailable — our analyst is reviewing the play manually.",
    "📋 Live commentary system recovering — check back in a moment.",
    "🔄 Commentary engine temporarily offline — match data still live.",
]


async def get_commentary_with_circuit_breaker(prompt: str) -> tuple[str, bool]:
    """
    Wraps the LLM call with circuit breaker logic.
    Returns (commentary_text, is_fallback).
    """
    if not llm_circuit.can_attempt():
        # Circuit is OPEN — fail fast, return fallback immediately
        print("[CircuitBreaker] 🚫 OPEN — returning fallback without calling LLM")
        return random.choice(FALLBACK_COMMENTARY), True

    try:
        result = await asyncio.wait_for(call_llm_api(prompt), timeout=6.0)
        llm_circuit.record_success()
        return result, False
    except Exception as e:
        llm_circuit.record_failure()
        print(f"[CircuitBreaker] Failure recorded: {e}")
        return random.choice(FALLBACK_COMMENTARY), True


# ─────────────────────────────────────────────
#  DATA MODELS
# ─────────────────────────────────────────────

class MatchEvent(BaseModel):
    match_id: str
    minute: int
    event_type: str   # "goal", "foul", "card", "substitution", "shot"
    player: str
    team: str
    description: str


class LLMDownRequest(BaseModel):
    down: bool


# ─────────────────────────────────────────────
#  MATCH DATA (in-memory for demo)
# ─────────────────────────────────────────────

LIVE_MATCHES = [
    {
        "id": "match_001",
        "home": "Al-Hilal",
        "away": "Al-Nassr",
        "score_home": 1,
        "score_away": 2,
        "minute": 67,
        "status": "LIVE",
        "league": "Saudi Pro League",
    },
    {
        "id": "match_002",
        "home": "Barcelona",
        "away": "Real Madrid",
        "score_home": 0,
        "score_away": 0,
        "minute": 34,
        "status": "LIVE",
        "league": "La Liga",
    },
    {
        "id": "match_003",
        "home": "Liverpool",
        "away": "Man City",
        "score_home": 3,
        "score_away": 2,
        "minute": 90,
        "status": "FT",
        "league": "Premier League",
    },
]

match_events: list[dict] = []


# ─────────────────────────────────────────────
#  MIDDLEWARE: X-Student-ID header (required)
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 PitchPulse backend starting...")
    yield
    print("🛑 PitchPulse backend shutting down.")


app = FastAPI(title="PitchPulse API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_student_id_header(request: Request, call_next):
    """Required: every response must carry X-Student-ID header."""
    response = await call_next(request)
    response.headers["CS-Student-ID"] = "CS23028"
    return response


# ─────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────

@app.get("/")
async def root():
    return {"service": "PitchPulse API", "status": "running"}


@app.get("/matches")
async def get_matches():
    return {"matches": LIVE_MATCHES}


@app.post("/events/commentary")
async def generate_commentary(event: MatchEvent):
    """
    Generates AI commentary for a match event.
    Protected by Circuit Breaker — never hangs the server even if LLM is down.
    """
    prompt = f"{event.player} ({event.team}) — {event.event_type} at minute {event.minute}"
    commentary, is_fallback = await get_commentary_with_circuit_breaker(prompt)

    event_record = {
        "id": len(match_events) + 1,
        "match_id": event.match_id,
        "minute": event.minute,
        "event_type": event.event_type,
        "player": event.player,
        "team": event.team,
        "description": event.description,
        "commentary": commentary,
        "is_fallback": is_fallback,
        "timestamp": time.time(),
    }
    match_events.append(event_record)

    return {
        "event": event_record,
        "circuit_breaker": llm_circuit.status(),
    }


@app.get("/events/{match_id}")
async def get_events(match_id: str):
    events = [e for e in match_events if e["match_id"] == match_id]
    return {"events": events, "count": len(events)}


@app.get("/circuit-breaker/status")
async def circuit_breaker_status():
    """Returns current state of the circuit breaker."""
    return {
        "circuit_breaker": llm_circuit.status(),
        "llm_is_down": llm_is_down,
    }


@app.post("/circuit-breaker/reset")
async def reset_circuit_breaker():
    """Manually reset the circuit breaker (admin use)."""
    llm_circuit._reset()
    return {"message": "Circuit breaker reset", "circuit_breaker": llm_circuit.status()}


@app.post("/simulate/llm-down")
async def toggle_llm_down(req: LLMDownRequest):
    """
    Demo endpoint: toggle the LLM API being up or down.
    This lets us demonstrate the before/after in the video.
    """
    global llm_is_down
    llm_is_down = req.down
    state = "DOWN 💥" if llm_is_down else "UP ✅"
    print(f"[Demo] LLM API toggled: {state}")
    return {"llm_is_down": llm_is_down, "message": f"LLM API is now {state}"}

# YOUR NAME · YOUR-STUDENT-ID

# PitchPulse ⚽ — Soccer Match Analysis Platform
### Fault Tolerance via Circuit Breaker

---

## What Is This?

**PitchPulse** is a real-time soccer match analysis platform where analysts can fire match events (goals, fouls, shots) and receive instant AI-generated commentary. It uses a **FastAPI backend** + **React frontend** backed by a simulated LLM commentary engine.

**The Problem Solved:** The external LLM API sometimes goes down and hangs for 60 seconds per request, which blocks the entire FastAPI server for all users. This assignment implements a **Circuit Breaker pattern** so that when the LLM fails repeatedly, the circuit "trips open" and subsequent requests fail instantly with a graceful fallback — keeping the rest of the app responsive.

---

## Project Structure

```
pitchpulse/
├── backend/
│   ├── main.py              ← FastAPI app + Circuit Breaker implementation
│   └── requirements.txt
├── frontend/
│   └── src/
│       └── App.jsx          ← React dashboard
└── tests/
    └── test_circuit_breaker.py  ← Demo script (before/after proof)
```

---

## How to Run

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`

**Important:** Open any API response in the browser and check the headers — you will see:
```
X-Student-ID: YOUR-STUDENT-ID-HERE
```
This is injected by the middleware in `main.py` on **every single response**.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

> If you don't have a `package.json` yet, scaffold with:
> ```bash
> npm create vite@latest frontend -- --template react
> # then copy App.jsx into src/
> ```

### 3. Run the Demo Test

With the backend running:
```bash
cd tests
python test_circuit_breaker.py
```

This script walks through all 5 phases automatically and prints timing output to prove the circuit breaker works.

---

## How the Circuit Breaker Works

```
CLOSED ──(3 failures)──► OPEN ──(15s timeout)──► HALF_OPEN ──(success)──► CLOSED
   ▲                                                              │
   └──────────────────────────────────────────────────────────────┘(failure → OPEN again)
```

| State | Behavior |
|-------|----------|
| `CLOSED` | All requests pass through normally |
| `OPEN` | Requests blocked instantly — no LLM call made |
| `HALF_OPEN` | One probe request let through — success resets, failure re-trips |

**Key files:**
- `backend/main.py` — `CircuitBreaker` class (lines 20–80), `get_commentary_with_circuit_breaker()` function
- `tests/test_circuit_breaker.py` — 5-phase demo proving before/after behavior

---

## Demo Video Outline (2 min)

1. **(0:00–0:20)** Show the dashboard, fire 3 events — fast AI commentary, CB state = CLOSED
2. **(0:20–0:50)** Toggle LLM DOWN, fire 3 events — watch them hang ~5s, CB trips to OPEN
3. **(0:50–1:20)** Fire 3 more events while OPEN — they return **instantly** with fallback (no hang!)
4. **(1:20–1:50)** Toggle LLM back UP, wait 15s, fire one event — CB probes, resets to CLOSED
5. **(1:50–2:00)** Normal operation resumes — fast AI commentary again ✅

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/matches` | Live match list |
| `POST` | `/events/commentary` | Fire event, get AI commentary |
| `GET` | `/events/{match_id}` | Get events for a match |
| `GET` | `/circuit-breaker/status` | Current CB state |
| `POST` | `/circuit-breaker/reset` | Manually reset CB |
| `POST` | `/simulate/llm-down` | Toggle LLM up/down for demo |

---

## CAP Theorem Note

This implementation prioritizes **Availability** over **Consistency**: when the LLM is unavailable, users still get a response (fallback commentary) rather than an error or timeout. The trade-off is that the commentary quality degrades gracefully rather than the service becoming unavailable entirely. This is the correct choice for a real-time sports platform where uptime matters more than perfect AI output.

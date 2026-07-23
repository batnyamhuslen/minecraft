#!/usr/bin/env bash
#
# start-fullstack.sh
# ------------------
# One-shot dev launcher for the voxel Minecraft clone: starts the Spring Boot
# chunk-persistence backend (../minecraft-backend) and the Vite frontend in the
# foreground, streaming both logs interleaved into this terminal. Ctrl+C (or
# terminating the script) cleanly kills both processes AND their child
# processes (Maven spawns a JVM, npm spawns esbuild/Vite — neither of which
# `kill <parent-pid>` alone would reap on Windows / Git Bash).
#
# Layout assumed:
#   ROOT_DIR     = this script's directory
#   FRONTEND_DIR = $ROOT_DIR/frontend          ( Vite, port 5173 )
#   BACKEND_DIR  = $ROOT_DIR/minecraft-backend ( Spring Boot, port 8080 )
# Override either path with env vars:
#   FRONTEND_DIR=/path/to/front BACKEND_DIR=/path/to/back ./start-fullstack.sh
#
# PostgreSQL is ASSUMED ALREADY RUNNING on localhost:5432. We do a soft probe
# and warn if it's not reachable, but we don't start it or block on it — the
# backend itself will fail loudly with a real connection error if it's down,
# which is clearer to debug than the script guessing.
#
# Tested on: Git Bash for Windows (MINGW64), Linux, macOS. Uses no bashisms
# beyond the basics, intentionally.

set -euo pipefail

# ─── paths ──────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-${ROOT_DIR}/frontend}"
BACKEND_DIR="${BACKEND_DIR:-${ROOT_DIR}/minecraft-backend}"

if [ ! -d "${FRONTEND_DIR}" ]; then
  echo "[start] FATAL: frontend dir missing: ${FRONTEND_DIR}" >&2
  exit 1
fi
if [ ! -d "${BACKEND_DIR}" ]; then
  echo "[start] FATAL: backend dir missing: ${BACKEND_DIR}" >&2
  echo "        expected it at ${BACKEND_DIR}" >&2
  echo "        set BACKEND_DIR=/path/to/minecraft-backend to override" >&2
  exit 1
fi
if [ ! -f "${FRONTEND_DIR}/package.json" ]; then
  echo "[start] FATAL: ${FRONTEND_DIR} doesn't look like the frontend (no package.json)" >&2
  exit 1
fi
if [ ! -f "${BACKEND_DIR}/pom.xml" ]; then
  echo "[start] FATAL: ${BACKEND_DIR} doesn't look like the backend (no pom.xml)" >&2
  exit 1
fi

# ─── tool checks ────────────────────────────────────────────────────────────
command -v npm >/dev/null 2>&1 || { echo "[start] FATAL: npm not on PATH" >&2; exit 1; }
command -v mvn >/dev/null 2>&1 || { echo "[start] FATAL: mvn not on PATH" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "[start] FATAL: curl not on PATH (used for readiness probes)" >&2; exit 1; }

# ─── ports / timings (override via env) ─────────────────────────────────────
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
FRONTEND_TIMEOUT="${FRONTEND_TIMEOUT:-30}"   # seconds
BACKEND_TIMEOUT="${BACKEND_TIMEOUT:-120}"    # seconds — first mvn run downloads deps

# ─── process bookkeeping (defined before trap so cleanup can see them) ───────
FRONT_PID=""
BACK_PID=""

# kill_tree <pid> : kills a pid AND its entire descendant tree. On Windows
# (MINGW/MSYS/CYGWIN) we shell out to taskkill, which reaps the whole process
# tree reliably; on POSIX we walk `pgrep -P` recursively and kill the subtree.
kill_tree() {
  local pid="${1}"
  [ -z "${pid}" ] && return 0
  if [ "${pid}" = "$$" ]; then return 0; fi  # never kill ourselves

  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      # Double-slash flags stop Git Bash from mangling -F into a path.
      taskkill //F //T //PID "${pid}" >/dev/null 2>&1 || true
      ;;
    *)
      local child
      for child in $(pgrep -P "${pid}" 2>/dev/null || true); do
        kill_tree "${child}"
      done
      kill "${pid}" 2>/dev/null || true
      ;;
  esac
}

cleanup() {
  echo ""
  echo "[start] shutting down..."
  [ -n "${FRONT_PID}" ] && kill_tree "${FRONT_PID}"
  [ -n "${BACK_PID}"  ] && kill_tree "${BACK_PID}"
  echo "[start] done."
}
trap cleanup EXIT INT TERM

# ─── helpers ────────────────────────────────────────────────────────────────

# Probe a TCP host:port using curl. Returns 0 if it answers.
probe_tcp() {
  local host="${1}" port="${2}"
  curl --silent --connect-timeout 1 --max-time 1 "http://${host}:${port}/" >/dev/null 2>&1
}

# wait_for_http <port> <label> <timeout_seconds> : poll until something answers
# on the port or the budget runs out. Doesn't abort on timeout — just warns —
# so the user still gets the live interleaved logs to diagnose.
wait_for_http() {
  local port="${1}" label="${2}" budget="${3}"
  local tries=0
  echo "[start] waiting up to ${budget}s for ${label} on :${port}..."
  while [ "${tries}" -lt "${budget}" ]; do
    if curl --silent --connect-timeout 1 --max-time 1 "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
      echo "[start] ${label} is up (after ${tries}s)"
      return 0
    fi
    tries=$((tries + 1))
    sleep 1
  done
  echo "[start] WARN: ${label} didn't answer on :${port} within ${budget}s —" >&2
  echo "        continuing anyway; check the logs below." >&2
  return 1
}

# ─── pre-flight: PostgreSQL (soft) ─────────────────────────────────────────
echo "[start] probing PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
if probe_tcp "${POSTGRES_HOST}" "${POSTGRES_PORT}"; then
  echo "[start] PostgreSQL reachable."
else
  echo "[start] WARN: nothing answering on ${POSTGRES_HOST}:${POSTGRES_PORT}." >&2
  echo "        The backend will likely fail to start. PostgreSQL is assumed" >&2
  echo "        to be running already (see src/main/resources/application.yml)." >&2
fi

# ─── launch backend ─────────────────────────────────────────────────────────
echo "[start] backend  → ${BACKEND_DIR}  (mvn spring-boot:run, port ${BACKEND_PORT})"
(
  cd "${BACKEND_DIR}"
  # -q keeps Maven quiet on success; errors still print. spring-boot:run
  # blocks until the app stops, so the subshell stays alive for the trap.
  mvn -q spring-boot:run
) &
BACK_PID=$!
echo "[start] backend pid=${BACK_PID}"

# ─── launch frontend ─────────────────────────────────────────────────────────
echo "[start] frontend → ${FRONTEND_DIR}  (npm run dev, port ${FRONTEND_PORT})"
(
  cd "${FRONTEND_DIR}"
  # `-- --port` passes through to vite; override via FRONTEND_PORT env.
  npm run dev -- --port "${FRONTEND_PORT}" --host
) &
FRONT_PID=$!
echo "[start] frontend pid=${FRONT_PID}"

# ─── readiness ─────────────────────────────────────────────────────────────
wait_for_http "${FRONTEND_PORT}" "frontend" "${FRONTEND_TIMEOUT}" || true
wait_for_http "${BACKEND_PORT}"  "backend"  "${BACKEND_TIMEOUT}"  || true

echo ""
echo "──────────────────────────────────────────────────────────────────"
echo " Frontend ready: http://localhost:${FRONTEND_PORT}"
echo " Backend  ready: http://localhost:${BACKEND_PORT}"
echo " API proxy:      /api → http://localhost:${BACKEND_PORT}"
echo " Press Ctrl+C to stop both."
echo "──────────────────────────────────────────────────────────────────"
echo ""

# ─── wait for either to exit, then trigger cleanup ─────────────────────────
# `wait -n` returns when ANY background job finishes; once one dies there's
# no point keeping the other up. Fallback to plain `wait` on bashes older
# than 4.3 (rare in 2026, but Git Bash on old Windows ships bash 3.x).
wait -n "${BACK_PID}" "${FRONT_PID}" 2>/dev/null || wait

echo "[start] one of the processes exited; cleaning up the other." >&2
# cleanup runs via the EXIT trap.
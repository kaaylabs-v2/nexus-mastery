#!/bin/bash
set -e

# ============================================================
# Mastery E2E Test Runner
# ============================================================
# Starts all services and runs the full E2E test suite
#
# Usage:
#   ./scripts/run-e2e.sh              # Run all tests
#   ./scripts/run-e2e.sh admin        # Run admin tests only
#   ./scripts/run-e2e.sh web          # Run web/learner tests only
#   ./scripts/run-e2e.sh lifecycle    # Run the full lifecycle test only
#   ./scripts/run-e2e.sh deep         # Run the deep learning test only
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔍 Checking services..."

# Check Docker services (Postgres + Redis)
check_service() {
  local name=$1
  local host=$2
  local port=$3
  if nc -z "$host" "$port" 2>/dev/null; then
    echo "  ✅ $name is running on $host:$port"
    return 0
  else
    echo "  ❌ $name is NOT running on $host:$port"
    return 1
  fi
}

NEED_DOCKER=false
check_service "PostgreSQL" localhost 5432 || NEED_DOCKER=true
check_service "Redis" localhost 6379 || NEED_DOCKER=true

if [ "$NEED_DOCKER" = true ]; then
  echo ""
  echo "🐳 Starting Docker services..."
  cd infra && docker compose up -d && cd "$ROOT_DIR"
  echo "  ⏳ Waiting for services to be healthy..."
  sleep 5
  check_service "PostgreSQL" localhost 5432
  check_service "Redis" localhost 6379
fi

# Check API server
if ! check_service "API Server" localhost 8000; then
  echo ""
  echo "🚀 Starting API server..."
  cd services/api
  # Run migrations and seed if needed
  if [ -f "alembic.ini" ]; then
    echo "  📦 Running migrations..."
    python -m alembic upgrade head 2>/dev/null || true
  fi
  echo "  🌱 Seeding database..."
  python seed.py 2>/dev/null || true
  echo "  🔧 Starting uvicorn..."
  nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/api-server.log 2>&1 &
  API_PID=$!
  echo "  ⏳ Waiting for API to start (PID: $API_PID)..."
  cd "$ROOT_DIR"
  for i in $(seq 1 30); do
    if check_service "API Server" localhost 8000 2>/dev/null; then
      break
    fi
    sleep 1
  done
  check_service "API Server" localhost 8000
fi

echo ""
echo "✅ All services running!"
echo ""

# Ensure Playwright browsers are installed
echo "🌐 Ensuring Playwright browsers are installed..."
cd apps/web && npx playwright install chromium --with-deps 2>/dev/null || true
cd "$ROOT_DIR"
cd apps/admin && npx playwright install chromium --with-deps 2>/dev/null || true
cd "$ROOT_DIR"

# Create screenshots directory
mkdir -p apps/admin/test-results/screenshots
mkdir -p apps/web/test-results/screenshots

# Run tests based on argument
SUITE="${1:-all}"

echo ""
echo "🧪 Running E2E tests: $SUITE"
echo "═══════════════════════════════════════════════════════════════"

run_admin_tests() {
  echo ""
  echo "📋 ADMIN E2E TESTS"
  echo "───────────────────────────────────────────────────────────"
  cd "$ROOT_DIR/apps/admin"
  npx playwright test --headed "$@"
  cd "$ROOT_DIR"
}

run_web_tests() {
  echo ""
  echo "📋 LEARNER E2E TESTS"
  echo "───────────────────────────────────────────────────────────"
  cd "$ROOT_DIR/apps/web"
  npx playwright test --headed "$@"
  cd "$ROOT_DIR"
}

case "$SUITE" in
  admin)
    run_admin_tests
    ;;
  web|learner)
    run_web_tests
    ;;
  lifecycle)
    echo "Running full lifecycle test (admin → learner)..."
    cd "$ROOT_DIR/apps/admin"
    npx playwright test full-course-lifecycle --headed
    cd "$ROOT_DIR"
    ;;
  deep)
    echo "Running deep learning flow test..."
    cd "$ROOT_DIR/apps/web"
    npx playwright test deep-learning-flow --headed
    cd "$ROOT_DIR"
    ;;
  cross)
    echo "Running cross-app flow test..."
    cd "$ROOT_DIR/apps/admin"
    npx playwright test cross-app-flow --headed
    cd "$ROOT_DIR"
    ;;
  all)
    run_admin_tests
    run_web_tests
    ;;
  *)
    echo "Unknown suite: $SUITE"
    echo "Usage: $0 [all|admin|web|lifecycle|deep|cross]"
    exit 1
    ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🎉 E2E tests complete!"
echo ""
echo "📸 Screenshots saved to:"
echo "   apps/admin/test-results/screenshots/"
echo "   apps/web/test-results/screenshots/"

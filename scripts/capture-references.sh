#!/usr/bin/env bash
# Capture every registered surface at the reference resolution (1600 x 1000).
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/tmp/refsweep/live}"
BASE="${2:-http://localhost:5173}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$OUT"
rm -rf /tmp/refsweep/profile
mkdir -p /tmp/refsweep/profile

routes=(
  "01|/coordinator/mission-control"
  "02|/coordinator/autoroster"
  "03|/coordinator/impact"
  "04|/volunteer/discover"
  "05|/volunteer/opportunities/community-food-distribution"
  "06|/volunteer/schedule"
  "07|/volunteer/profile"
  "08|/volunteer/check-in"
  "09|/coordinator/reports"
  "10|/coordinator/opportunities/new"
  "11|/coordinator/schedule"
  "12|/volunteer/hours"
  "13|/volunteer/impact"
  "14|/volunteer/verification"
  "15|/volunteer/shifts/sh-sat-food"
  "16|/volunteer/saved"
  "17|/volunteer/home"
  "18|/volunteer/notifications"
  "19|/coordinator/coverage"
  "20|/coordinator/opportunities"
  "21|/coordinator/opportunities/opp-food"
  "22|/coordinator/shifts/sh-sat-food"
  "23|/launch"
  "24|/welcome"
  "25|/sign-in"
  "26|/volunteer/onboarding"
  "27|/coordinator/organization/setup"
  "28|/coordinator/volunteers"
  "29|/coordinator/volunteers/vol-maya"
  "30|/coordinator/applications"
  "31|/coordinator/credentials"
  "32|/coordinator/attendance"
  "33|/coordinator/kiosk"
  "34|/coordinator/hours"
  "35|/coordinator/reports/custom"
  "36|/coordinator/insights"
  "37|/coordinator/reports/preview"
  "38|/coordinator/records"
  "39|/coordinator/audit"
  "40|/coordinator/backup"
  "41|/coordinator/settings"
  "42|/coordinator/accessibility"
)

for entry in "${routes[@]}"; do
  number="${entry%%|*}"
  path="${entry#*|}"
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor=1 \
    --window-size=1600,1000 \
    --virtual-time-budget=2500 \
    --user-data-dir=/tmp/refsweep/profile \
    --screenshot="$OUT/$number.png" \
    "$BASE$path" >/dev/null 2>&1 || echo "capture failed: $number $path"
  printf '%s ' "$number"
done
echo

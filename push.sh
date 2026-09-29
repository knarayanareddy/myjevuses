#!/bin/bash
# Push helper for this host.
#
# The system resolver is broken here (`scutil --dns` has no configuration), so
# git, gh, node and curl all fail name resolution even though the machine is
# online. `nslookup` talks to a DNS server directly and works fine, so we
# resolve each GitHub host once and hand git the answer via GIT_CONFIG_*.
#
# Usage:  ./push.sh          # push main to origin
set -euo pipefail
cd "$(dirname "$0")"

count=0
for h in github.com api.github.com codeload.github.com; do
  ip=$(nslookup "$h" 2>/dev/null | awk '/^Address: /{print $2; exit}')
  [ -z "$ip" ] && continue
  count=$((count + 1))
  key="GIT_CONFIG_KEY_$count"
  val="GIT_CONFIG_VALUE_$count"
  export "$key=http.$h.curloptResolve"
  export "$val=$h:443:$ip"
  echo "  resolved $h -> $ip"
done

git push -u origin main "$@"

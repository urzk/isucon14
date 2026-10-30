#!/usr/bin/env bash
# ローカルから実行する。直前のベンチのアクセスログとスロークエリログを集計する
set -eu
APP=isu14-1
DB=isu14-2
ssh -n $APP "sudo alp ltsv --file /var/log/nginx/access.log -m '/api/app/rides/[^/]+/evaluation,/api/chair/rides/[^/]+/status,/assets/.+,/images/.+' --sort sum -r -o count,method,uri,min,avg,max,sum | head -30"
ssh -n $DB "sudo test -s /var/log/mysql/mysql-slow.log && sudo pt-query-digest --limit 12 /var/log/mysql/mysql-slow.log 2>/dev/null | grep -E '^# (Rank|  *[0-9]+ 0x)|^# Query [0-9]' -A0 | head -40 || true"

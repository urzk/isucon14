#!/usr/bin/env bash
# ローカルから実行する。アプリ1号機に ref をデプロイし、ベンチ機で負荷走行してスコアを表示する
# usage: tools/bench.sh <git-ref> [label]
set -euo pipefail
REF=${1:-origin/main}
LABEL=${2:-$(date +%H%M%S)}
APP=isu14-1
DB=isu14-2
APP_ADDR=172.31.36.213
BENCH_ADDR=172.31.46.60

scp -q "$(dirname "$0")/deploy-db.sh" $DB:deploy-db.sh
ssh -n $DB "bash deploy-db.sh $REF" 2>&1 | tail -1
scp -q "$(dirname "$0")/deploy.sh" $APP:deploy.sh
ssh -n $APP "bash deploy.sh $REF" 2>&1 | tail -3
# 解析用ログをリセット
ssh -n $APP 'sudo truncate -s 0 /var/log/nginx/access.log; true'
ssh -n $DB 'sudo test -f /var/log/mysql/mysql-slow.log && sudo truncate -s 0 /var/log/mysql/mysql-slow.log; true'
ssh -n isu14-bench "cd /home/isucon && sudo -u isucon ./bench_linux_amd64 run --target https://isuride.xiv.isucon.net --addr $APP_ADDR:443 --payment-url http://$BENCH_ADDR:12345 > /tmp/bench-$LABEL.log 2>&1; grep -E 'level=(ERROR|WARN)' /tmp/bench-$LABEL.log | head -10; grep -E '結果|level=INFO msg=.*(エラー|失敗)' /tmp/bench-$LABEL.log | tail -5"

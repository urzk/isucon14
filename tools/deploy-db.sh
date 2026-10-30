#!/usr/bin/env bash
# DBサーバー上で実行する。指定した ref の MySQL 設定を反映する
# usage: tools/deploy-db.sh <git-ref>
set -eux
REF=${1:-origin/main}
cd ~/isucon14
git fetch -q origin '+refs/heads/*:refs/remotes/origin/*'
git checkout -q -f --detach "$REF"
for f in tools/conf/mysql/*.cnf; do
  if ! sudo cmp -s "$f" "/etc/mysql/mysql.conf.d/zz-$(basename "$f")"; then
    sudo cp "$f" "/etc/mysql/mysql.conf.d/zz-$(basename "$f")"
    sudo systemctl restart mysql
  fi
done
# DB専用サーバーなので、アプリとマッチャーは止める (共有DBに対してマッチングが並行して走るのを防ぐ)
sudo systemctl disable --now isuride-node.service isuride-matcher.service isuride-go.service 2>/dev/null || true
systemctl is-active mysql

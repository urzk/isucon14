#!/usr/bin/env bash
# アプリサーバー上で実行する。指定した ref のコードを /home/isucon/webapp に反映して再起動する
# usage: tools/deploy.sh <git-ref>
set -eux
REF=${1:-origin/main}
cd ~/isucon14
git fetch -q origin '+refs/heads/*:refs/remotes/origin/*'
git checkout -q -f --detach "$REF"

sudo rsync -a --delete --exclude node_modules --exclude dist webapp/nodejs/ /home/isucon/webapp/nodejs/
sudo rsync -a webapp/sql/ /home/isucon/webapp/sql/
sudo chown -R isucon:isucon /home/isucon/webapp
if ! cmp -s webapp/nodejs/package-lock.json /home/isucon/.deployed-package-lock.json; then
  (cd /home/isucon/webapp/nodejs && sudo -u isucon /home/isucon/.x npm install --no-audit --no-fund)
  sudo cp webapp/nodejs/package-lock.json /home/isucon/.deployed-package-lock.json
fi

# ミドルウェア設定
for f in tools/conf/mysql/*.cnf; do
  [ -e "$f" ] || continue
  if ! sudo cmp -s "$f" "/etc/mysql/mysql.conf.d/zz-$(basename "$f")"; then
    sudo cp "$f" "/etc/mysql/mysql.conf.d/zz-$(basename "$f")"
    sudo systemctl restart mysql
  fi
done
if [ -f tools/conf/nginx/nginx.conf ] && ! sudo cmp -s tools/conf/nginx/nginx.conf /etc/nginx/nginx.conf; then
  sudo cp tools/conf/nginx/nginx.conf /etc/nginx/nginx.conf
  sudo nginx -t && sudo systemctl reload nginx
fi
if [ -f tools/conf/nginx/isuride.conf ] && ! sudo cmp -s tools/conf/nginx/isuride.conf /etc/nginx/sites-available/isuride.conf; then
  sudo cp tools/conf/nginx/isuride.conf /etc/nginx/sites-available/isuride.conf
  sudo nginx -t && sudo systemctl reload nginx
fi
if [ -f tools/conf/env.sh ] && ! sudo cmp -s tools/conf/env.sh /home/isucon/env.sh; then
  sudo cp tools/conf/env.sh /home/isucon/env.sh
  sudo systemctl restart isuride-matcher
fi

# 型エラーで起動できなくなるのを防ぐため、再起動前にビルドが通ることを確認する
(cd /home/isucon/webapp/nodejs && sudo -u isucon /home/isucon/.x npx tsc)
sudo systemctl restart isuride-node
for i in $(seq 1 60); do
  curl -s -o /dev/null http://localhost:8080/api/app/notification && break
  sleep 1
done
systemctl is-active isuride-node
echo "deployed $(git rev-parse --short HEAD)"

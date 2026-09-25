#!/bin/zsh
set -e

CONSOLE_DIR=${0:A:h}
cd "$CONSOLE_DIR"

if [[ ! -d node_modules ]]; then
  npm install
fi

if [[ ! -f dist/index.html ]]; then
  npm run build
fi

(sleep 1; open "http://127.0.0.1:49152") &
exec npm start

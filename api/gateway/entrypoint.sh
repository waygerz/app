#!/bin/sh
set -e

# Renew certs and reload nginx when certbot updates them (no-op if not due).
renew_loop() {
  trap 'exit 0' TERM INT
  while :; do
    certbot renew --webroot -w /var/www/certbot --quiet || true
    nginx -s reload || true
    sleep 12h & wait $!
  done
}

renew_loop &
renew_pid=$!

trap 'kill -TERM "$renew_pid" 2>/dev/null; nginx -s quit 2>/dev/null; wait' TERM INT

exec nginx -g 'daemon off;'
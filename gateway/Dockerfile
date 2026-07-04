FROM nginx:1.27-alpine

# openssl: init-letsencrypt.sh dummy cert on first boot.
# certbot: ACME renewals run inside this container (no separate certbot service).
RUN apk add --no-cache openssl certbot

COPY conf.d/default.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Bind-mounted at runtime:
#   /etc/letsencrypt  — Let's Encrypt live certs + renewal state (rw)
#   /var/www/certbot  — ACME http-01 webroot (rw)

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
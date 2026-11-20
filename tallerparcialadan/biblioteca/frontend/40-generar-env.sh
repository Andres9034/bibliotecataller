#!/bin/sh
# Se ejecuta al arrancar Nginx: inyecta la configuración sin reconstruir la imagen.
envsubst '${API_URL} ${FIREBASE_API_KEY} ${FIREBASE_AUTH_DOMAIN} ${FIREBASE_PROJECT_ID}' \
  < /opt/env.template.js > /usr/share/nginx/html/env.js
echo "env.js generado con API_URL=${API_URL}"

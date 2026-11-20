# Frontend estático servido por Nginx. La configuración se inyecta en runtime (Factor III y V).
FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/index.html
COPY env.template.js /opt/env.template.js
COPY 40-generar-env.sh /docker-entrypoint.d/40-generar-env.sh
RUN chmod +x /docker-entrypoint.d/40-generar-env.sh
EXPOSE 80

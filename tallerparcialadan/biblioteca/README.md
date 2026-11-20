# 📚 Biblioteca Cloud Native

Aplicación web con **un microservicio** (`ms-libros`) desplegado con Docker, autenticación con **Firebase** validada en un **API Gateway**, y aplicando los **12 factores Cloud Native**.

**✅ Mi componente:** microservicio `ms-libros` (Node.js + Express + MongoDB)
**🐳 Imagen Docker Hub:** `andrew9034/biblioteca-ms-libros:1.0` → https://hub.docker.com/r/andrew9034/biblioteca-ms-libros

## Arquitectura

```
Usuario → Frontend (:8088) → API Gateway (:8080, valida token Firebase) → ms-libros (:8001) → MongoDB
```

| Contenedor | Imagen | Función |
|---|---|---|
| frontend | `andrew9034/biblioteca-frontend:1.0` | Página web con login Firebase |
| gateway | `andrew9034/biblioteca-gateway:1.0` | Valida token y enruta |
| **ms-libros** | `andrew9034/biblioteca-ms-libros:1.0` | **Registrar / listar / eliminar libros** |
| mongo | `mongo:7` | Base de datos |

## Endpoints (vía gateway, requieren `Authorization: Bearer <token>`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado (público) |
| GET | `/api/libros` | Listar libros |
| POST | `/api/libros` | Registrar libro `{ titulo, autor, anio }` |
| GET | `/api/libros/:id` | Ver libro |
| DELETE | `/api/libros/:id` | Eliminar libro |

## Ejecutar

```bash
cp .env.example .env     # llenar usuario Docker Hub y Firebase
docker compose build
docker compose up -d
```
Abrir http://localhost:8088

## 12 factores

| Factor | Aplicación |
|---|---|
| I. Código base | Un repositorio Git |
| II. Dependencias | `package.json` + `package-lock.json`, `npm ci` en el Dockerfile |
| III. Configuración | Variables de entorno (`.env`), sin secretos en código ni imagen |
| IV. Servicios de soporte | MongoDB y Firebase conectados por URL/variables |
| V. Build, release, run | `docker build` → `docker push` → `docker compose up` |
| VI. Sin estado | Identidad en el token, datos en MongoDB |
| VII. Puertos | Cada servicio expone su `PORT` |
| VIII. Concurrencia | `docker compose up -d --scale ms-libros=2` |
| IX. Desechabilidad | Reintento de conexión a MongoDB y apagado ordenado (SIGTERM) |
| X. Paridad dev/prod | La misma imagen corre en cualquier equipo |
| XI. Logs | JSON a stdout (`docker compose logs`) |
| XII. Procesos admin | `docker compose exec mongo mongosh ...` |

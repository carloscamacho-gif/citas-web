# citas-web

Cliente **React 19 + TypeScript + Vite + Tailwind CSS v4** del portal de citas, importado del prototipo aprobado (Stitch → Google AI Studio) y conectado directamente a `citas-api` por REST. Sin Express/BFF.

## Desarrollo local

1. Copia `.env.example` a `.env.local` si la API no está en `http://localhost:8080` (variable `VITE_API_URL`).
2. `npm install`.
3. `npm run dev` y abre `http://localhost:5173`.

Requiere `citas-api` corriendo (y su MySQL). Ver `../citas-api/README.md`.

## Sesión y contrato de autenticación

El frontend consume el contrato real de `citas-api` (`/api/v1/auth/*`), documentado en `../citas-api/docs/wiki/contratos/auth-api.md`:

- **Access token**: JWT que vive solo en memoria (nunca se persiste).
- **Refresh token**: `citas-api` lo devuelve en el cuerpo del login; el cliente lo guarda en `localStorage` (si "Recordar sesión") o `sessionStorage`, y lo envía en el cuerpo de `/refresh` y `/logout`. Al recargar, `restoreSession()` lo usa para reobtener un access token.
- **Registro**: respuesta `{ id, firstName, lastName, email, roles }` (rol como arreglo); tras registrarse se abre sesión automáticamente.
- **Errores**: se leen del campo `message` de la respuesta de error.

> Riesgo residual (laboratorio): guardar el refresh token en almacenamiento web es más débil que una cookie `HttpOnly` (expuesto a XSS). Se acepta dentro del alcance académico porque el backend entrega el refresh en el cuerpo. Migrar a cookie `HttpOnly` requeriría cambiar el contrato en `citas-api` (ver decisiones en la LLM Wiki).

## Verificación

```bash
npm run lint    # tsc --noEmit
npm test        # vitest
npm run build
```

Las pantallas de agenda (dashboard, reserva) muestran datos sintéticos / estados vacíos hasta que sus HU de backend (HU-010 en adelante) se implementen en `citas-api`. Recuperación de contraseña (HU-003) aún no está diseñada.

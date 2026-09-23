# AGENTS.md — citas-web

Generado siguiendo `../prompts/agents/PROMPT_AGENT_CITAS_WEB.md`, con el stack real ya detectado en el repo (no supuesto). Léelo antes de tocar código de este repo.

## Stack real (evidencia: `package.json`, `vite.config.ts`)

- **React 19 + TypeScript** sobre **Vite 8**, estilos con **Tailwind CSS v4** (plugin `@tailwindcss/vite`), iconos `lucide-react`.
- Importado desde Google AI Studio (el prototipo aprobado venía de Stitch → AI Studio). El comentario en `vite.config.ts` sobre `DISABLE_HMR` es de ese entorno; no lo conviertas en lógica de negocio.
- Pruebas con **Vitest** + Testing Library (`jsdom`), setup en `src/test/setup.ts`.
- No hay Express/BFF ni router de librería: `App.tsx` conmuta pantallas con estado local (`screen`).

No cambies de framework por preferencia. Si algo exige React Router u otra dependencia, justifícalo contra una HU antes de agregarlo.

## Estructura (evidencia: `src/`)

```text
src/
├── App.tsx                  orquesta pantallas (login/register/dashboard) y sesión
├── main.tsx                 bootstrap React
├── index.css                Tailwind + fuente Poppins + utilidades
├── types.ts                 tipos de dominio compartidos (User, Appointment, Specialty, ...)
├── auth/
│   ├── authApi.ts           cliente REST de /api/v1/auth (login, register, refresh, logout)
│   └── authApi.test.ts
├── api/
│   └── schedulingApi.ts     cliente REST de catálogos/citas/admin/agenda (HU futuras)
└── components/
    ├── LoginScreen.tsx
    ├── RegisterScreen.tsx
    ├── DashboardScreen.tsx
    ├── BookAppointmentModal.tsx
    └── authScreens.test.tsx
```

## Contrato con citas-api (IMPORTANTE)

Este front se importó de un proyecto cuyo backend usaba **cookie HttpOnly + `X-Requested-With`**. Se **reconció al contrato real de nuestro `citas-api`** (ver `../citas-api/docs/wiki/contratos/auth-api.md`). Al tocar `auth/authApi.ts`, respeta este contrato ya alineado y verificado end-to-end:

- Login/refresh/logout: el **refresh token viaja en el cuerpo JSON**, no en cookie. El cliente lo guarda en `localStorage`/`sessionStorage` según "Recordar sesión". **No** vuelvas a agregar el header `X-Requested-With` (el CORS de `citas-api` no lo permite y el navegador bloquea la petición).
- Errores: se leen del campo **`message`** (no `detail`).
- Registro: respuesta con **`roles` (arreglo)**, sin `password` ni `phone`; el `phone` del usuario se toma del formulario.
- `documentType` válido: **`CC`, `CE`, `TI`, `PASSPORT`** (el enum del backend; no uses `PA`).

Si una nueva HU necesita algo que el contrato no cubre, **no inventes el endpoint en el cliente**: reporta el cambio cross-repo al orquestador para que se defina en `citas-api`.

## Reglas

- Solo frontend. El backend es la autoridad de negocio; no repliques reglas críticas solo en cliente.
- URL de API configurable por `VITE_API_URL` (nunca hardcodear); nunca hardcodear tokens/secretos.
- Preserva los componentes/estilos ya correctos del diseño aprobado al reconciliar; no rediseñes sin reabrir la fase de diseño.
- No edites `citas-api` desde este repo.
- No mantengas una LLM Wiki propia; la global vive en `citas-api/docs/wiki/llm-wiki/`.

## Cómo verificar

```bash
npm install
npm run lint     # tsc --noEmit
npm test         # vitest run
npm run build    # vite build
npm run dev      # servidor en http://localhost:5173 (requiere citas-api arriba para auth real)
```

Estado al importar: login y registro **funcionan end-to-end** contra `citas-api` (registro → auto-login → dashboard, logout, login), verificado en navegador. El dashboard y la reserva llaman a endpoints de HU aún no implementadas (HU-010+) y degradan a estados vacíos/errores controlados — es esperado, no un bug.

## Modo de trabajo para la próxima HU de frontend

1. Lee la HU/CA/DoD en `../citas-api/docs/wiki/scrum/` y el contrato REST correspondiente.
2. Identifica pantallas/componentes/servicios afectados (`components/`, `api/schedulingApi.ts`).
3. Mapea estados loading/empty/error/success/disabled.
4. Implementa sin rediseñar lo aprobado.
5. `npm run lint && npm test && npm run build`.
6. Verifica en el navegador contra los criterios de aceptación.

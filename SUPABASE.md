# Autenticación con Supabase — Palacio Presidencial

## 1. Crear proyecto

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto.
2. En **Project Settings → API**, copia:
   - **Project URL**
   - **anon public** key

## 2. Configurar la app (Vite + React)

La app ahora usa **Vite + React**. La configuración de Supabase se inyecta por
variables de entorno (`VITE_*`), no por un script global.

```bash
npm install           # instala dependencias
cp .env.example .env  # crea tu archivo de entorno local
```

Edita `.env` y pega tu URL y clave anon:

```
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_ANON_PUBLICA
```

Comandos:

```bash
npm run dev      # servidor de desarrollo (http://localhost:5173)
npm run build    # genera la versión de producción en dist/
npm run preview  # sirve el build de producción localmente
npm test         # pruebas unitarias
```

> La clave anon es pública por diseño; RLS protege los datos. El archivo `.env`
> está en `.gitignore`.

### Despliegue (GitHub Pages)

El workflow `.github/workflows/deploy.yml` construye y publica `dist/` en cada
push a `main`. Define `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` como
**Secrets** del repositorio (Settings → Secrets and variables → Actions) y
activa **Pages → Build and deployment → GitHub Actions**.

## 3. Crear usuarios del gabinete

En el dashboard: **Authentication → Users → Add user**.

Crea dos usuarios (marca **Auto Confirm User**):

| Correo (ejemplo)              | Contraseña | User Metadata (JSON) |
|-------------------------------|------------|----------------------|
| `presidente@palacio.local`    | (segura)   | `{ "role": "president", "display_name": "Presidente" }` |
| `ministro@palacio.local`      | (segura)   | `{ "role": "minister", "display_name": "Ministro" }` |

El campo `role` debe ser exactamente `president` o `minister` para que la app asigne el perfil correcto.

## 4. Base de datos (obligatorio)

En **SQL Editor**, ejecuta en este orden:

1. `supabase/sync-tables.sql` — decretos, mensajes y políticas RLS
2. `decreto_logs.sql` — historial oficial
3. `supabase/push-subscriptions.sql` — tabla de notificaciones push

**Si ya tenías una versión anterior** del esquema, ejecuta además:

- `supabase/migrate-security.sql` — endurece RLS y añade `author_id` a mensajes

En **Database → Publications**, confirma que `decretos`, `mensajes` y `decreto_logs` están en **supabase_realtime**.

## 5. (Opcional) Tabla de perfiles

Ejecuta `supabase/setup.sql` si quieres perfiles en base de datos.

## 6. Notificaciones push (opcional)

### 6.1 Claves VAPID

Genera un par de claves VAPID (por ejemplo con `npx web-push generate-vapid-keys`).

- Pega la **clave pública** en `src/lib/constants.js` → `VAPID_PUBLIC_KEY`
- Guarda la **clave privada** como secreto en Supabase

### 6.2 Edge Function `send-push`

Despliega la función en `supabase/functions/send-push/`:

```bash
supabase functions deploy send-push
```

El cifrado Web Push (RFC 8291) y la firma VAPID se delegan en la librería
`@negrel/webpush` (importada vía `jsr:`), así que no hay criptografía hecha a mano.

Secrets requeridos en **Edge Functions → Secrets**:

| Secret | Descripción |
|--------|-------------|
| `VAPID_PUBLIC_KEY` | Clave pública VAPID |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID |
| `VAPID_SUBJECT` | `mailto:tu@correo.com` |
| `WEBHOOK_SECRET` | Cadena aleatoria larga (tú la defines) |

### 6.3 Webhooks de base de datos

En **Database → Webhooks**, crea dos webhooks (o uno por tabla):

| Campo | Valor |
|-------|-------|
| Tabla | `decretos` / `mensajes` |
| Evento | `INSERT` |
| Tipo | `Supabase Edge Functions` → `send-push` |
| Header HTTP | `x-webhook-secret: <WEBHOOK_SECRET>` |

> Si eliges el tipo **HTTP Request** en su lugar, usa el header
> `Authorization: Bearer <WEBHOOK_SECRET>`. Con el tipo **Edge Functions**,
> Supabase rellena `Authorization` automáticamente, por eso se usa
> `x-webhook-secret`. La función acepta cualquiera de los dos.

La función rechaza peticiones sin el secreto correcto.

### 6.4 Notificaciones por email (Resend)

La misma Edge Function `send-push` también envía emails mediante
[Resend](https://resend.com), reusando los webhooks ya configurados:

- Cuando el **ministro** envía un mensaje → email a la **presidenta**.
- Cuando cualquiera crea un **decreto** → email al otro miembro.

El destinatario se obtiene del email real de cada usuario en Supabase Auth, así
que ambos usuarios deben tener un correo válido (los `@palacio.local` de ejemplo
rebotan).

Pasos:

1. Crea una cuenta en [resend.com](https://resend.com) y genera un **API key**.
2. **Verifica un dominio** en Resend (necesario para enviar a direcciones
   arbitrarias). Para pruebas rápidas puedes usar `onboarding@resend.dev` como
   remitente, pero solo entrega al email de tu propia cuenta de Resend.
3. Añade dos secrets en **Edge Functions → Secrets**:

| Secret | Descripción |
|--------|-------------|
| `RESEND_API_KEY` | API key de Resend |
| `EMAIL_FROM` | Remitente verificado, ej: `Palacio Presidencial <noreply@tudominio.com>` |

4. Redespliega la función:

```bash
supabase functions deploy send-push --no-verify-jwt
```

Si los secrets de email no están configurados, el push sigue funcionando y el
email simplemente se omite (se registra en los logs).

## 7. Probar

Levanta la app con `npm run dev` e inicia sesión con dos navegadores (presidente y ministro). Los decretos y mensajes deben aparecer al instante en ambos.

Tests locales:

```bash
npm test
```

## Notas de seguridad

- Los datos viven en Supabase; no se usa `localStorage` para la agenda.
- No subas tu archivo `.env` a repositorios públicos (está en `.gitignore`).
- RLS impide auto-aprobación, suplantación de `user_key` y borrados no autorizados.
- La recuperación de contraseña redirige a `reset-password.html` en el mismo origen.

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

## 7. Google: login y calendario (opcional)

Habilita el botón **"Entrar con Google"** y la conexión del Google Calendar de cada
usuario al calendario oficial (solo lectura, por dispositivo).

### 7.1 Google Cloud Console

1. Crea un proyecto en [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs & Services → Library**: habilita **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: tipo **External**, y añade los correos
   del presidente y del ministro como **Test users** (con la app en modo "Testing" solo
   ellos podrán entrar, que es exactamente lo que queremos).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Tipo: **Web application**.
   - Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
     (cópiala exacta del paso 7.2).
   - Guarda el **Client ID** y el **Client Secret**.

### 7.2 Supabase

1. **Authentication → Providers → Google**: actívalo y pega Client ID y Client Secret.
   Ahí mismo aparece la **Callback URL** que debes registrar en Google (paso 7.1.4).
2. Los correos de las cuentas de Google **deben coincidir** con los de los usuarios del
   gabinete; así Supabase enlaza la identidad de Google con la cuenta existente en vez
   de crear un usuario huérfano sin rol.
3. El rol debe vivir en `app_metadata` (controlado por el servidor, sobrevive al login
   OAuth). En **SQL Editor**:

   ```sql
   update auth.users
     set raw_app_meta_data = raw_app_meta_data || '{"role": "president"}'
     where email = 'presidente@palacio.local';

   update auth.users
     set raw_app_meta_data = raw_app_meta_data || '{"role": "minister"}'
     where email = 'ministro@palacio.local';
   ```

### 7.3 Edge Function `google-refresh`

Refresca el access token de Google (el client secret nunca llega al navegador):

```bash
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
supabase functions deploy google-refresh
```

Deben ser las **mismas** credenciales del provider de Google en Supabase Auth.

### 7.4 Cómo funciona

- "Entrar con Google" pide el scope `calendar.readonly` con `access_type=offline`, así
  que iniciar sesión con Google ya conecta el calendario en ese dispositivo.
- Quien entre con contraseña puede pulsar **"Conectar Google"** en el calendario: repite
  el mismo flujo OAuth y vuelve a la app con los tokens.
- Los tokens viven en `localStorage` (como los de Spotify): la conexión es por
  dispositivo y cada usuario ve solo su propio calendario.

## 8. Genshin Impact: card "Estado de Teyvat" (opcional)

La card muestra, para las dos cuentas, las **Notas en Tiempo Real** de HoYoLAB (resina,
comisiones, jefes semanales, tetera, expediciones, transformador) y el perfil público de
**Enka.Network** (nickname, AR, Abismo). Todo pasa por la Edge Function `genshin-notes`:
HoYoLAB bloquea CORS y las cookies son credenciales de sesión completas, así que **nunca**
tocan el navegador ni el repo.

> ⚠️ Nada de esto es un API oficial de HoYoverse. Es el API interno de HoYoLAB, tolerado
> desde hace años por las herramientas comunitarias, pero puede cambiar sin aviso.

### 8.1 Preparar las cuentas (una vez, cada usuario)

En [hoyolab.com](https://www.hoyolab.com), con la cuenta de cada uno:

1. Perfil → Configuración → **Battle Chronicle en público**.
2. Activar **Notas en Tiempo Real** (Real-Time Notes).

Si falta alguno de los dos, el API responde `DataNotPublic` y la card lo dice explícitamente.

### 8.2 Obtener las cookies

Con sesión iniciada en HoYoLAB: ir al propio perfil → DevTools → pestaña **Network** con
"Preserve Log" → refrescar → buscar la petición `getGameRecordCard` → pestaña **Cookies** →
copiar `ltoken_v2` y `ltuid_v2` (si aparece `ltmid_v2`, cópiala también).

### 8.3 Tabla de caché + secrets + deploy

```bash
# 1. Ejecutar supabase/genshin.sql en el SQL Editor (tabla genshin_cache, RLS deny-all)

# 2. Secrets (los UID son los de juego, visibles en el perfil dentro del juego)
supabase secrets set \
  HOYO_PRESIDENTE_LTOKEN=... HOYO_PRESIDENTE_LTUID=... HOYO_PRESIDENTE_UID=... \
  HOYO_MINISTRO_LTOKEN=... HOYO_MINISTRO_LTUID=... HOYO_MINISTRO_UID=...

# Opcionales: HOYO_PRESIDENTE_LTMID / HOYO_MINISTRO_LTMID si la cookie existía,
# y HOYO_DS_SALT si miHoYo llegara a rotar el salt del header DS.

# 3. Deploy
supabase functions deploy genshin-notes
```

El servidor del juego se deriva del UID (6xxxxxxxx = América, 7 = Europa, 8/18 = Asia,
9 = TW/HK); no hay que configurarlo.

### 8.4 Renovación de cookies (rutina)

Las cookies de HoYoLAB **caducan cada varias semanas**. Cuando pase, la card muestra
"Sesión de HoYoLAB expirada" (solo para la cuenta afectada). Renovar es repetir §8.2 y:

```bash
supabase secrets set HOYO_PRESIDENTE_LTOKEN=... HOYO_PRESIDENTE_LTUID=...
```

No hace falta redeploy: los secrets nuevos aplican solos.

### 8.5 Caché y límites

- Las notas se cachean **5 min** en `genshin_cache`; Enka según el `ttl` que él mismo
  devuelve. Recargar la página no dispara llamadas extra a HoYoLAB.
- El botón "Actualizar" de la card salta la caché de notas, con una guardia mínima de 30 s.
- Ambas fuentes degradan por separado: si Enka falla, la card muestra los datos de HoYoLAB
  con el rol como nombre, y viceversa.

## 9. Probar

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

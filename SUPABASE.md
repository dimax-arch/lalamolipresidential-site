# Autenticación con Supabase — Palacio Presidencial

## 1. Crear proyecto

1. Entra en [supabase.com](https://supabase.com) y crea un proyecto.
2. En **Project Settings → API**, copia:
   - **Project URL**
   - **anon public** key

## 2. Configurar la app

```bash
copy supabase-config.example.js supabase-config.js
```

Edita `supabase-config.js` y pega tu URL y clave anon.

## 3. Crear usuarios del gabinete

En el dashboard: **Authentication → Users → Add user**.

Crea dos usuarios (marca **Auto Confirm User**):

| Correo (ejemplo)              | Contraseña | User Metadata (JSON) |
|-------------------------------|------------|----------------------|
| `presidente@palacio.local`    | (segura)   | `{ "role": "president", "display_name": "Presidente" }` |
| `ministro@palacio.local`      | (segura)   | `{ "role": "minister", "display_name": "Ministro" }` |

El campo `role` debe ser exactamente `president` o `minister` para que la app asigne el perfil correcto.

## 4. Sincronización en tiempo real (obligatorio)

En **SQL Editor**, ejecuta todo el archivo `supabase/sync-tables.sql`.

En el dashboard: **Database → Publications** (o **Replication**) y confirma que `decretos` y `mensajes` están en la publicación **supabase_realtime**.

## 5. (Opcional) Tabla de perfiles

Ejecuta `supabase/setup.sql` si quieres perfiles en base de datos.

## 6. Probar

Abre la app con un servidor local (p. ej. `python -m http.server 5500`) e inicia sesión con dos navegadores o dispositivos (presidente y ministro). Los decretos y mensajes deben aparecer al instante en ambos.

## Notas

- Los datos viven en Supabase; ya no se usan en `localStorage`.
- No subas `supabase-config.js` a repositorios públicos; ya está en `.gitignore`.

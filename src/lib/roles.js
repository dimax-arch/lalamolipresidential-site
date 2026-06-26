// Mapeo de usuario de Supabase Auth → userKey del gabinete.
//
// Módulo puro (sin dependencias de Vite ni Supabase) para que tanto la app
// como las pruebas (`node --test`) puedan importarlo. Por eso el import de
// constants lleva extensión .js explícita (Node ESM no resuelve extensiones).
import { ROLE_TO_USER_KEY } from './constants.js';

export function userKeyFromAuthUser(user) {
  // app_metadata (controlado por el servidor) tiene prioridad: sobrevive al
  // login OAuth de Spotify y no es editable por el usuario. user_metadata
  // queda como respaldo para sesiones antiguas de email/contraseña.
  // Debe coincidir con la función SQL public.auth_user_key().
  const role = user?.app_metadata?.role || user?.user_metadata?.role;
  return ROLE_TO_USER_KEY[role] || null;
}

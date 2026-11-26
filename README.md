# Cenit · Gestión de tickets

Base de la aplicación multiusuario de Cenit. La maqueta anterior se conserva en `Cenit · Gestión de tickets.html`; la aplicación nueva se inicia desde `index.html`.

## Arquitectura

- Vite + TypeScript para la aplicación web.
- Firebase Authentication para inicio de sesión con correo y contraseña.
- Cloud Firestore para perfiles, tickets y comentarios.
- Cloud Functions para invitaciones administrativas, almacenamiento de reportes de error, actualización segura de su estado de correo y asignación confiable de roles.
- Rutas serverless de Vercel para enviar correos de soporte y solicitudes comerciales con Resend.
- Las reglas de Firestore son la autoridad de acceso; ocultar acciones en la interfaz no constituye autorización.

Los roles son `user` (solicitante), `agent` y `admin`. No hay registro público. El primer administrador se prepara desde una cuenta creada en Firebase Authentication mediante `scripts/set-admin.mjs`.

La navegación usa rutas con enlaces directos: `#/tickets/mine`, `#/tickets/all`, `#/admin/users` y `#/admin/reports`. Las vistas de acceso, tickets, usuarios, reportes y rutas están separadas en `src/modules/`.

## Desarrollo local

Requiere Node.js 22 para el runtime de Cloud Functions.

1. Crea un proyecto Firebase y habilita Authentication con proveedor de correo/contraseña, Firestore y Cloud Functions.
2. Copia `.env.example` a `.env` y completa los cuatro valores de configuración web desde la consola del proyecto. Las variables `RESEND_API_KEY` y `RESEND_FROM_EMAIL` son solo para las rutas de correo del servidor; nunca uses el prefijo `VITE_` para ellas.
3. Instala y ejecuta:

   ```sh
   npm install
   npm run dev
   ```

4. Instala las dependencias de Functions y descarga una clave de cuenta de servicio desde la configuración del proyecto Firebase. Guárdala localmente en `secrets/firebase-admin-service-account.json`; no la compartas ni la subas al repositorio. La variable `GOOGLE_APPLICATION_CREDENTIALS` de `.env` apunta a ese archivo.
5. Crea o promueve el primer administrador:

   ```sh
   cd functions && npm install && cd ..
   npm run set-admin -- admin@empresa.com "Nombre del administrador"
   ```

   Si la cuenta todavía no existe, el script la crea con una contraseña aleatoria y guarda el enlace de configuración en `secrets/admin-password-setup-link.txt`. La cuenta debe volver a iniciar sesión para que Firebase renueve los claims.

## Invitaciones

Desde **Usuarios**, un administrador puede crear perfiles e invitar solicitantes o agentes. La función asigna el rol en custom claims y genera un enlace de restablecimiento para que el usuario establezca su contraseña. En esta primera versión el enlace se muestra al administrador para copiarlo y compartirlo por un canal corporativo seguro; el correo automático de invitaciones no está habilitado.

## Reportar errores

El botón **Reportar error** está disponible en el inicio de sesión y dentro del sistema. Los reportes se guardan en `errorReports` mediante Cloud Functions y su correo se envía desde una ruta de Vercel con Resend a `soporte@vendedores.site`; los administradores pueden revisarlos en **Reportes**. El formulario envía la descripción, la pantalla y el correo de contacto (si se proporciona), pero no contraseñas. Firebase limita la creación de reportes y la ruta de Vercel aplica una limitación básica por instancia.

En cada plan, **Contactar con ventas** abre un formulario con el plan seleccionado. Nombre y correo son obligatorios; empresa, teléfono y mensaje son opcionales. La solicitud se envía a `soporte@vendedores.site` desde una ruta de Vercel mediante Resend y no realiza cobros ni crea una compra automáticamente.

Configura estas variables en **Vercel → Project Settings → Environment Variables** y vuelve a desplegar el proyecto:

- `RESEND_API_KEY`: clave privada de Resend.
- `RESEND_FROM_EMAIL` (opcional): remitente verificado; por defecto es `Cenit <soporte@vendedores.site>`.

Verifica el dominio del remitente en Resend antes de enviar correos. Estas credenciales no se configuran en Firebase ni se exponen al navegador. Para probar las rutas localmente, usa Vercel CLI (`vercel dev`); `npm run dev` inicia solo Vite y no ejecuta `/api`.

App Check queda aplazado por ahora. Las acciones administrativas validan sesión y rol en el servidor; la creación de reportes tiene límite por dirección IP en Firestore y las rutas de correo tienen un límite básico en memoria por instancia serverless, no distribuido. Nunca se aceptan roles enviados desde el cliente como fuente de autoridad.

## Despliegue

Instala Firebase CLI, inicia sesión y selecciona el proyecto para desplegar las reglas y funciones:

```sh
firebase login
firebase use --add
npm run build
cd functions && npm install && npm run build && cd ..
firebase deploy
```

En Vercel, configura las variables de Resend indicadas arriba y despliega la aplicación. Configura los dominios autorizados de Authentication antes de habilitar usuarios.

## Datos

- `users/{uid}`: perfil de usuario. La escritura desde el cliente está bloqueada.
- `tickets/{ticketId}`: solicitud y estado operativo.
- `tickets/{ticketId}/comments/{commentId}`: actividad escrita como comentarios inmutables.
- `errorReports/{reportId}`: reportes enviados al soporte; solo administradores pueden leerlos y cambiar su estado de revisión. La actualización del estado del correo se autoriza con un token de un solo uso, no con permisos del cliente.

Las reglas dan acceso a los solicitantes solo a tickets propios y a los roles de soporte acceso operativo. La maqueta HTML independiente usa `localStorage` y sus datos no se importan automáticamente a Firestore.

# Cenit · Gestión de tickets

Base de la aplicación multiusuario de Cenit. La maqueta anterior se conserva en `Cenit · Gestión de tickets.html`; la aplicación nueva se inicia desde `index.html`.

## Arquitectura

- Vite + TypeScript para la aplicación web.
- Firebase Authentication para inicio de sesión con correo y contraseña.
- Cloud Firestore para perfiles, tickets y comentarios.
- Cloud Functions para invitaciones administrativas, reportes de error, consultas comerciales y asignación confiable de roles.
- Las reglas de Firestore son la autoridad de acceso; ocultar acciones en la interfaz no constituye autorización.

Los roles son `user` (solicitante), `agent` y `admin`. No hay registro público. El primer administrador se prepara desde una cuenta creada en Firebase Authentication mediante `scripts/set-admin.mjs`.

La navegación usa rutas con enlaces directos: `#/tickets/mine`, `#/tickets/all`, `#/admin/users` y `#/admin/reports`. Las vistas de acceso, tickets, usuarios, reportes y rutas están separadas en `src/modules/`.

## Desarrollo local

Requiere Node.js 22 para el runtime de Cloud Functions.

1. Crea un proyecto Firebase y habilita Authentication con proveedor de correo/contraseña, Firestore y Cloud Functions.
2. Copia `.env.example` a `.env` y completa los cuatro valores de configuración web desde la consola del proyecto.
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

El botón **Reportar error** está disponible en el inicio de sesión y dentro del sistema. Los reportes se guardan en `errorReports` y se envían automáticamente con Resend a `soporte@vendedores.site`; los administradores pueden revisarlos en **Reportes**. El formulario envía la descripción, la pantalla y el correo de contacto (si se proporciona), pero no contraseñas. Los envíos tienen un límite básico por dirección IP.

En cada plan, **Contactar con ventas** abre un formulario con el plan seleccionado. Nombre y correo son obligatorios; empresa, teléfono y mensaje son opcionales. La solicitud se envía a `soporte@vendedores.site` mediante Resend y no realiza cobros ni crea una compra automáticamente.

Antes de desplegar Functions, configura la clave de Resend como secreto:

```sh
firebase functions:secrets:set RESEND_API_KEY
```

El remitente predeterminado es `Cenit <soporte@vendedores.site>`. Verifica ese dominio en Resend antes de enviar correos; si usas otro remitente, define `RESEND_FROM_EMAIL` para el proyecto en el entorno de Functions.

App Check queda aplazado por ahora. Las acciones administrativas validan sesión y rol en el servidor; los formularios públicos de errores y ventas tienen límites por dirección IP. Antes de una publicación pública, conviene activar App Check y su enforcement. Nunca se aceptan roles enviados desde el cliente como fuente de autoridad.

## Despliegue

Instala Firebase CLI, inicia sesión y selecciona el proyecto:

```sh
firebase login
firebase use --add
npm run build
cd functions && npm install && npm run build && cd ..
firebase deploy
```

Configura los dominios autorizados de Authentication antes de habilitar usuarios.

## Datos

- `users/{uid}`: perfil de usuario. La escritura desde el cliente está bloqueada.
- `tickets/{ticketId}`: solicitud y estado operativo.
- `tickets/{ticketId}/comments/{commentId}`: actividad escrita como comentarios inmutables.
- `errorReports/{reportId}`: reportes enviados al soporte; solo administradores pueden leerlos y cambiar su estado de revisión.

Las reglas dan acceso a los solicitantes solo a tickets propios y a los roles de soporte acceso operativo. La maqueta HTML independiente usa `localStorage` y sus datos no se importan automáticamente a Firestore.

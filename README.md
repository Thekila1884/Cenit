# Cenit · Gestión de tickets

Base de la aplicación multiusuario de Cenit. La maqueta anterior se conserva en `Cenit · Gestión de tickets.html`; la aplicación nueva se inicia desde `index.html`.

## Arquitectura

- Vite + TypeScript para la aplicación web.
- Firebase Authentication para inicio de sesión con correo y contraseña.
- Cloud Firestore para perfiles, tickets y comentarios.
- Rutas serverless de Vercel con Firebase Admin SDK para invitaciones y reportes; Resend envía correos de soporte y ventas.
- Un `companyId` de 10 dígitos en perfiles, tickets y reportes. Los custom claims y reglas de Firestore aíslan cada empresa.
- Las reglas de Firestore son la autoridad de acceso; ocultar acciones en la interfaz no constituye autorización.

Los roles son `user` (solicitante), `agent` y `admin`. No hay registro público. La empresa se asigna al perfil y a los custom claims; el ID escrito en el login debe coincidir con esa asignación.

La navegación usa rutas con enlaces directos: `#/tickets/mine`, `#/tickets/all`, `#/admin/users`, `#/admin/reports` y `#/admin/settings`. Las vistas de acceso, tickets, usuarios, reportes, configuración y rutas están separadas en `src/modules/`.

## Configuración de tickets

Los administradores pueden configurar desde **Configuración** las categorías, tipos y fallas disponibles en el formulario de tickets. Las opciones se guardan por empresa en `companySettings/{companyId}`; por ejemplo, `Periféricos → Mouse → Dañado / Sin batería / No funciona`. Los demás usuarios de la misma empresa pueden seleccionar esas opciones al crear tickets. El campo visible **Asunto** conserva el nombre interno `title` para no afectar los tickets existentes.

## Desarrollo local

Requiere Node.js 22.

1. Crea un proyecto Firebase y habilita Authentication con proveedor de correo/contraseña y Firestore.
2. Copia `.env.example` a `.env` y completa los valores de configuración web. Configura localmente `GOOGLE_APPLICATION_CREDENTIALS` para que apunte al archivo de cuenta de servicio ignorado por Git.
3. Instala y ejecuta:

   ```sh
   npm install
   npm run dev
   ```

4. Descarga una cuenta de servicio desde Firebase y guárdala localmente en `secrets/firebase-admin-service-account.json`; no la compartas ni la subas al repositorio.
5. Inicializa o migra la empresa existente:

   ```sh
   npm run bootstrap-company -- "Vendors, S.A."
   ```

   El script asigna un ID aleatorio único de 10 dígitos, agrega `companyId` a los perfiles/tickets/reportes actuales y actualiza los custom claims. El ID se muestra en **Usuarios** para que se lo compartas al equipo.

6. Despliega las reglas e índices:

   ```sh
   firebase deploy --only firestore:rules,firestore:indexes
   ```

Para registrar otra empresa y su primer administrador, usa el script local con cuenta de servicio. Genera un ID de 10 dígitos único, crea la empresa y guarda el enlace de configuración de contraseña en `secrets/`:

```sh
npm run create-company-admin -- "Nombre de empresa" admin@empresa.com "Nombre del administrador"
```

Los administradores creados desde **Usuarios** solo pueden invitar personas a su propia empresa.

## Invitaciones

Desde **Usuarios**, un administrador puede invitar personas únicamente a su propia empresa. La ruta de Vercel valida el token de Firebase, rol y `companyId`, crea la cuenta y envía la invitación mediante Resend. El correo incluye un enlace de Firebase para configurar la contraseña, el ID de empresa y el acceso al login; el enlace no se muestra en la interfaz del administrador.

## Reportar errores

El botón **Reportar error** está disponible en el inicio de sesión y dentro del sistema. Una ruta de Vercel valida la empresa y, si hay sesión, el token; guarda el reporte con su `companyId` y envía el correo con Resend a `soporte@vendedores.site`. Los administradores solo pueden revisar reportes de su propia empresa. No se envían contraseñas.

En cada plan, **Contactar con ventas** abre un formulario con el plan seleccionado. Nombre y correo son obligatorios; empresa, teléfono y mensaje son opcionales. La solicitud se envía a `soporte@vendedores.site` desde una ruta de Vercel mediante Resend y no realiza cobros ni crea una compra automáticamente.

Configura estas variables en **Vercel → Project Settings → Environment Variables** y vuelve a desplegar el proyecto:

- `RESEND_API_KEY`: clave privada de Resend.
- `RESEND_FROM_EMAIL` (opcional): remitente verificado; por defecto es `Cenit <soporte@vendedores.site>`.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: contenido JSON de una cuenta de servicio de Firebase con acceso a Authentication y Firestore. Es un secreto de servidor: no uses prefijo `VITE_`, no lo pongas en archivos versionados y no lo compartas en chats.

Verifica el dominio del remitente en Resend antes de enviar correos. Ninguna de estas credenciales se expone al navegador. Para probar las rutas localmente, usa Vercel CLI (`vercel dev`); `npm run dev` inicia solo Vite y no ejecuta `/api`.

Las rutas de Vercel tienen límites básicos por instancia serverless; no son límites distribuidos. Las acciones administrativas validan sesión, rol y empresa en el servidor. Nunca se aceptan roles o empresas enviados por el cliente como fuente de autoridad.

## Despliegue

Instala Firebase CLI, inicia sesión y selecciona el proyecto para desplegar las reglas e índices:

```sh
firebase login
firebase use --add
npm run build
firebase deploy --only firestore:rules,firestore:indexes
```

En Vercel, configura las variables de Resend y Firebase Admin indicadas arriba y despliega la aplicación. Configura los dominios autorizados de Authentication antes de habilitar usuarios. Este despliegue no requiere Cloud Functions ni el plan Blaze.

## Datos

- `companies/{companyId}`: empresa; lectura limitada a usuarios activos de ese tenant.
- `users/{uid}`: perfil de usuario con `companyId`. La escritura desde el cliente está bloqueada.
- `tickets/{ticketId}`: solicitud y estado operativo, siempre asociada a un `companyId`.
- `companySettings/{companyId}`: categorías de tickets de la empresa; lectura para miembros activos y escritura exclusiva de administradores del mismo tenant.
- `tickets/{ticketId}/comments/{commentId}`: actividad escrita como comentarios inmutables.
- `errorReports/{reportId}`: reportes enviados al soporte, con lectura y revisión limitadas a administradores de la empresa asociada.

Las reglas dan acceso a los solicitantes solo a tickets propios y a los roles de soporte acceso operativo dentro de su empresa. La maqueta HTML independiente usa `localStorage` y sus datos no se importan automáticamente a Firestore.

# Propuesta de login del 05/11/2026

## Referencia anterior

- Commit de referencia: `292e63ba34693119e0775bbf24b03e91f260fa36`.
- Rama local de respaldo: `referencia-login-actual-2026-11-05`.
- Archivo original: `src/pages/Login.tsx`.

Para volver al diseño anterior, restaurar únicamente ese archivo desde la
referencia. No es necesario revertir los demás cambios del sistema:

```powershell
git restore --source=referencia-login-actual-2026-11-05 -- src/pages/Login.tsx
```

La hoja nueva `src/pages/Login.css` queda sin importar al restaurar el archivo
anterior y puede retirarse como parte de esa reversión.

## Propuesta

La variante final solicitada centra una tarjeta blanca de acceso sobre el fondo
azul de la primera propuesta, con el mismo degradado suave y trama de puntos.
Conserva el logo de Vortex, un título breve, email, contraseña y botón Ingresar.
Se retiraron los textos comerciales, módulos, órbitas y pie de página.
Por pedido posterior se sumaron arcos decorativos en las esquinas del fondo,
puntos de luz y pequeñas figuras geométricas, sin animaciones y fuera del
formulario. Estos elementos no reciben eventos ni aparecen para lectores de
pantalla.
Se agregó un pie discreto sobre el fondo azul con el enlace “Conocé Vortex
Gestión” a `/` (landing pública existente) y el texto “VORTEX GESTIÓN —
© 2026 Marcos Abella”. Por ajuste posterior, el pie queda pegado a la tarjeta:
ambos forman un único bloque centrado y ligeramente elevado, con 8–12 píxeles
de separación. No se reserva una franja independiente al fondo de la pantalla.
La tarjeta blanca se amplió a una altura mínima de 560 píxeles cuando hay
espacio; en pantallas bajas esa altura se adapta al viewport, reservando espacio
para el pie y los márgenes. El contenido se centra verticalmente en la tarjeta.
El encabezado muestra “BIENVENIDO A” sobre el logo de Vortex, con tipografía
sans serif compacta, mayor cuerpo y peso seminegrita; reemplaza el título
“Iniciar sesión”. Se retiró la primera variante de letras finas y espaciadas
por preferencia del usuario.
El formulario permanece centrado también en celular y admite desplazamiento
vertical si la altura disponible es pequeña.
Se conserva la identidad de cada comercio y el flujo de autenticación existente.
Se agrega mostrar/ocultar contraseña y mensaje de error asociado a los campos,
con etiquetas, autocompletado, foco visible y soporte de movimiento reducido.
No se agregan proveedores de acceso ni enlaces de funciones inexistentes.

Referencias consultadas:

- https://screenrove.com/blog/login-page-design-examples (22/10/2026).
- https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html

## Verificación local

- `npx tsc --noEmit`: correcto.
- ESLint de `src/pages/Login.tsx`: sin errores ni advertencias.
- Renderizado del componente real en Chrome con autenticación simulada:
  escritorio 1440 × 940, móviles 390 × 844 y 320 × 740, y acceso por comercio.
- Sin desborde horizontal en esos tamaños.
- Se corrigió el espacio reservado por el footer: formulario y pie comparten un
  bloque, con altura de viewport dinámica y márgenes compactos según el alto
  disponible.
- Sin scroll vertical ni horizontal verificado también en 1366 × 768,
  1280 × 650 y 320 × 568; acceso por comercio en 1366 × 768 y 360 × 640.
- Mostrar/ocultar contraseña y anuncio de error verificados.
- Capturas del diseño anterior y de la propuesta en
  `private-backups/login-preview/` (directorio privado excluido de Git).
- Publicado por pedido expreso el 05/11/2026 junto al programa de referidos, en
  https://vortexgestion.netlify.app, deploy `6aec7685426dee03a9b95063`.
  El rediseño del login no modifica el backend de autenticación.

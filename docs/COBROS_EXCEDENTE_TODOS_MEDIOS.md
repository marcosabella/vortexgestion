# Cobros con excedente para todos los medios

El 14/11/2026, con autorización expresa del usuario, se aplicó únicamente la migración `20261114110000_cobros_excedente_todos_medios_cliente.sql` al proyecto productivo `zhtqkygjvaaizbdwwsbi`. Su versión se separó de `20261114100000_transporte_viaje_realizado`, ya existente. No se aplicaron otras migraciones.

Los cobros en efectivo, transferencia, tarjeta y cheque permiten recibir importes superiores a la deuda imputable. El importe aplicado a los comprobantes se limita a la deuda disponible; el resto queda como crédito general del cliente, conservando medio de pago, fecha, moneda y observaciones. El recibo incluye el importe completo y el saldo posterior. Por ejemplo, una factura de $7.000 y una transferencia de $22.000 dejan $15.000 a favor cuando no hay otra deuda.

Se respaldó la definición anterior en `private-backups/`, excluido de Git. Antes de reemplazarla se verificó su hash `ab21d6c56616aecae3523022710ccb98`; la nueva función coincide con el archivo local por hash `76d18818339a12229a446c80c7e6ba6d`. Se confirmó el registro de la migración, el soporte de excedentes y los permisos: `authenticated` puede ejecutar y `anon` no. La aplicación utilizó una transacción y no modificó cobros históricos.

Frontend publicado en https://vortexgestion.netlify.app, despliegue `6afb602779b0410a60a461fc`: https://app.netlify.com/projects/vortexgestion/deploys/6afb602779b0410a60a461fc.

Validación: build de producción correcto; 38 pruebas PostgreSQL locales de cobros y 17 de recibos correctas; prueba automatizada de interfaz con los cuatro medios y pagos adicionales correcta; lint de los dos archivos frontend modificados sin errores. `npx tsc --noEmit` finaliza correctamente; el chequeo adicional con `-p tsconfig.app.json` informa errores en otros archivos del repositorio. Se verificaron HTTP 200, coincidencia SHA-256 del HTML y sus archivos JS/CSS principales, y resolución de la ruta SPA de cuenta corriente. No se registraron pagos reales ni se realizó una validación manual autenticada en producción.

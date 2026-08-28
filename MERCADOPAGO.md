# Mercado Pago multi-comercio

La integracion usa OAuth por comercio. Ningun Access Token se expone al navegador. Checkout Pro, QR y webhooks se ejecutan en Supabase Edge Functions.

## Secretos requeridos

Configurar antes de desplegar:

```powershell
supabase secrets set MP_CLIENT_ID=... MP_CLIENT_SECRET=...
supabase secrets set MP_OAUTH_REDIRECT_URI=https://zhtqkygjvaaizbdwwsbi.supabase.co/functions/v1/mercadopago-oauth-callback
supabase secrets set SVW_APP_URL=https://URL-DEL-SISTEMA
supabase secrets set MP_ALLOWED_STORE_ORIGINS=https://URL-TIENDA-1,https://URL-TIENDA-2
supabase secrets set MP_CHECKOUT_WEBHOOK_SECRET=...
supabase secrets set MP_QR_WEBHOOK_SECRET=...
```

Registrar `MP_OAUTH_REDIRECT_URI` exactamente igual en Mercado Pago Developers. Configurar el webhook de Checkout en:

```text
https://zhtqkygjvaaizbdwwsbi.supabase.co/functions/v1/mercadopago-webhook
```

## Despliegue

```powershell
supabase db push
supabase functions deploy mercado-pago
supabase functions deploy mercadopago-checkout
supabase functions deploy mercadopago-oauth-callback
supabase functions deploy mercadopago-webhook
```

## Alta de un comercio

1. Habilitar el modulo Mercado Pago en su parametrizacion.
2. Ingresar a Configuracion > Mercado Pago.
3. Conectar la cuenta mediante OAuth.
4. Habilitar Checkout Pro y/o QR.
5. Para QR, crear sucursal y caja.
6. Validar pagos de prueba antes de seleccionar produccion.

Los pedidos con envio siguen a coordinar hasta que la tienda pueda calcular e incluir el costo de envio antes del pago.

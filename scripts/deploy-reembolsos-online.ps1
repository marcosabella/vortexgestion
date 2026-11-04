param(
  [ValidateSet('Preflight','Migrar','Verificar','CorregirImporte','Compatibilidad')][string]$Paso = 'Preflight',
  [string]$EstadoHash,
  [string]$PagoHash
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ReembolsoSupabaseCredential {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags; public UInt32 Type; public string TargetName;
    public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
    public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr credential);
  public static string Read(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) return null;
    try {
      var value = (Credential)Marshal.PtrToStructure(ptr, typeof(Credential));
      var bytes = new byte[value.CredentialBlobSize];
      Marshal.Copy(value.CredentialBlob, bytes, 0, bytes.Length);
      var utf8 = System.Text.Encoding.UTF8.GetString(bytes).TrimEnd('\0');
      if (utf8.StartsWith("sbp_")) return utf8;
      return System.Text.Encoding.Unicode.GetString(bytes).TrimEnd('\0');
    } finally { CredFree(ptr); }
  }
}
'@

$reembolsoToken = $env:SUPABASE_ACCESS_TOKEN
if (!$reembolsoToken) { $reembolsoToken = [ReembolsoSupabaseCredential]::Read('Supabase CLI:supabase') }
if (!$reembolsoToken) { $reembolsoToken = [ReembolsoSupabaseCredential]::Read('Supabase CLI:access-token') }
if (!$reembolsoToken) { throw 'No se encontro la credencial de Supabase CLI.' }
$reembolsoProject = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if ($reembolsoProject -ne 'zhtqkygjvaaizbdwwsbi') { throw 'Proyecto inesperado.' }
$reembolsoVersion = '20261104120000'
$reembolsoMigration = [IO.File]::ReadAllText((Join-Path (Get-Location) 'supabase/migrations/20261104120000_reembolso_cancelacion_pedido_online.sql'))
try {
  $reembolsoQuery = switch ($Paso) {
    'Compatibilidad' { "SELECT to_regclass('public.pedido_online_reembolsos') IS NOT NULL AS reembolsos, to_regclass('public.pedido_online_cancelaciones') IS NOT NULL AS cancelaciones_facturadas, to_regprocedure('public.generar_comprobante_pedido_online(uuid,uuid,public.tipo_comprobante,uuid)') IS NOT NULL AS generar_comprobante;" }
    'Preflight' {
      @'
SELECT jsonb_build_object(
 'funciones',(SELECT jsonb_agg(jsonb_build_object('firma',oid::regprocedure::text,'hash',md5(prosrc),'definicion',pg_get_functiondef(oid))) FROM pg_proc WHERE oid IN ('public.actualizar_estado_pedido_online(uuid,text)'::regprocedure,'public.registrar_pago_mercadopago_aprobado(uuid,text,text,integer,jsonb)'::regprocedure)),
 'migracion_aplicada',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261104120000'),
 'tabla_existe',to_regclass('public.pedido_online_reembolsos') IS NOT NULL,
 'columnas',(SELECT jsonb_agg(table_name||'.'||column_name) FROM information_schema.columns WHERE table_schema='public' AND (table_name='comercio_usuarios' AND column_name IN ('rol','activo','solo_restaurante') OR table_name='mercadopago_operaciones' AND column_name IN ('payment_id','approved_at','importe_reembolsado') OR table_name='pedidos_online' AND column_name IN ('importe_pagado','venta_id')))
) AS preflight;
'@
    }
    'Migrar' {
      if ($EstadoHash -notmatch '^[a-f0-9]{32}$' -or $PagoHash -notmatch '^[a-f0-9]{32}$') { throw 'Se requieren las huellas del preflight revisado.' }
      $reembolsoGuard = @'
DO $guard$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.actualizar_estado_pedido_online(uuid,text)'::regprocedure)<>'ESTADO_HASH'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.registrar_pago_mercadopago_aprobado(uuid,text,text,integer,jsonb)'::regprocedure)<>'PAGO_HASH' THEN
   RAISE EXCEPTION 'Las funciones cambiaron desde el preflight';
 END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261104120000') THEN
   RAISE EXCEPTION 'La migracion ya figura aplicada';
 END IF;
END $guard$;
'@
      $reembolsoGuard = $reembolsoGuard.Replace('ESTADO_HASH',$EstadoHash).Replace('PAGO_HASH',$PagoHash)
      $reembolsoStatement = $reembolsoMigration.Replace("'", "''")
      "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';`n$reembolsoGuard`n$reembolsoMigration`nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('$reembolsoVersion','reembolso_cancelacion_pedido_online',ARRAY['$reembolsoStatement']); NOTIFY pgrst, 'reload schema'; COMMIT;"
    }
    'CorregirImporte' {
      $reembolsoFix = [IO.File]::ReadAllText((Join-Path (Get-Location) 'supabase/migrations/20261104123000_corregir_importe_reembolso_online.sql'))
      $reembolsoFixStatement = $reembolsoFix.Replace("'", "''")
      $reembolsoFixGuard = @'
DO $guard$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.sincronizar_reembolso_pedido_online(uuid,text,numeric,text)'::regprocedure)<>'af65d6c1f380217e08c5b4ce4ff95978' THEN RAISE EXCEPTION 'La funcion de reembolsos cambio'; END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261104123000') THEN RAISE EXCEPTION 'Correccion ya aplicada'; END IF;
END $guard$;
'@
      "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';`n$reembolsoFixGuard`n$reembolsoFix`nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261104123000','corregir_importe_reembolso_online',ARRAY['$reembolsoFixStatement']); COMMIT;"
    }
    'Verificar' {
      @'
SELECT jsonb_build_object(
 'migracion',(SELECT jsonb_build_object('version',version,'name',name) FROM supabase_migrations.schema_migrations WHERE version='20261104120000'),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.pedido_online_reembolsos'::regclass),
 'registros',(SELECT count(*) FROM public.pedido_online_reembolsos),
 'funciones',(SELECT jsonb_agg(jsonb_build_object('nombre',proname,'hash',md5(prosrc),'security_definer',prosecdef,'config',proconfig)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('validar_reembolso_online_tenant','preparar_reembolso_pedido_online','fijar_importe_reembolso_online','sincronizar_reembolso_pedido_online','finalizar_intento_reembolso_online','actualizar_estado_pedido_online','registrar_pago_mercadopago_aprobado')),
 'permisos',jsonb_build_object(
  'anon_preparar',has_function_privilege('anon','public.preparar_reembolso_pedido_online(uuid,uuid,uuid)','EXECUTE'),
  'authenticated_preparar',has_function_privilege('authenticated','public.preparar_reembolso_pedido_online(uuid,uuid,uuid)','EXECUTE'),
  'service_preparar',has_function_privilege('service_role','public.preparar_reembolso_pedido_online(uuid,uuid,uuid)','EXECUTE'),
  'authenticated_escribir',has_table_privilege('authenticated','public.pedido_online_reembolsos','INSERT'),
  'authenticated_leer',has_table_privilege('authenticated','public.pedido_online_reembolsos','SELECT'))
) AS verificacion;
'@
    }
  }
  $reembolsoBody = @{ query = $reembolsoQuery } | ConvertTo-Json -Compress
  $reembolsoResult = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$reembolsoProject/database/query" -Headers @{ Authorization = "Bearer $reembolsoToken" } -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($reembolsoBody)) -TimeoutSec 60
  if ($Paso -eq 'Preflight') {
    $reembolsoBackupDir = Join-Path (Get-Location) 'private-backups'
    [IO.Directory]::CreateDirectory($reembolsoBackupDir) | Out-Null
    $reembolsoBackupFile = Join-Path $reembolsoBackupDir ('reembolsos-online-preflight-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.json')
    [IO.File]::WriteAllText($reembolsoBackupFile,($reembolsoResult | ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Write-Output "Backup de funciones: $reembolsoBackupFile"
  }
  if ($Paso -eq 'Verificar') {
    $reembolsoRemoteFunctions = @($reembolsoResult)[0].verificacion.funciones
    $reembolsoMatches = [regex]::Matches($reembolsoMigration,'CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;')
    foreach ($reembolsoMatch in $reembolsoMatches) {
      $reembolsoName = $reembolsoMatch.Groups[1].Value
      $reembolsoExpectedBody = $reembolsoMatch.Groups[2].Value
      if ($reembolsoName -eq 'sincronizar_reembolso_pedido_online') {
        $reembolsoFixPath = Join-Path (Get-Location) 'supabase/migrations/20261104123000_corregir_importe_reembolso_online.sql'
        if (Test-Path -LiteralPath $reembolsoFixPath) { $reembolsoExpectedBody = [regex]::Match([IO.File]::ReadAllText($reembolsoFixPath),'AS \$\$([\s\S]*?)\$\$;').Groups[1].Value }
      }
      $reembolsoHashBytes = [Security.Cryptography.MD5]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($reembolsoExpectedBody))
      $reembolsoExpectedHash = ([BitConverter]::ToString($reembolsoHashBytes)).Replace('-','').ToLowerInvariant()
      $reembolsoActualHash = ($reembolsoRemoteFunctions | Where-Object { $_.nombre -eq $reembolsoName }).hash
      if ($reembolsoActualHash -ne $reembolsoExpectedHash) { throw "La funcion $reembolsoName no coincide con la migracion local." }
    }
    if ($reembolsoMatches.Count -ne 7) { throw 'No se verificaron las siete funciones de la migracion.' }
    Write-Output 'Las siete funciones coinciden con la migracion local.'
  }
  $reembolsoResult | ConvertTo-Json -Depth 20
} finally { $reembolsoToken = $null }

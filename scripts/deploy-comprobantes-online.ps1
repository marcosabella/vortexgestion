param([ValidateSet('Preflight','Migrar','Verificar','Probar')][string]$Paso = 'Preflight')
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ComprobantesSupabaseCredential {
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

$comprobanteToken = $env:SUPABASE_ACCESS_TOKEN
if (!$comprobanteToken) { $comprobanteToken = [ComprobantesSupabaseCredential]::Read('Supabase CLI:supabase') }
if (!$comprobanteToken) { $comprobanteToken = [ComprobantesSupabaseCredential]::Read('Supabase CLI:access-token') }
if (!$comprobanteToken) { throw 'No se encontro la credencial de Supabase CLI.' }
$comprobanteProject = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if ($comprobanteProject -ne 'zhtqkygjvaaizbdwwsbi') { throw 'Proyecto inesperado.' }
$comprobanteOne = [IO.File]::ReadAllText((Join-Path (Get-Location) 'supabase/migrations/20261104130000_comprobante_pedido_online.sql'))
$comprobanteTwo = [IO.File]::ReadAllText((Join-Path (Get-Location) 'supabase/migrations/20261104140000_cancelacion_online_facturada.sql'))
try {
  if ($Paso -eq 'Probar') {
    foreach ($comprobanteFunction in @('mercadopago-reembolsar-pedido','obtener-cae-afip')) {
      $comprobanteProbe = & curl.exe -sS --max-time 25 -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' --data '{}' "https://$comprobanteProject.supabase.co/functions/v1/$comprobanteFunction"
      if ($LASTEXITCODE -ne 0 -or ($comprobanteProbe -join "`n") -notmatch 'Usuario no autenticado[\s\S]*400$') { throw "Respuesta inesperada de $comprobanteFunction" }
      Write-Output "$comprobanteFunction inicia y rechaza solicitudes sin sesion (400)."
    }
    return
  }
  $comprobanteQuery = switch ($Paso) {
    'Preflight' {
      @'
SELECT jsonb_build_object(
 'funciones',(SELECT jsonb_agg(jsonb_build_object('firma',oid::regprocedure::text,'hash',md5(prosrc),'definicion',pg_get_functiondef(oid))) FROM pg_proc WHERE oid IN ('public.preparar_reembolso_pedido_online(uuid,uuid,uuid)'::regprocedure,'public.sincronizar_reembolso_pedido_online(uuid,text,numeric,text)'::regprocedure)),
 'aplicadas',(SELECT jsonb_agg(version) FROM supabase_migrations.schema_migrations WHERE version IN ('20261104123000','20261104130000','20261104140000')),
 'venta_duplicada',(SELECT count(*) FROM (SELECT venta_id FROM public.pedidos_online WHERE venta_id IS NOT NULL GROUP BY venta_id HAVING count(*)>1) x),
 'columnas_nuevas_existentes',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ventas' AND column_name IN ('origen_pedido_online_id','comprobante_asociado_id','anulado_at')),
 'cancelaciones_existe',to_regclass('public.pedido_online_cancelaciones') IS NOT NULL,
 'pedidos',(SELECT count(*) FROM public.pedidos_online),
 'pedido_24',(SELECT jsonb_build_object('id',id,'estado',estado,'estado_pago',estado_pago,'venta_id',venta_id,'total',total) FROM public.pedidos_online WHERE id='f12488a6-6650-4aa3-93d8-310274478941')
) AS preflight;
'@
    }
    'Migrar' {
      $comprobanteGuard = @'
DO $guard$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.preparar_reembolso_pedido_online(uuid,uuid,uuid)'::regprocedure)<>'d2139d16e06c171ed5ed991d7bcdcc65'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.sincronizar_reembolso_pedido_online(uuid,text,numeric,text)'::regprocedure)<>'bb344830d10d7e22e04798a585796e48' THEN RAISE EXCEPTION 'Las funciones cambiaron desde el preflight revisado'; END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('20261104130000','20261104140000')) THEN RAISE EXCEPTION 'Alguna migracion ya figura aplicada'; END IF;
END $guard$;
'@
      $comprobanteOneStatement = $comprobanteOne.Replace("'", "''")
      $comprobanteTwoStatement = $comprobanteTwo.Replace("'", "''")
      "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s';`n$comprobanteGuard`n$comprobanteOne`n$comprobanteTwo`nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261104130000','comprobante_pedido_online',ARRAY['$comprobanteOneStatement']),('20261104140000','cancelacion_online_facturada',ARRAY['$comprobanteTwoStatement']); NOTIFY pgrst, 'reload schema'; COMMIT;"
    }
    'Verificar' {
      @'
SELECT jsonb_build_object(
 'migraciones',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN ('20261104123000','20261104130000','20261104140000')),
 'funciones',(SELECT jsonb_agg(jsonb_build_object('nombre',proname,'hash',md5(prosrc))) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('generar_comprobante_pedido_online','proteger_venta_online','proteger_relacion_venta_online','validar_cancelacion_online','preparar_anulacion_comprobante_online','validar_anulacion_para_reembolso','proteger_vinculo_pedido_online','proteger_intento_cae_online','validar_pago_reembolso_online','preparar_reembolso_pedido_online','sincronizar_reembolso_pedido_online')),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.pedido_online_cancelaciones'::regclass),
 'cancelaciones',(SELECT count(*) FROM public.pedido_online_cancelaciones),
 'comprobantes_online',(SELECT count(*) FROM public.ventas WHERE origen_pedido_online_id IS NOT NULL),
 'pedidos',(SELECT count(*) FROM public.pedidos_online),
 'pedido_24',(SELECT jsonb_build_object('id',id,'estado',estado,'estado_pago',estado_pago,'venta_id',venta_id,'total',total) FROM public.pedidos_online WHERE id='f12488a6-6650-4aa3-93d8-310274478941'),
 'permisos',jsonb_build_object('anon_generar',has_function_privilege('anon','public.generar_comprobante_pedido_online(uuid,uuid,public.tipo_comprobante,uuid)','EXECUTE'),
 'usuario_generar',has_function_privilege('authenticated','public.generar_comprobante_pedido_online(uuid,uuid,public.tipo_comprobante,uuid)','EXECUTE'),
 'usuario_anular',has_function_privilege('authenticated','public.preparar_anulacion_comprobante_online(uuid,uuid,uuid)','EXECUTE'),
 'backend_anular',has_function_privilege('service_role','public.preparar_anulacion_comprobante_online(uuid,uuid,uuid)','EXECUTE'),
 'usuario_escribir_cancelacion',has_table_privilege('authenticated','public.pedido_online_cancelaciones','INSERT'))
) AS verificacion;
'@
    }
  }
  $comprobanteBody = @{ query = $comprobanteQuery } | ConvertTo-Json -Compress
  $comprobanteResult = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$comprobanteProject/database/query" -Headers @{ Authorization = "Bearer $comprobanteToken" } -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($comprobanteBody)) -TimeoutSec 60
  if ($Paso -eq 'Preflight') {
    $comprobanteBackupDir = Join-Path (Get-Location) 'private-backups'
    [IO.Directory]::CreateDirectory($comprobanteBackupDir) | Out-Null
    $comprobanteBackupFile = Join-Path $comprobanteBackupDir ('comprobantes-online-preflight-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.json')
    [IO.File]::WriteAllText($comprobanteBackupFile,($comprobanteResult | ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Write-Output "Backup de funciones y estado: $comprobanteBackupFile"
  }
  if ($Paso -eq 'Verificar') {
    $comprobanteRemote = @($comprobanteResult)[0].verificacion.funciones
    $comprobanteMatches = [regex]::Matches($comprobanteOne+"`n"+$comprobanteTwo,'CREATE (?:OR REPLACE )?FUNCTION public\.([a-z_]+)\([\s\S]*?AS \$\$([\s\S]*?)\$\$;')
    foreach ($comprobanteMatch in $comprobanteMatches) {
      $comprobanteName = $comprobanteMatch.Groups[1].Value
      $comprobanteBytes = [Security.Cryptography.MD5]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($comprobanteMatch.Groups[2].Value))
      $comprobanteHash = ([BitConverter]::ToString($comprobanteBytes)).Replace('-','').ToLowerInvariant()
      if (($comprobanteRemote | Where-Object { $_.nombre -eq $comprobanteName }).hash -ne $comprobanteHash) { throw "La funcion $comprobanteName no coincide con el archivo local" }
    }
    if ($comprobanteMatches.Count -ne 11) { throw 'No se verificaron las once funciones' }
    Write-Output 'Las once funciones coinciden con las migraciones locales.'
  }
  $comprobanteResult | ConvertTo-Json -Depth 20
} finally { $comprobanteToken = $null }

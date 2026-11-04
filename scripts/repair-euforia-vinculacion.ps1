param(
  [ValidateSet('Diagnostico','Preflight','Estructura','Reparacion','Verificar','DiagnosticarStock386','RepararStock386')][string]$Paso = 'Diagnostico',
  [string]$CheckoutHash,
  [string]$RegistroHash,
  [string]$PedidoId
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class EuforiaSupabaseCredential {
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

$euforiaToken = $env:SUPABASE_ACCESS_TOKEN
if (!$euforiaToken) { $euforiaToken = [EuforiaSupabaseCredential]::Read('Supabase CLI:supabase') }
if (!$euforiaToken) { $euforiaToken = [EuforiaSupabaseCredential]::Read('Supabase CLI:access-token') }
if (!$euforiaToken) { throw 'No se encontro la credencial de Supabase CLI.' }
$euforiaProject = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if ($euforiaProject -ne 'zhtqkygjvaaizbdwwsbi') { throw 'Proyecto inesperado.' }
try {
  $euforiaQuery = switch ($Paso) {
    'RepararStock386' { [IO.File]::ReadAllText((Join-Path (Get-Location) 'docs/sql/reparar-stock-euforia-386.sql')) }
    'DiagnosticarStock386' {
      @'
SELECT p.id,p.comercio_id,p.cod_producto,p.descripcion,p.stock AS stock_general,
 (SELECT sum(v.stock) FROM public.producto_variantes v WHERE v.producto_id=p.id) AS suma_variantes,
 (SELECT jsonb_agg(jsonb_build_object('id',v.id,'stock',v.stock,'talle',t.nombre,'color',c.nombre) ORDER BY v.id)
   FROM public.producto_variantes v LEFT JOIN public.producto_talles t ON t.id=v.talle_id LEFT JOIN public.producto_colores c ON c.id=v.color_id WHERE v.producto_id=p.id) AS variantes
FROM public.productos p WHERE p.comercio_id='0987ef9c-c602-40cf-84c3-64d2f644428d' AND p.cod_producto='386'
LIMIT 5;
'@
    }
    'Diagnostico' { [IO.File]::ReadAllText((Join-Path (Get-Location) 'scripts/diagnosticar-vinculacion-euforia.sql')) }
    'Preflight' {
      @'
SELECT jsonb_build_object(
  'funciones',(SELECT jsonb_agg(jsonb_build_object('firma',oid::regprocedure::text,'hash',md5(prosrc),'definicion',pg_get_functiondef(oid))) FROM pg_proc WHERE oid IN ('public.crear_pedido_online(jsonb,jsonb)'::regprocedure,'public.registrar_cliente_tienda_desde_auth()'::regprocedure)),
  'modulos',(SELECT jsonb_agg(jsonb_build_object('comercio_id',comercio_id,'online',parametros->'modulos'->'pedidos_online')) FROM public.comercio_parametrizacion WHERE comercio_id IN ('0987ef9c-c602-40cf-84c3-64d2f644428d','30e79cd0-360d-4a03-b634-bb7414ee505b')),
  'triggers_auth',(SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal),
  'migracion_aplicada',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103120000')
) AS preflight;
'@
    }
    'Estructura' {
      if ($CheckoutHash -notmatch '^[a-f0-9]{32}$' -or $RegistroHash -notmatch '^[a-f0-9]{32}$') { throw 'Se requieren las huellas del preflight revisado.' }
      $euforiaMigration = [IO.File]::ReadAllText((Join-Path (Get-Location) 'supabase/migrations/20261103120000_vinculacion_clientes_tienda_multicomercio.sql'))
      $euforiaGuard = @'
DO $guard$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.crear_pedido_online(jsonb,jsonb)'::regprocedure)<>'CHECKOUT_HASH'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.registrar_cliente_tienda_desde_auth()'::regprocedure)<>'REGISTRO_HASH' THEN
    RAISE EXCEPTION 'Las funciones cambiaron desde el diagnostico';
  END IF;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261103120000') THEN
    RAISE EXCEPTION 'La migracion ya figura aplicada';
  END IF;
END $guard$;
'@
      $euforiaGuard = $euforiaGuard.Replace('CHECKOUT_HASH',$CheckoutHash).Replace('REGISTRO_HASH',$RegistroHash)
      $euforiaStatement = $euforiaMigration.Replace("'", "''")
      "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';`n$euforiaGuard`n$euforiaMigration`nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261103120000','vinculacion_clientes_tienda_multicomercio',ARRAY['$euforiaStatement']); COMMIT;"
    }
    'Reparacion' {
      $euforiaPedido = [guid]::Parse($PedidoId).ToString()
      $euforiaRepair = [IO.File]::ReadAllText((Join-Path (Get-Location) 'scripts/reparar-vinculacion-euforia.sql'))
      $euforiaRepair = [regex]::Replace($euforiaRepair,'(?m)^\\set[^\r\n]*\r?\n','')
      $euforiaRepair.Replace(":'pedido_id'", "'$euforiaPedido'").Replace('BEGIN;',"BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';")
    }
    'Verificar' {
      [IO.File]::ReadAllText((Join-Path (Get-Location) 'scripts/diagnosticar-vinculacion-euforia.sql')) + @'

SELECT version,name FROM supabase_migrations.schema_migrations WHERE version='20261103120000';
'@
    }
  }
  $euforiaBody = @{ query = $euforiaQuery } | ConvertTo-Json -Compress
  $euforiaResult = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$euforiaProject/database/query" -Headers @{ Authorization = "Bearer $euforiaToken" } -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($euforiaBody)) -TimeoutSec 60
  if ($Paso -eq 'Preflight') {
    $euforiaBackupDir = Join-Path (Get-Location) 'private-backups'
    [IO.Directory]::CreateDirectory($euforiaBackupDir) | Out-Null
    $euforiaBackupFile = Join-Path $euforiaBackupDir ('euforia-vinculacion-preflight-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.json')
    [IO.File]::WriteAllText($euforiaBackupFile,($euforiaResult | ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Write-Output "Backup de funciones: $euforiaBackupFile"
  }
  $euforiaResult | ConvertTo-Json -Depth 20
} finally { $euforiaToken = $null }

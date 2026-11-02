param(
  [ValidateSet('Diagnostico','Estructura','EstructuraSinDocumento','Reparacion','Verificar')]
  [string]$Paso = 'Diagnostico'
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BerraSupabaseCredential {
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
$berraToken = $env:SUPABASE_ACCESS_TOKEN
if (!$berraToken) { $berraToken = [BerraSupabaseCredential]::Read('Supabase CLI:supabase') }
if (!$berraToken) { $berraToken = [BerraSupabaseCredential]::Read('Supabase CLI:access-token') }
if (!$berraToken) { throw 'No se encontro la credencial de Supabase CLI.' }
$berraProject = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if ($berraProject -ne 'zhtqkygjvaaizbdwwsbi') { throw 'Proyecto inesperado.' }
$berraSqlFile = switch ($Paso) {
  'Diagnostico' { 'docs/sql/diagnosticar-licencia-berra.sql' }
  'Estructura' { 'supabase/migrations/20261031100000_licencias_cliente_cuit_generico.sql' }
  'EstructuraSinDocumento' { 'supabase/migrations/20261102120000_licencias_cliente_sin_documento.sql' }
  'Reparacion' { 'docs/sql/reparar-licencia-berra.sql' }
  'Verificar' { 'docs/sql/verificar-licencia-berra.sql' }
}
try {
  $berraQuery = [System.IO.File]::ReadAllText((Join-Path (Get-Location) $berraSqlFile))
  if ($Paso -in @('Estructura','EstructuraSinDocumento')) {
    $berraVersion = if ($Paso -eq 'Estructura') { '20261031100000' } else { '20261102120000' }
    $berraMigrationName = if ($Paso -eq 'Estructura') { 'licencias_cliente_cuit_generico' } else { 'licencias_cliente_sin_documento' }
    # Registrar solamente esta migracion, en la misma transaccion que la funcion.
    # La huella corresponde a la funcion confirmada antes de esta reparacion.
    $berraGuard = @'
DO $guard$ BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.generar_comprobante_licencia(uuid,uuid,date,public.tipo_comprobante,numeric,date,uuid)'::regprocedure)<>'3b8473cd029ad774a8fce2cfdf59c88a' THEN
    RAISE EXCEPTION 'La funcion de licencias cambio desde el diagnostico';
  END IF;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261031100000') THEN
    RAISE EXCEPTION 'La migracion ya figura aplicada';
  END IF;
END; $guard$;
'@
    if ($Paso -eq 'EstructuraSinDocumento') {
      $berraGuard = $berraGuard.Replace('3b8473cd029ad774a8fce2cfdf59c88a','a54e316a9f5d2db611a6589a86462af8').Replace('20261031100000',$berraVersion)
    }
    $berraStatement = $berraQuery.Replace("'", "''")
    $berraHistory = "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ('$berraVersion','$berraMigrationName',ARRAY['$berraStatement']);`nCOMMIT;"
    $berraQuery = $berraQuery.Replace('BEGIN;', "BEGIN;`n$berraGuard")
    $berraQuery = [regex]::Replace($berraQuery, 'COMMIT;\s*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $berraHistory })
  }
  $berraBody = @{ query = $berraQuery } | ConvertTo-Json -Compress
  $berraResult = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$berraProject/database/query" `
    -Headers @{ Authorization = "Bearer $berraToken" } -Method Post -ContentType 'application/json; charset=utf-8' `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($berraBody)) -TimeoutSec 60
  $berraResult | ConvertTo-Json -Depth 12
} finally { $berraToken = $null }

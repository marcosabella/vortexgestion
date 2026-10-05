# Consulta de solo lectura. Reutiliza exclusivamente la credencial de Supabase
# CLI y nunca imprime ni guarda el token de acceso.
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SupabaseCaeCredential {
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
$caeAccessToken = $env:SUPABASE_ACCESS_TOKEN
if (!$caeAccessToken) { $caeAccessToken = [SupabaseCaeCredential]::Read('Supabase CLI:supabase') }
if (!$caeAccessToken) { $caeAccessToken = [SupabaseCaeCredential]::Read('Supabase CLI:access-token') }
if (!$caeAccessToken -or $caeAccessToken -notmatch '^sbp_(oauth_)?[a-f0-9]{40}$') {
  throw 'No se encontro la credencial de Supabase CLI para consultar los logs.'
}
$caeProjectRef = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
$caeQuery = "SELECT timestamp, event_message FROM logs WHERE source = 'function_logs' AND (event_message LIKE '%CAE obtenido exitosamente%' OR event_message LIKE '%Numero de comprobante a solicitar%' OR event_message LIKE '%Solicitando CAE para venta%' OR event_message LIKE '%Error al actualizar venta%' OR event_message LIKE '%Detalles extraídos%' OR event_message LIKE '%PtoVta:%') ORDER BY timestamp ASC LIMIT 100"
$caeEndpoint = 'logs'
$caeEnd = [Uri]::EscapeDataString([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))
$caeUri = "https://api.supabase.com/v1/projects/$caeProjectRef/analytics/endpoints/$($caeEndpoint)?iso_timestamp_start=2026-10-05T10%3A00%3A00Z&iso_timestamp_end=$caeEnd&sql=$([Uri]::EscapeDataString($caeQuery))"
try {
  $caeResult = Invoke-RestMethod -Uri $caeUri -Headers @{ Authorization = "Bearer $caeAccessToken" } -Method Get
  if ($caeResult.error) { throw 'La API de logs devolvio un error.' }
  $caeResult | ConvertTo-Json -Depth 12
} catch {
  throw 'No se pudieron consultar los logs de CAE por la API de Supabase.'
} finally { $caeAccessToken = $null }

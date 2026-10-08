param([switch]$Apply, [switch]$Remove, [string]$AppUrl)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RestauranteDeployCredential {
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
$restauranteToken = $env:SUPABASE_ACCESS_TOKEN
if (!$restauranteToken) { $restauranteToken = [RestauranteDeployCredential]::Read('Supabase CLI:supabase') }
if (!$restauranteToken) { $restauranteToken = [RestauranteDeployCredential]::Read('Supabase CLI:access-token') }
if (!$restauranteToken) { throw 'No se encontro la credencial de Supabase CLI.' }
$restauranteProject = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if ($restauranteProject -ne 'zhtqkygjvaaizbdwwsbi') { throw 'Proyecto inesperado.' }
$restauranteEndpoint = "https://api.supabase.com/v1/projects/$restauranteProject/config/auth"
try {
  $restauranteConfig = Invoke-RestMethod -Uri $restauranteEndpoint -Headers @{ Authorization = "Bearer $restauranteToken" } -Method Get
  if ($Apply -or $Remove) {
    $restauranteOrigin = [Uri]$AppUrl
    if ($restauranteOrigin.Scheme -ne 'https' -or !$restauranteOrigin.Host) { throw 'APP_URL debe ser HTTPS.' }
    $restauranteRedirect = $restauranteOrigin.GetLeftPart([UriPartial]::Authority) + '/acceso/clave'
    $restauranteRedirects = @($restauranteConfig.uri_allow_list -split ',' | Where-Object { $_ })
    if (($Remove -and ($restauranteRedirects -contains $restauranteRedirect)) -or (!$Remove -and ($restauranteRedirects -notcontains $restauranteRedirect))) {
      $restauranteNewRedirects = if ($Remove) { @($restauranteRedirects | Where-Object { $_ -ne $restauranteRedirect }) } else { @($restauranteRedirects) + $restauranteRedirect }
      $restauranteBody = @{ uri_allow_list = $restauranteNewRedirects -join ',' } | ConvertTo-Json
      $null = Invoke-RestMethod -Uri $restauranteEndpoint -Headers @{ Authorization = "Bearer $restauranteToken" } -Method Patch -ContentType 'application/json' -Body $restauranteBody
      $restauranteConfig = Invoke-RestMethod -Uri $restauranteEndpoint -Headers @{ Authorization = "Bearer $restauranteToken" } -Method Get
    }
    if (!$Remove -and (($restauranteConfig.uri_allow_list -split ',') -notcontains $restauranteRedirect)) { throw 'No se confirmo el destino de acceso.' }
    if ($Remove -and (($restauranteConfig.uri_allow_list -split ',') -contains $restauranteRedirect)) { throw 'No se retiro el destino.' }
  }
  [ordered]@{
    project = $restauranteProject
    site_url = $restauranteConfig.site_url
    uri_allow_list = $restauranteConfig.uri_allow_list
    email_enabled = $restauranteConfig.external_email_enabled
    custom_smtp = [bool]$restauranteConfig.smtp_host
    smtp_host = $restauranteConfig.smtp_host
    invitation_template_custom = [bool]$restauranteConfig.mailer_templates_invite_content
    recovery_template_custom = [bool]$restauranteConfig.mailer_templates_recovery_content
    invitation_uses_confirmation_url = !$restauranteConfig.mailer_templates_invite_content -or $restauranteConfig.mailer_templates_invite_content -match 'ConfirmationURL'
    recovery_uses_confirmation_url = !$restauranteConfig.mailer_templates_recovery_content -or $restauranteConfig.mailer_templates_recovery_content -match 'ConfirmationURL'
    applied = [bool]$Apply
  } | ConvertTo-Json
} catch {
  throw "No se pudo revisar o actualizar la configuracion de acceso en la linea $($_.InvocationInfo.ScriptLineNumber) ($($_.Exception.GetType().Name)); sin exponer credenciales."
} finally { $restauranteToken = $null }

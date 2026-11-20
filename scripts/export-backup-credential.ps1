$ErrorActionPreference = 'Stop'
# La credencial se mantiene en la carpeta privada con ACL restringida, nunca en stdout.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BackupCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Entry { public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public UInt32 Size; public IntPtr Blob; public UInt32 Persist; public UInt32 Count; public IntPtr Attributes; public string Alias; public string UserName; }
 [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr value);
 [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr value);
 public static string Read(string target) {
  IntPtr p; if(!CredRead(target,1,0,out p)) return null;
  try { var e=(Entry)Marshal.PtrToStructure(p,typeof(Entry)); var b=new byte[e.Size]; Marshal.Copy(e.Blob,b,0,b.Length); var s=System.Text.Encoding.UTF8.GetString(b).TrimEnd('\0'); return s.StartsWith("sbp_")?s:System.Text.Encoding.Unicode.GetString(b).TrimEnd('\0'); } finally { CredFree(p); }
 }
}
'@
$backupToken = $env:SUPABASE_ACCESS_TOKEN
if (!$backupToken) { $backupToken = [BackupCredential]::Read('Supabase CLI:supabase') }
if (!$backupToken) { $backupToken = [BackupCredential]::Read('Supabase CLI:access-token') }
if (!$backupToken) { throw 'No hay sesión de administración de Supabase' }
$backupFile = Join-Path (Get-Location) 'private-backups/admin-generator/management.json'
[IO.File]::WriteAllText($backupFile, (@{ token=$backupToken } | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
Write-Output 'Credencial de administración preparada en carpeta privada; no se cambió la contraseña PostgreSQL.'

param([ValidateSet('Preflight','Aplicar','Verificar')][string]$Paso='Preflight',[string]$RpcHash)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CobrosSupabaseCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Credential {
  public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist;
  public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
 }
 [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern bool CredRead(string target,UInt32 type,UInt32 flags,out IntPtr credential);
 [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr credential);
 public static string Read(string target) {
  IntPtr ptr; if(!CredRead(target,1,0,out ptr))return null;
  try {
   var value=(Credential)Marshal.PtrToStructure(ptr,typeof(Credential));
   var bytes=new byte[value.CredentialBlobSize]; Marshal.Copy(value.CredentialBlob,bytes,0,bytes.Length);
   var utf8=System.Text.Encoding.UTF8.GetString(bytes).TrimEnd('\0');
   return utf8.StartsWith("sbp_")?utf8:System.Text.Encoding.Unicode.GetString(bytes).TrimEnd('\0');
  } finally {CredFree(ptr);}
 }
}
'@
$cobrosToken=$env:SUPABASE_ACCESS_TOKEN
if(!$cobrosToken){$cobrosToken=[CobrosSupabaseCredential]::Read('Supabase CLI:supabase')}
if(!$cobrosToken){$cobrosToken=[CobrosSupabaseCredential]::Read('Supabase CLI:access-token')}
if(!$cobrosToken){throw 'No se encontro credencial de Supabase CLI'}
$cobrosProject=(Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if($cobrosProject -ne 'zhtqkygjvaaizbdwwsbi'){throw 'Proyecto inesperado'}
$cobrosQuery=switch($Paso){
 'Preflight' {@'
SELECT jsonb_build_object(
 'migrations',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version>='20261110000000'),
 'rpc_hash',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)'::regprocedure),
 'rpc_definition',pg_get_functiondef('public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)'::regprocedure),
 'recibo_existe',to_regprocedure('public.registrar_cobro_cliente_con_recibo(uuid,uuid[],date,text,jsonb,uuid)') IS NOT NULL
) AS estado;
'@}
 'Aplicar' {
  if($RpcHash -notmatch '^[a-f0-9]{32}$'){throw 'Falta hash de la funcion revisada'}
  $cobrosNombre='20261114110000_cobros_excedente_todos_medios_cliente'
  $cobrosMigration=[IO.File]::ReadAllText((Join-Path (Get-Location) ('supabase/migrations/'+$cobrosNombre+'.sql')))
  $cobrosInner=$cobrosMigration -replace '(?m)^BEGIN;\s*$','' -replace '(?m)^COMMIT;\s*$',''
  $cobrosStatement=$cobrosMigration.Replace("'","''")
  $cobrosGuard=@"
DO `$guard`$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)'::regprocedure) IS DISTINCT FROM '$RpcHash' THEN RAISE EXCEPTION 'La funcion cambio desde el preflight'; END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261114110000') THEN RAISE EXCEPTION 'Migracion ya aplicada'; END IF;
END `$guard`$;
"@
  "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s';`n$cobrosGuard`n$cobrosInner`nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261114110000','cobros_excedente_todos_medios_cliente',ARRAY['$cobrosStatement']); NOTIFY pgrst,'reload schema'; COMMIT;"
 }
 'Verificar' {@'
SELECT jsonb_build_object(
 'migration',(SELECT jsonb_build_object('version',version,'name',name) FROM supabase_migrations.schema_migrations WHERE version='20261114110000'),
 'rpc_hash',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)'::regprocedure),
 'excedente_todos_medios',(SELECT position('v_total_cheques' IN prosrc)=0 AND position('Excedente de pago a cuenta del cliente' IN prosrc)>0 FROM pg_proc WHERE oid='public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)'::regprocedure),
 'permisos',jsonb_build_object('authenticated',has_function_privilege('authenticated','public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)','EXECUTE'),'anon',has_function_privilege('anon','public.registrar_pagos_cliente_multi_documento(uuid,uuid[],date,text,jsonb)','EXECUTE'))
) AS estado;
'@}
}
$cobrosBody=@{query=$cobrosQuery}|ConvertTo-Json -Compress
$cobrosResult=Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$cobrosProject/database/query" -Headers @{Authorization="Bearer $cobrosToken"} -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($cobrosBody)) -TimeoutSec 60
if($Paso -eq 'Preflight') {
 $cobrosBackup=Join-Path (Get-Location) 'private-backups'
 [IO.Directory]::CreateDirectory($cobrosBackup)|Out-Null
 [IO.File]::WriteAllText((Join-Path $cobrosBackup ('cobros-excedente-preflight-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.json')),($cobrosResult|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
 @($cobrosResult)[0].estado.PSObject.Properties.Remove('rpc_definition')
}
$cobrosResult|ConvertTo-Json -Depth 16

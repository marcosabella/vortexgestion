param([ValidateSet('Preflight','Errores','Aplicar','AplicarDocumentacion','AplicarPagos','Verificar')][string]$Paso='Preflight',[string]$RpcHash)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TransporteSupabaseCredential {
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
$transporteToken=$env:SUPABASE_ACCESS_TOKEN
if(!$transporteToken){$transporteToken=[TransporteSupabaseCredential]::Read('Supabase CLI:supabase')}
if(!$transporteToken){$transporteToken=[TransporteSupabaseCredential]::Read('Supabase CLI:access-token')}
if(!$transporteToken){throw 'No se encontro credencial de Supabase CLI'}
$transporteProject=(Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim()
if($transporteProject -ne 'zhtqkygjvaaizbdwwsbi'){throw 'Proyecto inesperado'}
$transporteHeaders=@{Authorization="Bearer $transporteToken"}
if($Paso -eq 'Errores') {
 $transporteSql="select timestamp,event_message from logs where event_message LIKE '%transporte%' and event_message LIKE '%violates%' order by timestamp desc limit 30"
 $transporteUri="https://api.supabase.com/v1/projects/$transporteProject/analytics/endpoints/logs?sql="+[Uri]::EscapeDataString($transporteSql)
 $transporteUri += '&iso_timestamp_start=' + [Uri]::EscapeDataString([DateTime]::UtcNow.AddHours(-24).ToString('o')) + '&iso_timestamp_end=' + [Uri]::EscapeDataString([DateTime]::UtcNow.ToString('o'))
 Invoke-RestMethod -Uri $transporteUri -Headers $transporteHeaders -TimeoutSec 45 | ConvertTo-Json -Depth 12
 exit
}
$transporteQuery=switch($Paso){
 'Preflight' {@'
SELECT jsonb_build_object(
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid IN ('public.transporte_servicios'::regclass,'public.transporte_eventos'::regclass)),
 'migrations',(SELECT jsonb_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version>='20261110000000'),
 'rpc_hash',(SELECT md5(prosrc) FROM pg_proc WHERE oid='public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure),
 'rpc_definition',pg_get_functiondef('public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure),
 'servicios',(SELECT jsonb_agg(t) FROM (SELECT numero,estado,presentacion,total>0 AS importe_valido FROM public.transporte_servicios ORDER BY created_at DESC LIMIT 20) t),
 'service_count',(SELECT count(*) FROM public.transporte_servicios)
) AS estado;
'@}
 { $_ -in @('Aplicar','AplicarDocumentacion','AplicarPagos') } {
  if($RpcHash -notmatch '^[a-f0-9]{32}$'){throw 'Falta hash de la funcion revisada'}
  $transportePartes=@()
  $transporteNombres=if($Paso -eq 'AplicarPagos'){@('20261111103000_transporte_liquidacion_recargos_pago')}elseif($Paso -eq 'AplicarDocumentacion'){@('20261111102000_transporte_documentacion_opcional')}else{@('20261111100000_transporte_eliminar_registros','20261111101000_transporte_validar_equipo_servicio')}
  $transporteVersionesSql=($transporteNombres|ForEach-Object {"'"+$_.Substring(0,14)+"'"}) -join ','
  foreach($transporteNombre in $transporteNombres) {
   $transporteVersion=$transporteNombre.Substring(0,14)
   $transporteFile=Join-Path (Get-Location) ('supabase/migrations/'+$transporteNombre+'.sql')
   $transporteMigration=[IO.File]::ReadAllText($transporteFile)
   $transporteInner=$transporteMigration -replace '(?m)^BEGIN;\s*$','' -replace '(?m)^COMMIT;\s*$',''
   $transporteStatement=$transporteMigration.Replace("'","''")
   $transportePartes+= $transporteInner + "`nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('$transporteVersion','$($transporteNombre.Substring(15))',ARRAY['$transporteStatement']);"
  }
  $transporteGuard=@"
DO `$guard`$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure)<>'$RpcHash' THEN RAISE EXCEPTION 'La funcion cambio desde el preflight'; END IF;
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ($transporteVersionesSql)) THEN RAISE EXCEPTION 'Migracion ya aplicada'; END IF;
END `$guard`$;
"@
  "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s';`n$transporteGuard`n$($transportePartes -join "`n")`nNOTIFY pgrst,'reload schema'; COMMIT;"
 }
 'Verificar' {@'
SELECT jsonb_build_object(
 'migrations',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name) ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN ('20261111100000','20261111101000','20261111102000','20261111103000')),
 'eliminar_interno',to_regprocedure('public.transporte_eliminar_registro(uuid,text,uuid,integer)') IS NOT NULL,
 'rpc_eliminar',(SELECT position('public.transporte_eliminar_registro' IN prosrc)>0 FROM pg_proc WHERE oid='public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure),
 'valida_equipo',(SELECT position('uid=equipo' IN prosrc)>0 FROM pg_proc WHERE oid='public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure),
 'documentacion_opcional',(SELECT position('presentacion NOT IN (''listo'',''pendiente_documentacion'')' IN prosrc)>0 FROM pg_proc WHERE oid='public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure),
 'recargos_pago',(SELECT position('tr_pago.value' IN prosrc)>0 FROM pg_proc WHERE oid='public.transporte_operar(uuid,text,uuid,integer,jsonb)'::regprocedure),
 'helper_privado',NOT has_function_privilege('authenticated','public.transporte_eliminar_registro(uuid,text,uuid,integer)','EXECUTE'),
 'constraints_activas',(SELECT count(*) FROM pg_constraint WHERE conrelid='public.transporte_servicios'::regclass AND conname='transporte_servicios_check1' AND convalidated),
 'servicios',(SELECT jsonb_agg(t) FROM (SELECT numero,estado,presentacion,total>0 AS importe_valido FROM public.transporte_servicios ORDER BY created_at DESC LIMIT 20) t),
 'service_count',(SELECT count(*) FROM public.transporte_servicios)
) AS estado;
'@}
}
$transporteBody=@{query=$transporteQuery}|ConvertTo-Json -Compress
$transporteResult=Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$transporteProject/database/query" -Headers $transporteHeaders -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($transporteBody)) -TimeoutSec 60
if($Paso -eq 'Preflight') {
 $transporteBackup=Join-Path (Get-Location) 'private-backups'
 [IO.Directory]::CreateDirectory($transporteBackup)|Out-Null
 [IO.File]::WriteAllText((Join-Path $transporteBackup ('transporte-preflight-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')+'.json')),($transporteResult|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
 @($transporteResult)[0].estado.PSObject.Properties.Remove('rpc_definition')
 @($transporteResult)[0].estado.PSObject.Properties.Remove('constraints')
}
$transporteResult|ConvertTo-Json -Depth 16

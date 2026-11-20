#!/bin/sh
set -eu
dnf install -y postgresql17 tar gzip ca-certificates
mkdir -p /out/bin /out/lib
for executable in /usr/bin/pg_dump /usr/bin/pg_restore /usr/bin/psql /usr/bin/tar; do
  cp -L "$executable" /out/bin/
  ldd "$executable" | awk '/=> \// {print $3} /^\s*\// {print $1}' | while read -r lib; do cp -L "$lib" /out/lib/; done
done
cp -L /lib64/ld-linux-x86-64.so.2 /out/lib/
cp /etc/pki/tls/certs/ca-bundle.crt /out/ca-bundle.crt
curl -fsSL https://supabase-downloads.s3.amazonaws.com/prod/ssl/prod-ca-2021.crt >> /out/ca-bundle.crt
rpm -q postgresql17 tar glibc > /out/versions.txt
tar -czf /workspace/netlify/functions/runtime/pg-runtime.tgz -C /out .
echo 'Runtime PostgreSQL Linux creado.'

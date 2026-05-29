import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ComercioPayload = {
  nombre_comercio: string;
  calle: string;
  numero: string;
  codigo_postal: string;
  localidad: string;
  provincia: string;
  telefono?: string;
  cuit: string;
  ingresos_brutos?: string;
  fecha_inicio_actividad: string;
  logo_url?: string;
};

const defaultParametrizacion = {
  modulos: {
    caja: true,
    clientes: true,
    proveedores: true,
    productos: true,
    ventas: true,
    cuenta_corriente: true,
    cheques: true,
    bancos: true,
    tarjetas: true,
    afip: true,
    seguridad: true,
    listados: true,
  },
  funciones: {
    venta_items_manuales: true,
    descuentos_recargos: true,
    facturacion_afip: true,
    impresion_comprobantes: true,
    exportacion_pdf: true,
  },
};

async function getAdminUserId(req: Request, supabase: any): Promise<string> {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    throw new Error('Usuario no autenticado');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Error('Sesion invalida');
  }

  const { data: adminData, error: adminError } = await supabase
    .from('app_admins')
    .select('id')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (adminError || !adminData) {
    throw new Error('No tiene permisos de administrador');
  }

  return userData.user.id;
}

async function listComercios(supabase: any) {
  const { data: comercios, error } = await supabase
    .from('comercio')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const { data: memberships, error: membershipError } = await supabase
    .from('comercio_usuarios')
    .select('comercio_id,user_id,rol,activo')
    .order('created_at', { ascending: true });

  if (membershipError) throw membershipError;

  const usersById = new Map<string, any>();
  for (const membership of memberships || []) {
    if (usersById.has(membership.user_id)) continue;
    const { data } = await supabase.auth.admin.getUserById(membership.user_id);
    if (data?.user) {
      usersById.set(membership.user_id, data.user);
    }
  }

  return (comercios || []).map((comercio: any) => {
    const comercioMemberships = (memberships || []).filter((membership: any) => membership.comercio_id === comercio.id);
    const mainMembership = comercioMemberships[0] || null;
    const authUser = mainMembership ? usersById.get(mainMembership.user_id) : null;

    return {
      ...comercio,
      usuario: mainMembership
        ? {
            user_id: mainMembership.user_id,
            email: authUser?.email || '',
            rol: mainMembership.rol,
            activo: mainMembership.activo,
            banned_until: authUser?.banned_until || null,
            last_sign_in_at: authUser?.last_sign_in_at || null,
          }
        : null,
    };
  });
}

async function createComercio(supabase: any, comercio: ComercioPayload, userEmail: string, password: string) {
  const normalizedEmail = userEmail?.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error('Email y contrasena son requeridos');
  }

  let authUser = await findUserByEmail(supabase, normalizedEmail);
  let createdUserId: string | null = null;

  if (authUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      email: normalizedEmail,
      password,
      email_confirm: true,
      ban_duration: 'none',
      user_metadata: {
        ...authUser.user_metadata,
        must_change_password: true,
      },
    });

    if (error || !data?.user) {
      throw new Error(error?.message || 'No se pudo actualizar el usuario');
    }

    authUser = data.user;
  } else {
    const { data: createdUser, error: userError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        must_change_password: true,
      },
    });

    if (userError || !createdUser.user) {
      throw new Error(userError?.message || 'No se pudo crear el usuario');
    }

    authUser = createdUser.user;
    createdUserId = createdUser.user.id;
  }

  try {
    const { data: createdComercio, error: comercioError } = await supabase
      .from('comercio')
      .insert({ ...comercio, activo: true })
      .select()
      .single();

    if (comercioError || !createdComercio) {
      throw new Error(comercioError?.message || 'No se pudo crear el comercio');
    }

    const { error: membershipError } = await supabase
      .from('comercio_usuarios')
      .insert({
        comercio_id: createdComercio.id,
        user_id: authUser.id,
        rol: 'admin',
        activo: true,
      });

    if (membershipError) {
      throw membershipError;
    }

    const { error: parametrizacionError } = await supabase
      .from('comercio_parametrizacion')
      .upsert(
        { comercio_id: createdComercio.id, parametros: defaultParametrizacion },
        { onConflict: 'comercio_id' },
      );

    if (parametrizacionError) {
      throw parametrizacionError;
    }

    return { comercio: createdComercio, user_id: authUser.id, email: normalizedEmail };
  } catch (error) {
    if (createdUserId) {
      await supabase.auth.admin.deleteUser(createdUserId);
    }
    throw error;
  }
}

async function updateComercio(supabase: any, comercioId: string, comercio: ComercioPayload) {
  if (!comercioId) {
    throw new Error('Comercio requerido');
  }

  const { data, error } = await supabase
    .from('comercio')
    .update(comercio)
    .eq('id', comercioId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo actualizar el comercio');
  }

  return { comercio: data };
}

async function findUserByEmail(supabase: any, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = (data?.users || []).find((item: any) => item.email?.toLowerCase() === normalizedEmail);
    if (user) return user;

    if (!data?.users || data.users.length < perPage) return null;
    page += 1;
  }
}

async function createOrUpdateAccess(supabase: any, comercioId: string, userEmail: string, password: string) {
  const normalizedEmail = userEmail?.trim().toLowerCase();
  let createdUserId: string | null = null;

  if (!comercioId || !normalizedEmail || !password) {
    throw new Error('Comercio, email y contrasena son requeridos');
  }

  const { data: comercio, error: comercioError } = await supabase
    .from('comercio')
    .select('id')
    .eq('id', comercioId)
    .maybeSingle();

  if (comercioError) throw comercioError;
  if (!comercio) throw new Error('Comercio no encontrado');

  let authUser = await findUserByEmail(supabase, normalizedEmail);

  if (authUser) {
    const { data: existingMemberships, error: existingMembershipsError } = await supabase
      .from('comercio_usuarios')
      .select('comercio_id')
      .eq('user_id', authUser.id)
      .neq('comercio_id', comercioId);

    if (existingMembershipsError) throw existingMembershipsError;
    if (existingMemberships?.length) {
      throw new Error('El email indicado ya esta vinculado a otro comercio');
    }

    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      email: normalizedEmail,
      password,
      email_confirm: true,
      ban_duration: 'none',
      user_metadata: {
        ...authUser.user_metadata,
        must_change_password: true,
      },
    });

    if (error || !data?.user) {
      throw new Error(error?.message || 'No se pudo actualizar el usuario');
    }

    authUser = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        must_change_password: true,
      },
    });

    if (error || !data?.user) {
      throw new Error(error?.message || 'No se pudo crear el usuario');
    }

    authUser = data.user;
    createdUserId = authUser.id;
  }

  try {
    const { error: membershipError } = await supabase
      .from('comercio_usuarios')
      .upsert(
        {
          comercio_id: comercioId,
          user_id: authUser.id,
          rol: 'admin',
          activo: true,
        },
        { onConflict: 'comercio_id,user_id' },
      );

    if (membershipError) throw membershipError;

    const { error: comercioUpdateError } = await supabase
      .from('comercio')
      .update({ activo: true })
      .eq('id', comercioId);

    if (comercioUpdateError) throw comercioUpdateError;
  } catch (error) {
    if (createdUserId) {
      await supabase.auth.admin.deleteUser(createdUserId);
    }
    throw error;
  }

  return { user_id: authUser.id, email: normalizedEmail };
}

async function setAccess(supabase: any, comercioId: string, enabled: boolean) {
  const { data: memberships, error: membershipError } = await supabase
    .from('comercio_usuarios')
    .select('user_id')
    .eq('comercio_id', comercioId);

  if (membershipError) throw membershipError;

  if (!memberships?.length) {
    throw new Error('El comercio no tiene usuario de ingreso vinculado');
  }

  const { error: comercioError } = await supabase
    .from('comercio')
    .update({ activo: enabled })
    .eq('id', comercioId);

  if (comercioError) throw comercioError;

  const { error: updateMembershipError } = await supabase
    .from('comercio_usuarios')
    .update({ activo: enabled })
    .eq('comercio_id', comercioId);

  if (updateMembershipError) throw updateMembershipError;

  for (const membership of memberships || []) {
    if (!enabled) {
      const { data: otherActiveMemberships, error: otherActiveMembershipsError } = await supabase
        .from('comercio_usuarios')
        .select('comercio_id, comercio!inner(activo)')
        .eq('user_id', membership.user_id)
        .eq('activo', true)
        .neq('comercio_id', comercioId)
        .eq('comercio.activo', true);

      if (otherActiveMembershipsError) throw otherActiveMembershipsError;
      if (otherActiveMemberships?.length) continue;
    }

    const { error } = await supabase.auth.admin.updateUserById(membership.user_id, {
      ban_duration: enabled ? 'none' : '876000h',
    });

    if (error) throw error;
  }
}

async function resetPassword(supabase: any, userId: string, password: string) {
  if (!password) {
    throw new Error('La nueva contrasena es requerida');
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    user_metadata: {
      must_change_password: true,
    },
  });

  if (error) throw error;
}

function mergeParametrizacion(parametros: any) {
  return {
    modulos: {
      ...defaultParametrizacion.modulos,
      ...(parametros?.modulos || {}),
    },
    funciones: {
      ...defaultParametrizacion.funciones,
      ...(parametros?.funciones || {}),
    },
  };
}

async function getParametrizacion(supabase: any, comercioId: string) {
  if (!comercioId) {
    throw new Error('Comercio requerido');
  }

  const { data, error } = await supabase
    .from('comercio_parametrizacion')
    .select('parametros')
    .eq('comercio_id', comercioId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: createError } = await supabase
      .from('comercio_parametrizacion')
      .insert({ comercio_id: comercioId, parametros: defaultParametrizacion })
      .select('parametros')
      .single();

    if (createError || !created) {
      throw new Error(createError?.message || 'No se pudo crear la parametrizacion');
    }

    return { parametros: mergeParametrizacion(created.parametros) };
  }

  return { parametros: mergeParametrizacion(data.parametros) };
}

async function updateParametrizacion(supabase: any, comercioId: string, parametros: any) {
  if (!comercioId) {
    throw new Error('Comercio requerido');
  }

  const normalized = mergeParametrizacion(parametros);

  const { data, error } = await supabase
    .from('comercio_parametrizacion')
    .upsert(
      { comercio_id: comercioId, parametros: normalized },
      { onConflict: 'comercio_id' },
    )
    .select('parametros')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'No se pudo guardar la parametrizacion');
  }

  return { parametros: mergeParametrizacion(data.parametros) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await getAdminUserId(req, supabase);

    const body = await req.json();
    const action = body.action as string;

    if (action === 'list') {
      const comercios = await listComercios(supabase);
      return new Response(JSON.stringify({ success: true, comercios }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create') {
      const result = await createComercio(supabase, body.comercio, body.userEmail, body.password);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update') {
      const result = await updateComercio(supabase, body.comercioId, body.comercio);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'setAccess') {
      await setAccess(supabase, body.comercioId, Boolean(body.enabled));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'createOrUpdateAccess') {
      const result = await createOrUpdateAccess(supabase, body.comercioId, body.userEmail, body.password);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'resetPassword') {
      await resetPassword(supabase, body.userId, body.password);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'getParametrizacion') {
      const result = await getParametrizacion(supabase, body.comercioId);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'updateParametrizacion') {
      const result = await updateParametrizacion(supabase, body.comercioId, body.parametros);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Accion no soportada');
  } catch (error: any) {
    console.error('admin-comercios error', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Building2, KeyRound, Pencil, Plus, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { useAdminComercios, useIsAppAdmin, AdminComercio } from "@/hooks/useAdminComercios";
import { ComercioFormData } from "@/types/comercio";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const emptyComercio: ComercioFormData = {
  nombre_comercio: "",
  calle: "",
  numero: "",
  codigo_postal: "",
  localidad: "",
  provincia: "",
  telefono: "",
  cuit: "",
  ingresos_brutos: "",
  fecha_inicio_actividad: "",
  logo_url: "",
};

const accessDateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatLastAccess(value: string | null | undefined) {
  return value ? accessDateFormatter.format(new Date(value)) : "Nunca ingreso";
}

function AdminComercioForm({
  initialData = emptyComercio,
  includeAccess = true,
  onSubmit,
  isLoading,
  submitLabel,
  loadingLabel,
}: {
  initialData?: ComercioFormData;
  includeAccess?: boolean;
  onSubmit: (payload: { comercio: ComercioFormData; userEmail: string; password: string }) => void;
  isLoading: boolean;
  submitLabel: string;
  loadingLabel: string;
}) {
  const [comercio, setComercio] = useState<ComercioFormData>(initialData);
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setComercio(initialData);
  }, [initialData]);

  const updateField = (field: keyof ComercioFormData, value: string) => {
    setComercio((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ comercio, userEmail, password });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nombre_comercio">Comercio</Label>
          <Input id="nombre_comercio" value={comercio.nombre_comercio} onChange={(event) => updateField("nombre_comercio", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cuit">CUIT</Label>
          <Input id="cuit" value={comercio.cuit} onChange={(event) => updateField("cuit", event.target.value)} required minLength={11} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="calle">Calle</Label>
          <Input id="calle" value={comercio.calle} onChange={(event) => updateField("calle", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="numero">Numero</Label>
          <Input id="numero" value={comercio.numero} onChange={(event) => updateField("numero", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="codigo_postal">Codigo postal</Label>
          <Input id="codigo_postal" value={comercio.codigo_postal} onChange={(event) => updateField("codigo_postal", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="localidad">Localidad</Label>
          <Input id="localidad" value={comercio.localidad} onChange={(event) => updateField("localidad", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="provincia">Provincia</Label>
          <Input id="provincia" value={comercio.provincia} onChange={(event) => updateField("provincia", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telefono">Telefono</Label>
          <Input id="telefono" value={comercio.telefono} onChange={(event) => updateField("telefono", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fecha_inicio_actividad">Inicio de actividad</Label>
          <Input id="fecha_inicio_actividad" type="date" value={comercio.fecha_inicio_actividad} onChange={(event) => updateField("fecha_inicio_actividad", event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ingresos_brutos">Ingresos brutos</Label>
          <Input id="ingresos_brutos" value={comercio.ingresos_brutos} onChange={(event) => updateField("ingresos_brutos", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="logo_url">URL del logo</Label>
          <Input id="logo_url" value={comercio.logo_url} onChange={(event) => updateField("logo_url", event.target.value)} />
        </div>
      </div>

      {includeAccess && (
        <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="userEmail">Email de ingreso</Label>
            <Input id="userEmail" type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contrasena inicial</Label>
            <Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
          </div>
        </div>
      )}

      <Button type="submit" variant="success" disabled={isLoading}>
        {includeAccess ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {isLoading ? loadingLabel : submitLabel}
      </Button>
    </form>
  );
}

function comercioToForm(comercio: AdminComercio): ComercioFormData {
  return {
    nombre_comercio: comercio.nombre_comercio || "",
    calle: comercio.calle || "",
    numero: comercio.numero || "",
    codigo_postal: comercio.codigo_postal || "",
    localidad: comercio.localidad || "",
    provincia: comercio.provincia || "",
    telefono: comercio.telefono || "",
    cuit: comercio.cuit || "",
    ingresos_brutos: comercio.ingresos_brutos || "",
    fecha_inicio_actividad: comercio.fecha_inicio_actividad || "",
    logo_url: comercio.logo_url || "",
  };
}

function EditComercioButton({
  comercio,
  updateComercio,
}: {
  comercio: AdminComercio;
  updateComercio: ReturnType<typeof useAdminComercios>["updateComercio"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar comercio</DialogTitle>
        </DialogHeader>
        <AdminComercioForm
          initialData={comercioToForm(comercio)}
          includeAccess={false}
          isLoading={updateComercio.isPending}
          submitLabel="Guardar cambios"
          loadingLabel="Guardando..."
          onSubmit={({ comercio: formData }) =>
            updateComercio.mutate(
              { comercioId: comercio.id, comercio: formData },
              {
                onSuccess: () => setOpen(false),
              },
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordButton({
  comercio,
  resetPassword,
}: {
  comercio: AdminComercio;
  resetPassword: ReturnType<typeof useAdminComercios>["resetPassword"];
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");

  if (!comercio.usuario) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetPassword.mutate(
      { userId: comercio.usuario!.user_id, password },
      {
        onSuccess: () => {
          setPassword("");
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resetear contrasena</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nueva contrasena</Label>
            <Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} />
          </div>
          <Button type="submit" variant="success" disabled={resetPassword.isPending}>
            {resetPassword.isPending ? "Guardando..." : "Actualizar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessUserButton({
  comercio,
  createOrUpdateAccess,
}: {
  comercio: AdminComercio;
  createOrUpdateAccess: ReturnType<typeof useAdminComercios>["createOrUpdateAccess"];
}) {
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createOrUpdateAccess.mutate(
      { comercioId: comercio.id, userEmail, password },
      {
        onSuccess: () => {
          setUserEmail("");
          setPassword("");
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar acceso</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={`access-email-${comercio.id}`}>Email de ingreso</Label>
            <Input
              id={`access-email-${comercio.id}`}
              type="email"
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`access-password-${comercio.id}`}>Contrasena</Label>
            <Input
              id={`access-password-${comercio.id}`}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" variant="success" disabled={createOrUpdateAccess.isPending}>
            {createOrUpdateAccess.isPending ? "Guardando..." : "Guardar acceso"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminComercios() {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin();
  const { comerciosQuery, createComercio, updateComercio, setAccess, createOrUpdateAccess, resetPassword } = useAdminComercios();
  const [showCreateForm, setShowCreateForm] = useState(false);

  if (isAdminLoading) {
    return <div className="p-8">Cargando...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const comercios = comerciosQuery.data || [];

  return (
    <div className="container mx-auto space-y-6 p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Administrador</h1>
          <p className="text-sm text-muted-foreground">Alta de comercios, usuarios de ingreso y control de acceso.</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} variant="new">
          <Plus className="h-4 w-4" />
          Nuevo comercio
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Alta de comercio</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminComercioForm
              isLoading={createComercio.isPending}
              submitLabel="Crear comercio"
              loadingLabel="Creando..."
              onSubmit={(payload) =>
                createComercio.mutate(payload, {
                  onSuccess: () => setShowCreateForm(false),
                })
              }
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" />
            Comercios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Comercio</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Ultimo acceso</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Ubicacion</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acceso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comerciosQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Cargando comercios...
                  </TableCell>
                </TableRow>
              ) : comercios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay comercios cargados.
                  </TableCell>
                </TableRow>
              ) : (
                comercios.map((comercio) => {
                  const enabled = Boolean(comercio.activo && comercio.usuario?.activo);

                  return (
                    <TableRow key={comercio.id}>
                      <TableCell className="font-medium">{comercio.nombre_comercio}</TableCell>
                      <TableCell>{comercio.usuario?.email || "-"}</TableCell>
                      <TableCell>{formatLastAccess(comercio.usuario?.last_sign_in_at)}</TableCell>
                      <TableCell>{comercio.cuit}</TableCell>
                      <TableCell>{comercio.localidad}, {comercio.provincia}</TableCell>
                      <TableCell>
                        <Badge variant={enabled ? "default" : "secondary"} className="gap-1">
                          {enabled ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                          {enabled ? "Habilitado" : "Deshabilitado"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {comercio.usuario ? (
                            <ResetPasswordButton comercio={comercio} resetPassword={resetPassword} />
                          ) : (
                            <AccessUserButton comercio={comercio} createOrUpdateAccess={createOrUpdateAccess} />
                          )}
                          <EditComercioButton comercio={comercio} updateComercio={updateComercio} />
                          <Switch
                            checked={enabled}
                            disabled={setAccess.isPending || !comercio.usuario}
                            onCheckedChange={(checked) => setAccess.mutate({ comercioId: comercio.id, enabled: checked })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

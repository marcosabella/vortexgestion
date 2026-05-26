import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useBancos } from "@/hooks/useBancos";
import { BancoForm } from "./BancoForm";
import { Banco, TIPOS_CUENTA_BANCARIA } from "@/types/banco";

export const BancosList = () => {
  const { bancos, isLoading, deleteBanco } = useBancos();
  const [showForm, setShowForm] = useState(false);
  const [editingBanco, setEditingBanco] = useState<Banco | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredBancos = bancos.filter(banco =>
    banco.nombre_banco.toLowerCase().includes(searchTerm.toLowerCase()) ||
    banco.sucursal.toLowerCase().includes(searchTerm.toLowerCase()) ||
    banco.numero_cuenta.includes(searchTerm) ||
    banco.cbu.includes(searchTerm)
  );

  const getTipoCuentaLabel = (tipo: string) => {
    return TIPOS_CUENTA_BANCARIA.find(t => t.value === tipo)?.label || tipo;
  };

  const handleEdit = (banco: Banco) => {
    setEditingBanco(banco);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingBanco(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <p>Cargando bancos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Gestión de Bancos</CardTitle>
            <Button asChild variant="new">
              <Link to="/bancos/nuevo">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Banco
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por banco, sucursal, cuenta o CBU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Número de Cuenta</TableHead>
                  <TableHead>CBU</TableHead>
                  <TableHead>Tipo de Cuenta</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBancos.map((banco) => (
                  <TableRow key={banco.id}>
                    <TableCell className="font-medium">
                      {banco.nombre_banco}
                    </TableCell>
                    <TableCell>{banco.sucursal}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {banco.numero_cuenta}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {banco.cbu}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getTipoCuentaLabel(banco.tipo_cuenta)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={banco.activo ? "default" : "secondary"}>
                        {banco.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(banco)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm("¿Estás seguro de eliminar este banco?")) {
                              deleteBanco(banco.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredBancos.length === 0 && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {searchTerm ? "No se encontraron bancos que coincidan con la búsqueda" : "No hay bancos registrados"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={handleCloseForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBanco ? "Editar Banco" : "Nuevo Banco"}
            </DialogTitle>
          </DialogHeader>
          <BancoForm banco={editingBanco || undefined} onSuccess={handleCloseForm} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

import { useState } from "react";
import { Link } from "react-router-dom";
import { Edit, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useProductos } from "@/hooks/useProductos";
import { ProductoForm } from "@/components/ProductoForm";
import { Producto } from "@/types/producto";

export const ProductosList = () => {
  const { productos, isLoading, deleteProducto } = useProductos();
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredProductos = productos.filter((producto) =>
    producto.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
    producto.cod_producto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (producto.cod_barras && producto.cod_barras.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (producto.marca?.nombre.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (producto.proveedor?.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleEdit = (producto: Producto) => {
    setEditingProducto(producto);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingProducto(null);
  };

  const formatCurrency = (amount: number, currency: string) => {
    const symbol = currency === 'USD' || currency === 'USD_BLUE' ? 'US$' : '$';
    return `${symbol} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading) {
    return <div className="text-center p-4">Cargando productos...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Lista de Productos</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Button asChild variant="new">
              <Link to="/productos/nuevo">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Producto
              </Link>
            </Button>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingProducto ? "Editar Producto" : "Nuevo Producto"}
                </DialogTitle>
              </DialogHeader>
              <ProductoForm 
                producto={editingProducto || undefined} 
                onClose={handleCloseDialog}
                showTitle={false}
              />
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Código Barras</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Precio Costo</TableHead>
                <TableHead>Precio Venta</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProductos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-4">
                    No se encontraron productos
                  </TableCell>
                </TableRow>
              ) : (
                filteredProductos.map((producto) => (
                  <TableRow key={producto.id}>
                    <TableCell className="font-medium">{producto.cod_producto}</TableCell>
                    <TableCell>{producto.cod_barras || '-'}</TableCell>
                    <TableCell>{producto.descripcion}</TableCell>
                    <TableCell>{producto.marca?.nombre}</TableCell>
                    <TableCell>
                      {producto.proveedor?.razon_social || 
                       `${producto.proveedor?.nombre} ${producto.proveedor?.apellido || ''}`.trim()}
                    </TableCell>
                    <TableCell>{formatCurrency(producto.precio_costo, producto.tipo_moneda)}</TableCell>
                    <TableCell>{formatCurrency(producto.precio_venta, producto.tipo_moneda)}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        producto.stock > 10 
                          ? 'bg-green-100 text-green-800' 
                          : producto.stock > 0 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {producto.stock}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 bg-secondary rounded">
                        {producto.tipo_moneda === 'USD_BLUE' ? 'USD Blue' : producto.tipo_moneda}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(producto)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente el producto "{producto.descripcion}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteProducto(producto.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

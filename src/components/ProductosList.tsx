import { useState } from "react";
import { Link } from "react-router-dom";
import { Edit, Trash2, Plus, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useComercioParametrizacion } from "@/hooks/useComercioParametrizacion";
import { useComercio } from "@/hooks/useComercio";
import { useProductos } from "@/hooks/useProductos";
import { useToast } from "@/hooks/use-toast";
import { ProductoForm } from "@/components/ProductoForm";
import { Producto } from "@/types/producto";
import { buildProductoEtiquetasPdfFile } from "@/utils/productoEtiquetasPdf";

export const ProductosList = () => {
  const { productos, isLoading, deleteProducto } = useProductos();
  const { data: parametrizacion } = useComercioParametrizacion();
  const { comercio } = useComercio();
  const { toast } = useToast();
  const [editingProducto, setEditingProducto] = useState<Producto | null>(null);
  const [printingProducto, setPrintingProducto] = useState<Producto | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [labelWidthCm, setLabelWidthCm] = useState("4");
  const [labelHeightCm, setLabelHeightCm] = useState("2.5");
  const [includeComercioLogo, setIncludeComercioLogo] = useState(false);
  const [isGeneratingLabels, setIsGeneratingLabels] = useState(false);
  const permiteImprimirEtiquetas = parametrizacion.funciones.impresion_etiquetas_productos;
  const comercioLogoUrl = comercio?.logo_url?.trim() || "";

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

  const handleOpenPrintDialog = (producto: Producto) => {
    setPrintingProducto(producto);
    setIncludeComercioLogo(false);
    setIsPrintDialogOpen(true);
  };

  const handleGenerateLabels = async () => {
    if (!printingProducto) return;

    const anchoCm = Number(labelWidthCm);
    const altoCm = Number(labelHeightCm);

    if (!Number.isFinite(anchoCm) || !Number.isFinite(altoCm) || anchoCm <= 0 || altoCm <= 0) {
      toast({
        title: "Tamaño inválido",
        description: "Ingrese ancho y alto de etiqueta mayores a cero.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingLabels(true);
    try {
      const pdfFile = await buildProductoEtiquetasPdfFile({
        producto: printingProducto,
        anchoCm,
        altoCm,
        logoUrl: includeComercioLogo ? comercioLogoUrl : undefined,
      });
      const url = URL.createObjectURL(pdfFile);
      const pdfWindow = window.open(url, "_blank");

      if (!pdfWindow) {
        const link = document.createElement("a");
        link.href = url;
        link.download = pdfFile.name;
        link.click();
      } else {
        pdfWindow.opener = null;
      }

      setIsPrintDialogOpen(false);
    } catch (error) {
      toast({
        title: "No se pudo generar el PDF",
        description: error instanceof Error ? error.message : "Ocurrió un error al generar las etiquetas.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingLabels(false);
    }
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
                        {permiteImprimirEtiquetas && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPrintDialog(producto)}
                            title="Imprimir etiquetas"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        )}
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
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Imprimir etiquetas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{printingProducto?.descripcion}</div>
              <div className="text-muted-foreground">
                Código: {printingProducto?.cod_barras || printingProducto?.cod_producto}
              </div>
              <div className="text-muted-foreground">
                Precio: {printingProducto ? formatCurrency(printingProducto.precio_venta, printingProducto.tipo_moneda) : "-"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="label-width">Ancho etiqueta (cm)</Label>
                <Input
                  id="label-width"
                  type="number"
                  min="1"
                  step="0.1"
                  value={labelWidthCm}
                  onChange={(event) => setLabelWidthCm(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="label-height">Alto etiqueta (cm)</Label>
                <Input
                  id="label-height"
                  type="number"
                  min="1"
                  step="0.1"
                  value={labelHeightCm}
                  onChange={(event) => setLabelHeightCm(event.target.value)}
                />
              </div>
            </div>
            {comercioLogoUrl && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="include-comercio-logo">Agregar logo del comercio</Label>
                  <p className="text-sm text-muted-foreground">
                    Se imprimira el logo cargado en Mi Comercio.
                  </p>
                </div>
                <Switch
                  id="include-comercio-logo"
                  checked={includeComercioLogo}
                  onCheckedChange={setIncludeComercioLogo}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGenerateLabels} disabled={isGeneratingLabels}>
                <Printer className="h-4 w-4 mr-2" />
                {isGeneratingLabels ? "Generando..." : "Generar PDF"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

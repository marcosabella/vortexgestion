import { ProductosList } from "@/components/ProductosList";
import { MarcasManager } from "@/components/MarcasManager";
import { RubrosManager } from "@/components/RubrosManager";
import { SubRubrosManager } from "@/components/SubRubrosManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Productos = () => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gestión de Productos</h1>
        <p className="text-muted-foreground">Administra tu inventario de productos, marcas y categorías</p>
      </div>

      <Tabs defaultValue="productos" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="marcas">Marcas</TabsTrigger>
          <TabsTrigger value="rubros">Rubros</TabsTrigger>
          <TabsTrigger value="subrubros">SubRubros</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="space-y-6">
          <ProductosList />
        </TabsContent>

        <TabsContent value="marcas" className="space-y-6">
          <MarcasManager />
        </TabsContent>

        <TabsContent value="rubros" className="space-y-6">
          <RubrosManager />
        </TabsContent>

        <TabsContent value="subrubros" className="space-y-6">
          <SubRubrosManager />
        </TabsContent>

      </Tabs>
    </div>
  );
};

export default Productos;

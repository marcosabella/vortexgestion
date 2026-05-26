import { useState, useEffect, useRef } from 'react';
import { useAfipConfig, useCreateAfipConfig, useUpdateAfipConfig } from '@/hooks/useAfipConfig';
import { useConsultarUltimoComprobante } from '@/hooks/useConsultarUltimoComprobante';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AMBIENTES_AFIP, TIPOS_COMPROBANTE } from '@/types/afip';
import { FileKey, Save, RefreshCw, CheckCircle, Folder, Search, X } from 'lucide-react';
import { toast } from 'sonner';

const Afip = () => {
  const { data: config, isLoading } = useAfipConfig();
  const createConfig = useCreateAfipConfig();
  const updateConfig = useUpdateAfipConfig();
  const consultarUltimo = useConsultarUltimoComprobante();

  const [puntoVenta, setPuntoVenta] = useState(config?.punto_venta || 1);
  const [cuitEmisor, setCuitEmisor] = useState(config?.cuit_emisor || '');
  const [ambiente, setAmbiente] = useState<'homologacion' | 'produccion'>(config?.ambiente || 'homologacion');
  const [certificadoCrt, setCertificadoCrt] = useState(config?.certificado_crt || '');
  const [certificadoKey, setCertificadoKey] = useState(config?.certificado_key || '');
  const [nombreCertificadoCrt, setNombreCertificadoCrt] = useState(config?.nombre_certificado_crt || '');
  const [nombreCertificadoKey, setNombreCertificadoKey] = useState(config?.nombre_certificado_key || '');
  const [activo, setActivo] = useState(config?.activo ?? true);
  const [crtError, setCrtError] = useState('');
  const [keyError, setKeyError] = useState('');
  const [tipoComprobanteConsulta, setTipoComprobanteConsulta] = useState('factura_b');
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [resultadoConsulta, setResultadoConsulta] = useState<{
    ultimoNumero?: number;
    puntoVenta?: number;
    tipoComprobante?: string;
    ambiente?: string;
    fechaEmision?: string;
    importeTotal?: number;
    importeNeto?: number;
    importeIVA?: number;
    cuitReceptor?: string;
    tipoDocReceptor?: number;
    cae?: string;
    caeVencimiento?: string;
  } | null>(null);

  const inputCrtRef = useRef<HTMLInputElement>(null);
  const inputKeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config) {
      setPuntoVenta(config.punto_venta);
      setCuitEmisor(config.cuit_emisor);
      setAmbiente(config.ambiente);
      setCertificadoCrt(config.certificado_crt || '');
      setCertificadoKey(config.certificado_key || '');
      setNombreCertificadoCrt(config.nombre_certificado_crt || '');
      setNombreCertificadoKey(config.nombre_certificado_key || '');
      setActivo(config.activo ?? true);
    }
  }, [config]);

  const handleCrtFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCrtError('');

    if (!file) return;

    if (!file.name.endsWith('.crt')) {
      setCrtError('El archivo debe tener extensión .crt');
      return;
    }

    if (file.size > 100 * 1024) {
      setCrtError('El archivo no puede exceder 100 KB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCertificadoCrt(content);
      setNombreCertificadoCrt(file.name);
    };
    reader.onerror = () => {
      setCrtError('Error al leer el archivo');
    };
    reader.readAsText(file);
  };

  const handleKeyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setKeyError('');

    if (!file) return;

    if (!file.name.endsWith('.key')) {
      setKeyError('El archivo debe tener extensión .key');
      return;
    }

    if (file.size > 100 * 1024) {
      setKeyError('El archivo no puede exceder 100 KB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCertificadoKey(content);
      setNombreCertificadoKey(file.name);
    };
    reader.onerror = () => {
      setKeyError('Error al leer el archivo');
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!certificadoCrt || !certificadoKey) {
      alert('Debe cargar ambos certificados (CRT y KEY)');
      return;
    }

    const configData = {
      punto_venta: puntoVenta,
      cuit_emisor: cuitEmisor,
      ambiente,
      certificado_crt: certificadoCrt,
      certificado_key: certificadoKey,
      nombre_certificado_crt: nombreCertificadoCrt,
      nombre_certificado_key: nombreCertificadoKey,
      activo,
    };

    if (config?.id) {
      updateConfig.mutate({ id: config.id, ...configData });
    } else {
      createConfig.mutate(configData);
    }
  };

  const handleConsultarUltimo = () => {
    if (!config?.id || !certificadoCrt || !certificadoKey) {
      toast.error('Debe guardar la configuración antes de consultar');
      return;
    }
    consultarUltimo.mutate(
      { tipoComprobante: tipoComprobanteConsulta },
      {
        onSuccess: (data) => {
          setResultadoConsulta(data);
          setShowResultDialog(true);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-muted-foreground">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-2">
            <FileKey className="h-8 w-8" />
            Configuración AFIP
          </h1>
          <p className="text-muted-foreground">
            Configure los parámetros de conexión con AFIP para facturación electrónica
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Datos de Configuración</CardTitle>
            <CardDescription>
              Ingrese los datos necesarios para la integración con AFIP
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="puntoVenta">Punto de Venta *</Label>
                  <Input
                    id="puntoVenta"
                    type="number"
                    min="1"
                    value={puntoVenta}
                    onChange={(e) => setPuntoVenta(parseInt(e.target.value))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Número asignado por AFIP (1-9999)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cuitEmisor">CUIT Emisor *</Label>
                  <Input
                    id="cuitEmisor"
                    type="text"
                    placeholder="XX-XXXXXXXX-X"
                    value={cuitEmisor}
                    onChange={(e) => setCuitEmisor(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Formato: XX-XXXXXXXX-X</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ambiente">Ambiente *</Label>
                  <Select value={ambiente} onValueChange={(value: any) => setAmbiente(value)}>
                    <SelectTrigger id="ambiente">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AMBIENTES_AFIP.map((amb) => (
                        <SelectItem key={amb.value} value={amb.value}>
                          {amb.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Homologación para pruebas, Producción para facturas reales</p>
                </div>

                <div className="space-y-2 flex items-center justify-between">
                  <Label htmlFor="activo">Configuración Activa</Label>
                  <Switch
                    id="activo"
                    checked={activo}
                    onCheckedChange={setActivo}
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Certificados Digitales</h3>

                <Alert className="mb-4">
                  <FileKey className="h-4 w-4" />
                  <AlertDescription>
                    Cargue los archivos de certificado (.crt) y clave privada (.key) obtenidos de AFIP
                  </AlertDescription>
                </Alert>

                <div className="grid gap-6">
                  <div className="space-y-3 p-4 border-2 border-dashed rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="crtFile" className="text-base font-semibold">Certificado Digital (.crt)</Label>
                        {nombreCertificadoCrt && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {nombreCertificadoCrt}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    <input
                      ref={inputCrtRef}
                      id="crtFile"
                      type="file"
                      accept=".crt"
                      onChange={handleCrtFileUpload}
                      className="hidden"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => inputCrtRef.current?.click()}
                    >
                      <Folder className="h-4 w-4 mr-2" />
                      Buscar archivo .crt
                    </Button>

                    {crtError && (
                      <p className="text-sm text-destructive">{crtError}</p>
                    )}

                    {certificadoCrt && (
                      <Textarea
                        value={certificadoCrt}
                        onChange={(e) => setCertificadoCrt(e.target.value)}
                        rows={4}
                        className="font-mono text-xs"
                        placeholder="Contenido del certificado..."
                      />
                    )}
                  </div>

                  <div className="space-y-3 p-4 border-2 border-dashed rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="keyFile" className="text-base font-semibold">Clave Privada (.key)</Label>
                        {nombreCertificadoKey && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {nombreCertificadoKey}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    <input
                      ref={inputKeyRef}
                      id="keyFile"
                      type="file"
                      accept=".key"
                      onChange={handleKeyFileUpload}
                      className="hidden"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => inputKeyRef.current?.click()}
                    >
                      <Folder className="h-4 w-4 mr-2" />
                      Buscar archivo .key
                    </Button>

                    {keyError && (
                      <p className="text-sm text-destructive">{keyError}</p>
                    )}

                    {certificadoKey && (
                      <Textarea
                        value={certificadoKey}
                        onChange={(e) => setCertificadoKey(e.target.value)}
                        rows={4}
                        className="font-mono text-xs"
                        placeholder="Contenido de la clave..."
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="success"
                  disabled={createConfig.isPending || updateConfig.isPending || !certificadoCrt || !certificadoKey}
                >
                  {createConfig.isPending || updateConfig.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {config?.id ? 'Actualizar' : 'Guardar'} Configuración
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {config?.id && certificadoCrt && certificadoKey && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Consultar Último Comprobante</CardTitle>
              <CardDescription>
                Obtenga el último número de comprobante autorizado por AFIP según punto de venta y tipo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipoComprobanteConsulta">Tipo de Comprobante</Label>
                    <Select value={tipoComprobanteConsulta} onValueChange={setTipoComprobanteConsulta}>
                      <SelectTrigger id="tipoComprobanteConsulta">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_COMPROBANTE.filter(t => 
                          t.value.includes('factura') || 
                          t.value.includes('nota_credito') || 
                          t.value.includes('nota_debito')
                        ).map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Punto de Venta Configurado</Label>
                    <Input value={puntoVenta} disabled />
                  </div>
                </div>

                <Button
                  onClick={handleConsultarUltimo}
                  disabled={consultarUltimo.isPending}
                  className="w-full md:w-auto"
                >
                  {consultarUltimo.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Consultando...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Consultar Último Número
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Resultado de Consulta AFIP
              </DialogTitle>
              <DialogDescription>
                Detalles del último comprobante autorizado
              </DialogDescription>
            </DialogHeader>
            
            {resultadoConsulta && (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Último Número</p>
                    <p className="text-5xl font-bold text-primary">
                      {resultadoConsulta.ultimoNumero}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Punto de Venta</p>
                    <p className="text-lg font-semibold">{resultadoConsulta.puntoVenta}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Ambiente</p>
                    <Badge variant={resultadoConsulta.ambiente === 'produccion' ? 'default' : 'secondary'}>
                      {resultadoConsulta.ambiente === 'produccion' ? 'Producción' : 'Homologación'}
                    </Badge>
                  </div>
                </div>
                
                <div className="text-center pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Tipo de Comprobante</p>
                  <p className="text-base font-medium">
                    {TIPOS_COMPROBANTE.find(t => t.value === resultadoConsulta.tipoComprobante)?.label || resultadoConsulta.tipoComprobante}
                  </p>
                </div>

                {resultadoConsulta.ultimoNumero && resultadoConsulta.ultimoNumero > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      {resultadoConsulta.importeTotal !== undefined && (
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Importe Total</p>
                          <p className="text-xl font-bold text-green-600">
                            ${resultadoConsulta.importeTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      )}
                      {resultadoConsulta.cuitReceptor && (
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">
                            {resultadoConsulta.tipoDocReceptor === 80 ? 'CUIT Receptor' : 
                             resultadoConsulta.tipoDocReceptor === 96 ? 'DNI Receptor' : 
                             resultadoConsulta.tipoDocReceptor === 99 ? 'Consumidor Final' : 'Doc. Receptor'}
                          </p>
                          <p className="text-lg font-semibold">
                            {resultadoConsulta.cuitReceptor === '0' ? 'Sin identificar' : resultadoConsulta.cuitReceptor}
                          </p>
                        </div>
                      )}
                    </div>

                    {resultadoConsulta.fechaEmision && (
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Fecha Emisión</p>
                          <p className="text-base font-medium">{resultadoConsulta.fechaEmision}</p>
                        </div>
                        {resultadoConsulta.cae && (
                          <div className="text-center">
                            <p className="text-sm text-muted-foreground">CAE</p>
                            <p className="text-sm font-mono">{resultadoConsulta.cae}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {resultadoConsulta.ultimoNumero === 0 && (
                  <div className="text-center pt-4 border-t">
                    <p className="text-sm text-muted-foreground italic">
                      No hay comprobantes emitidos de este tipo
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button onClick={() => setShowResultDialog(false)} variant="cancel" className="w-full">
                <X className="mr-2 h-4 w-4" />
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Afip;

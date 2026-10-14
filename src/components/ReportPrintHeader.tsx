import { useComercio } from "@/hooks/useComercio";
import { useLayoutEffect, useRef } from "react";

export const ReportPrintHeader = () => {
  const { comercio } = useComercio();
  const nombreRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = nombreRef.current;
    if (!el) return;
    const ajustar = () => {
      const ancho = el.clientWidth;
      const context = document.createElement("canvas").getContext("2d");
      if (!ancho || !context) return;
      const style = getComputedStyle(el);
      context.font = `${style.fontWeight} 18px ${style.fontFamily}`;
      const medida = context.measureText(el.textContent || "").width;
      el.style.fontSize = `${Math.min(18, (ancho - 2) * 18 / Math.max(medida, 1))}px`;
    };
    const observer = new ResizeObserver(ajustar);
    observer.observe(el);
    window.addEventListener("beforeprint", ajustar);
    document.fonts.ready.then(ajustar);
    ajustar();
    return () => { observer.disconnect(); window.removeEventListener("beforeprint", ajustar); };
  }, [comercio?.nombre_comercio]);
  const direccion = [comercio?.calle, comercio?.numero, comercio?.localidad, comercio?.provincia]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="mb-6 hidden items-center justify-between border-b pb-4 print:flex">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {comercio?.logo_url?.trim() && (
          <img
            src={comercio.logo_url}
            alt={`Logo de ${comercio.nombre_comercio}`}
            className="h-16 w-32 object-contain object-left"
          />
        )}
        <div className="min-w-0 flex-1">
          <p ref={nombreRef} className="whitespace-nowrap text-lg font-semibold">{comercio?.nombre_comercio || "Comercio"}</p>
          {direccion && <p className="text-sm text-muted-foreground">{direccion}</p>}
          {comercio?.telefono?.trim() && <p className="text-sm text-muted-foreground">Teléfono: {comercio.telefono.trim()}</p>}
        </div>
      </div>
      {comercio?.cuit && <p className="ml-4 shrink-0 text-sm">CUIT: {comercio.cuit}</p>}
    </div>
  );
};

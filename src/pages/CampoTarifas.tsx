import { useState } from "react";
import { Banknote } from "lucide-react";
import { CampoCatalogList } from "@/components/campo/CampoCatalogList";
import { TarifaForm } from "@/components/campo/TarifaForm";
import { useCampoAccess } from "@/hooks/useCampoAccess";
import { useComercio } from "@/hooks/useComercio";
import {
  useCampoTarifas,
  useSetCampoTarifaStatus,
} from "@/hooks/useCampoTarifas";
import {
  fechaComercial,
  formatoComercial,
  nivelLabel,
  tarifaNiveles,
  tarifaUnidades,
} from "@/utils/campoComercial";

export default function CampoTarifas() {
  const { comercio, isLoading } = useComercio();
  const id = comercio?.id ?? null, access = useCampoAccess(id);
  const confirmed = access.perteneceAlComercio && !access.isLoading &&
    !access.error;
  const query = useCampoTarifas(id, confirmed);
  const rows = confirmed && !query.error ? query.data ?? [] : [];
  const status = useSetCampoTarifaStatus(
    id,
    confirmed && access.isAdmin && !query.error,
    rows,
  );
  const [unidad, setUnidad] = useState(""), [nivel, setNivel] = useState("");
  return (
    <CampoCatalogList
      title="Tarifas comerciales"
      singular="tarifa"
      icon={<Banknote className="h-7 w-7" />}
      comercioId={id}
      comercioNombre={comercio?.nombre_comercio ?? null}
      isComercioLoading={isLoading}
      access={access}
      query={query}
      setStatus={status}
      searchLabel="Buscar por nombre, código, cliente o establecimiento"
      searchText={(x) =>
        [
          x.nombre,
          x.codigo_interno,
          x.cliente?.nombre,
          x.cliente?.apellido,
          x.establecimiento?.nombre,
        ].filter(Boolean).join(" ")}
      extraFilter={(x) =>
        (!unidad || x.unidad === unidad) && (!nivel || x.nivel === nivel)}
      extraFilters={
        <>
          <select
            className="h-10 rounded-md border bg-background px-3"
            aria-label="Filtrar tarifas por unidad"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
          >
            <option value="">Todas las unidades</option>
            {tarifaUnidades.map((u) => (
              <option key={u} value={u}>
                {u === "fijo" ? "Fijo por labor" : u}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3"
            aria-label="Filtrar tarifas por nivel"
            value={nivel}
            onChange={(e) => setNivel(e.target.value)}
          >
            <option value="">Todos los niveles</option>
            {tarifaNiveles.map((n) => (
              <option key={n} value={n}>{nivelLabel[n]}</option>
            ))}
          </select>
        </>
      }
      headers={[
        "Unidad",
        "Alcance",
        "Cliente / establecimiento",
        "Precio unitario",
        "IVA",
        "Vigencia",
        "Observaciones",
      ]}
      cells={(
        x,
      ) => [
        x.unidad === "fijo" ? "Fijo por labor" : x.unidad,
        nivelLabel[x.nivel] ?? "No disponible",
        [x.cliente?.nombre, x.cliente?.apellido].filter(Boolean).join(" ") +
          (x.establecimiento ? ` · ${x.establecimiento.nombre}` : "") ||
        "General",
        `${x.moneda} ${formatoComercial(x.precio_unitario)}`,
        `${formatoComercial(x.porcentaje_iva)} %`,
        `${fechaComercial(x.vigente_desde)} — ${
          fechaComercial(x.vigente_hasta)
        }`,
        <span className="whitespace-pre-wrap" key="obs">
          {x.observaciones || "—"}
        </span>,
      ]}
      renderForm={(_mode, item, done, saving) =>
        id
          ? (
            <TarifaForm
              key={item?.id ?? "nueva"}
              comercioId={id}
              allowed={confirmed && access.isAdmin && !query.error}
              item={item}
              rows={rows}
              onSuccess={done}
              onSaving={saving}
            />
          )
          : null}
    />
  );
}

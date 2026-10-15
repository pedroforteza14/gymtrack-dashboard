import { useMemo, useRef, useState } from "react";
import { ChevronDown, Package, Search } from "lucide-react";
import { api } from "../lib/api";
import { currency } from "../lib/format";

export interface ProductoCatalogo {
  id: string; name: string; sku: string; sellPrice: number;
  line?: string | null; imageName?: string | null; updatedAt?: string; active?: boolean;
}

/** URL de la foto de un producto; la fecha de edición evita que quede la foto vieja en caché. */
export function fotoProducto(id: string, version?: string) {
  const token = localStorage.getItem("token") ?? "";
  return `${api.defaults.baseURL}/products/${id}/image?token=${token}${version ? `&v=${encodeURIComponent(version)}` : ""}`;
}

/** Miniatura cuadrada de la foto del producto (o un ícono si no tiene). */
export function Miniatura({ producto, size = 40 }: { producto?: ProductoCatalogo | null; size?: number }) {
  const [rota, setRota] = useState(false);
  const estilo = { width: size, height: size };
  if (!producto?.imageName || rota) {
    return (
      <div style={estilo} className="flex-shrink-0 rounded-md bg-gray-800 border border-gray-700 grid place-items-center text-gray-600">
        <Package size={Math.round(size * 0.45)} />
      </div>
    );
  }
  return (
    <img src={fotoProducto(producto.id, producto.updatedAt)} alt="" loading="lazy" style={estilo}
      onError={() => setRota(true)}
      className="flex-shrink-0 rounded-md bg-white object-contain border border-gray-700" />
  );
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Elegir un producto del catálogo buscando por nombre, línea o código, con foto y precio. */
export function SelectorProducto({ productos, value, onChange }: {
  productos: ProductoCatalogo[]; value: string; onChange: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(!value);
  const [busqueda, setBusqueda] = useState("");
  const [marcado, setMarcado] = useState(0);
  const lista = useRef<HTMLUListElement>(null);
  const elegido = productos.find((p) => p.id === value);

  const filtrados = useMemo(() => {
    const activos = productos.filter((p) => p.active !== false);
    const q = sinAcentos(busqueda.trim());
    if (!q) return activos;
    const palabras = q.split(/\s+/);
    return activos.filter((p) => {
      const texto = sinAcentos(`${p.name} ${p.line ?? ""} ${p.sku}`);
      return palabras.every((w) => texto.includes(w));
    });
  }, [productos, busqueda]);

  const elegir = (id: string) => { onChange(id); setAbierto(false); setBusqueda(""); };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(0, Math.min(filtrados.length - 1, marcado + (e.key === "ArrowDown" ? 1 : -1)));
      setMarcado(n);
      lista.current?.children[n]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtrados[marcado]) elegir(filtrados[marcado].id);
    } else if (e.key === "Escape" && elegido) {
      setAbierto(false);
    }
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => { setAbierto(true); setMarcado(0); }}
        className="w-full flex items-center gap-3 bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-lg px-2 py-1.5 text-left transition-colors">
        <Miniatura producto={elegido} size={36} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-gray-200 truncate">{elegido?.name ?? "Elegir producto…"}</span>
          {elegido && (
            <span className="block text-[11px] text-gray-500 truncate">
              {elegido.line ? `${elegido.line} · ` : ""}lista {currency(Number(elegido.sellPrice))}
            </span>
          )}
        </span>
        <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-500 rounded-lg overflow-hidden">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input autoFocus value={busqueda} onKeyDown={teclas}
          onChange={(e) => { setBusqueda(e.target.value); setMarcado(0); }}
          placeholder="Buscar producto (ej: banco omega)"
          aria-label="Buscar producto"
          className="w-full bg-transparent pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none border-b border-gray-700" />
      </div>
      <ul ref={lista} role="listbox" className="max-h-64 overflow-y-auto">
        {filtrados.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-gray-500">Sin resultados</li>
        ) : filtrados.map((p, i) => (
          <li key={p.id} role="option" aria-selected={p.id === value}
            onMouseEnter={() => setMarcado(i)}
            onClick={() => elegir(p.id)}
            className={`flex items-center gap-3 px-2 py-1.5 cursor-pointer ${i === marcado ? "bg-gray-700" : ""}`}>
            <Miniatura producto={p} size={36} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-gray-200 truncate">{p.name}</span>
              {p.line && <span className="block text-[11px] text-gray-500">{p.line}</span>}
            </span>
            <span className="text-xs text-gray-300 flex-shrink-0">{currency(Number(p.sellPrice))}</span>
          </li>
        ))}
      </ul>
      {elegido && (
        <button type="button" onClick={() => setAbierto(false)}
          className="w-full text-[11px] text-gray-500 hover:text-gray-300 py-1.5 border-t border-gray-700">
          Cancelar
        </button>
      )}
    </div>
  );
}

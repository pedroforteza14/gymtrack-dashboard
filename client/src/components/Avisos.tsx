import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { getRole } from "../lib/auth";

interface Aviso {
  id: string; type: string; title: string; body: string;
  link?: string | null; read: boolean; createdAt: string;
}

/** Campanita con los avisos del negocio. Sólo para el dueño. */
export default function Avisos() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const esDueño = getRole() === "OWNER";

  const { data } = useQuery<{ items: Aviso[]; sinLeer: number }>({
    queryKey: ["avisos"],
    queryFn: () => api.get("/notificaciones").then((r) => r.data),
    enabled: esDueño,
    refetchInterval: 60_000,          // se refresca solo cada minuto
    refetchOnWindowFocus: true,
  });

  const marcarLeidos = useMutation({
    mutationFn: () => api.post("/notificaciones/leer", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avisos"] }),
  });

  if (!esDueño) return null;
  const sinLeer = data?.sinLeer ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => { setAbierto(!abierto); if (!abierto && sinLeer) marcarLeidos.mutate(); }}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
        aria-label={sinLeer ? `${sinLeer} avisos sin leer` : "Avisos"}
      >
        <Bell size={18} />
        {sinLeer > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-green-500
                           text-[10px] font-bold text-black grid place-items-center">
            {sinLeer > 9 ? "9+" : sinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto z-50 card p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-medium text-white">Avisos</span>
              <button onClick={() => setAbierto(false)} className="text-gray-500 hover:text-white">
                <X size={15} />
              </button>
            </div>
            {!data?.items.length ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No hay avisos todavía</p>
            ) : (
              <ul className="divide-y divide-gray-800/60">
                {data.items.map((a) => {
                  const contenido = (
                    <>
                      <p className="text-sm text-gray-100">{a.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{a.body}</p>
                      <p className="text-[11px] text-gray-600 mt-1">
                        {new Date(a.createdAt).toLocaleString("es-AR", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </>
                  );
                  return (
                    <li key={a.id} className={`px-4 py-3 ${a.read ? "" : "bg-gray-800/30"}`}>
                      {a.link
                        ? <Link to={a.link} onClick={() => setAbierto(false)} className="block hover:opacity-80">{contenido}</Link>
                        : contenido}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

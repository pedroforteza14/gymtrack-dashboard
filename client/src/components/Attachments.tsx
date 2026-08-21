import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Upload, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";

interface Attachment { id: string; fileName: string; fileType?: string; createdAt: string; }

const MAX_MB = 6;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Adjuntos de una ficha o cliente (comprobantes, fotos de entrega, etc.)
export default function Attachments({ entityType, entityId }: { entityType: "ficha" | "client"; entityId: string }) {
  const qc = useQueryClient();
  const key = ["attachments", entityType, entityId];

  const { data: files = [] } = useQuery<Attachment[]>({
    queryKey: key,
    queryFn: () => api.get(`/extras/attachments/${entityType}/${entityId}`).then((r) => r.data),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fileData = await fileToBase64(file);
      return api.post("/extras/attachments", {
        entityType, entityId,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileData,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Archivo adjuntado"); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/extras/attachments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success("Archivo eliminado"); },
  });

  function onPick(f: File | null) {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { toast.error(`El archivo supera ${MAX_MB} MB`); return; }
    upload.mutate(f);
  }

  function open(id: string) {
    const token = localStorage.getItem("token");
    window.open(`${api.defaults.baseURL}/extras/attachments/${id}/file?token=${token}`, "_blank");
  }

  const inputId = `att-${entityType}-${entityId}`;

  return (
    <div>
      <label className="label flex items-center gap-1.5"><Paperclip size={12} /> Archivos adjuntos</label>

      {files.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
              <button onClick={() => open(f.id)} className="text-sm text-gray-200 hover:text-white truncate text-left flex-1">
                {f.fileName}
              </button>
              <button onClick={() => { if (confirm(`¿Eliminar ${f.fileName}?`)) remove.mutate(f.id); }}
                className="text-gray-500 hover:text-red-400 flex-shrink-0 ml-2"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <input id={inputId} type="file" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <label htmlFor={inputId}
        className="flex items-center gap-2 justify-center border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-4 py-3 cursor-pointer text-sm text-gray-400 transition-colors">
        {upload.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {upload.isPending ? "Subiendo..." : `Adjuntar archivo (máx. ${MAX_MB} MB)`}
      </label>
    </div>
  );
}

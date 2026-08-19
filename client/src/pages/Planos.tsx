import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ruler, Plus, X, Trash2, FileText, Loader2, Upload, User, Users, Download,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { dateShort } from "../lib/format";

interface Employee { id: string; name: string; role?: string; }
interface Plano {
  id: string; title: string; notes?: string; status: string;
  fileName?: string; fileType?: string;
  employeeId?: string; employee?: { id: string; name: string } | null;
  createdAt: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  PENDIENTE:  { label: "Pendiente",   color: "bg-yellow-400/10 text-yellow-400" },
  EN_PROCESO: { label: "En proceso",  color: "bg-white/10 text-white" },
  HECHO:      { label: "Hecho",       color: "bg-green-400/10 text-green-400" },
};
const STATUS_ORDER = ["PENDIENTE", "EN_PROCESO", "HECHO"];
const MAX_MB = 6;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Planos() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [newEmp, setNewEmp] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: planos = [], isLoading } = useQuery<Plano[]>({
    queryKey: ["planos"],
    queryFn: () => api.get("/planos").then((r) => r.data),
  });
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: () => api.get("/planos/employees").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      let fileData: string | undefined, fileName: string | undefined, fileType: string | undefined;
      if (file) {
        fileData = await fileToBase64(file);
        fileName = file.name;
        fileType = file.type || "application/octet-stream";
      }
      return api.post("/planos", { title, notes: notes || undefined, employeeId: employeeId || undefined, fileData, fileName, fileType });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["planos"] }); toast.success("Plano guardado"); closeModal(); },
    onError: (e: any) => setErr(e.response?.data?.error ?? "Error al guardar"),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/planos/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planos"] }),
  });
  const assignMut = useMutation({
    mutationFn: ({ id, employeeId }: { id: string; employeeId: string }) => api.put(`/planos/${id}`, { employeeId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planos"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/planos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["planos"] }); toast.success("Plano eliminado"); },
  });
  const addEmpMut = useMutation({
    mutationFn: (name: string) => api.post("/planos/employees", { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employees"] }); setNewEmp(""); },
  });
  const delEmpMut = useMutation({
    mutationFn: (id: string) => api.delete(`/planos/employees/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  function closeModal() {
    setModalOpen(false); setTitle(""); setNotes(""); setEmployeeId(""); setFile(null); setErr("");
    if (fileRef.current) fileRef.current.value = "";
  }
  function onPickFile(f: File | null) {
    setErr("");
    if (f && f.size > MAX_MB * 1024 * 1024) { setErr(`El archivo supera ${MAX_MB} MB`); return; }
    setFile(f);
  }
  function openFile(id: string) {
    const token = localStorage.getItem("token");
    window.open(`${api.defaults.baseURL}/planos/${id}/file?token=${token}`, "_blank");
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Ruler size={24} /> Planos</h1>
          <p className="text-gray-400 text-sm mt-1">{planos.length} planos · {employees.length} empleados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEmpModalOpen(true)} className="btn-secondary"><Users size={16} /> Empleados</button>
          <button onClick={() => setModalOpen(true)} className="btn-primary"><Plus size={16} /> Nuevo plano</button>
        </div>
      </div>

      {/* Planos grid */}
      {isLoading ? (
        <div className="card p-12 text-center text-gray-500">Cargando...</div>
      ) : planos.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">Todavía no cargaste planos. Tocá "Nuevo plano" para empezar.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {planos.map((p) => {
            const st = STATUS[p.status] ?? STATUS.PENDIENTE;
            return (
              <div key={p.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-lg bg-white/10 text-white flex-shrink-0"><FileText size={16} /></div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{p.title}</p>
                      <p className="text-xs text-gray-500">{dateShort(p.createdAt)}</p>
                    </div>
                  </div>
                  <button onClick={() => { if (confirm(`¿Eliminar plano "${p.title}"?`)) deleteMut.mutate(p.id); }}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex-shrink-0"><Trash2 size={14} /></button>
                </div>

                {p.notes && <p className="text-sm text-gray-400 line-clamp-3">{p.notes}</p>}

                {p.fileName && (
                  <button onClick={() => openFile(p.id)}
                    className="flex items-center gap-2 text-sm text-gray-200 bg-gray-800/60 hover:bg-gray-800 rounded-lg px-3 py-2 transition-colors">
                    <Download size={14} /> <span className="truncate">{p.fileName}</span>
                  </button>
                )}

                <div className="flex items-center gap-2 mt-auto pt-2">
                  <select value={p.employeeId ?? ""} onChange={(e) => assignMut.mutate({ id: p.id, employeeId: e.target.value })}
                    className="input text-xs py-1.5 flex-1">
                    <option value="">Sin asignar</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                  <select value={p.status} onChange={(e) => statusMut.mutate({ id: p.id, status: e.target.value })}
                    className={`text-xs font-medium rounded-lg px-2 py-1.5 border-0 focus:outline-none ${st.color}`}>
                    {STATUS_ORDER.map((s) => <option key={s} value={s} className="bg-gray-900 text-white">{STATUS[s].label}</option>)}
                  </select>
                </div>
                {p.employee && (
                  <p className="text-xs text-gray-500 flex items-center gap-1"><User size={11} /> Asignado a {p.employee.name}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nuevo plano */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Nuevo plano</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Título</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Ej: Rack TP-03 — medidas" />
              </div>
              <div>
                <label className="label">Notas / instrucciones</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="input resize-none" placeholder="Medidas, materiales, indicaciones para el empleado..." />
              </div>
              <div>
                <label className="label">Asignar a empleado (opcional)</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input">
                  <option value="">Sin asignar</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Archivo del plano (PDF o imagen, opcional)</label>
                <input ref={fileRef} type="file" accept="image/*,application/pdf"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  className="hidden" id="plano-file" />
                <label htmlFor="plano-file"
                  className="flex items-center gap-2 justify-center border border-dashed border-gray-700 hover:border-gray-500 rounded-lg px-4 py-6 cursor-pointer text-sm text-gray-400 transition-colors">
                  <Upload size={16} /> {file ? file.name : "Seleccionar archivo (máx. 6 MB)"}
                </label>
              </div>
              {err && <p className="text-red-400 text-sm">{err}</p>}
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={closeModal} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button onClick={() => createMut.mutate()} disabled={!title || createMut.isPending} className="btn-primary flex-1 justify-center">
                {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Guardar plano
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal empleados */}
      {empModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Empleados</h2>
              <button onClick={() => setEmpModalOpen(false)} className="text-gray-400 hover:text-gray-100"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <input value={newEmp} onChange={(e) => setNewEmp(e.target.value)} className="input" placeholder="Nombre del empleado"
                  onKeyDown={(e) => { if (e.key === "Enter" && newEmp.trim()) addEmpMut.mutate(newEmp.trim()); }} />
                <button onClick={() => newEmp.trim() && addEmpMut.mutate(newEmp.trim())} disabled={!newEmp.trim() || addEmpMut.isPending} className="btn-primary">
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {employees.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">Sin empleados cargados</p>
                ) : employees.map((emp) => (
                  <div key={emp.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2">
                    <span className="text-gray-200 text-sm flex items-center gap-2"><User size={13} className="text-gray-500" /> {emp.name}</span>
                    <button onClick={() => { if (confirm(`¿Quitar a ${emp.name}?`)) delEmpMut.mutate(emp.id); }}
                      className="text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

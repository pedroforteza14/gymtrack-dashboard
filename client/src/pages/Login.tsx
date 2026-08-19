import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { login } from "../lib/auth";
import { Loader2 } from "lucide-react";
import logo from "../assets/logo.png";
import shot1 from "../assets/showcase/shot1.webp";
import shot2 from "../assets/showcase/shot2.webp";
import shot3 from "../assets/showcase/shot3.webp";
import shot4 from "../assets/showcase/shot4.webp";
import shot5 from "../assets/showcase/shot5.webp";

const SHOTS = [shot1, shot2, shot3, shot4, shot5];

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      const user = await login(data.email, data.password);
      navigate(user.role === "MARKETING" ? "/ads" : "/");
    } catch {
      setError("Email o contraseña incorrectos");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Slideshow de fondo (Ken Burns + crossfade) */}
      <div className="absolute inset-0">
        {SHOTS.map((src, i) => (
          <div key={i} className="login-slide" style={{ backgroundImage: `url(${src})`, animationDelay: `${i * 8}s` }} />
        ))}
        {/* Capas oscuras para legibilidad (vignette) */}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/55" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8 animate-logo">
          <img src={logo} alt="The Promise Machine" className="h-16 mx-auto mb-3 object-contain drop-shadow-[0_0_25px_rgba(255,255,255,0.15)]" />
          <p className="text-gray-300 text-sm">Sistema de gestión</p>
        </div>

        <div className="card bg-gray-900/70 backdrop-blur-xl border-gray-700/60 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">Iniciar sesión</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input {...register("email")} type="email" className="input" placeholder="admin@gymtrack.com" />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input {...register("password")} type="password" className="input" placeholder="••••••••" />
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full justify-center">
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {isSubmitting ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "./auth";

export type Rol = "OWNER" | "MARKETING" | "SELLER";

/**
 * Carga el usuario del token en req.user. Va después de authMiddleware.
 * Guardamos el rol acá para no ir a la base en cada chequeo posterior.
 */
export async function cargarUsuario(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) { res.status(401).json({ error: "No autorizado" }); return; }
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, name: true, role: true, active: true, commissionRate: true },
  });
  if (!user) { res.status(401).json({ error: "Usuario inexistente" }); return; }
  if (!user.active) { res.status(403).json({ error: "Usuario desactivado" }); return; }
  req.user = user;
  next();
}

/** Deja pasar sólo a los roles indicados. */
export function soloRoles(...roles: Rol[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const rol = req.user?.role as Rol | undefined;
    if (!rol || !roles.includes(rol)) {
      res.status(403).json({ error: "No tenés permiso para acceder a esta sección" });
      return;
    }
    next();
  };
}

/** Atajo: todo lo que es información sensible del negocio es sólo del dueño. */
export const soloDueño = soloRoles("OWNER");

/** True si el usuario es vendedor (ve únicamente lo suyo). */
export function esVendedor(req: AuthRequest): boolean {
  return req.user?.role === "SELLER";
}

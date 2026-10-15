import { prisma } from "./prisma";

/* ═══════════════════════════════════════════════════════════
   FOTOS DE PRODUCTO PARA LOS PDF

   Las fotos se guardan en la base tal cual se subieron (hasta 2,5 MB,
   en JPG, PNG o WebP). El PDF sólo acepta JPG/PNG y no conviene meter
   fotos pesadas, así que se achican a una miniatura JPG y se guardan
   en memoria para no reconvertirlas en cada presupuesto.
   ═══════════════════════════════════════════════════════════ */

type Sharp = typeof import("sharp");
let sharpCargado: Promise<Sharp | null> | null = null;

// sharp es un módulo nativo: si en el servidor no carga, el PDF sale sin fotos en vez de romperse
function cargarSharp(): Promise<Sharp | null> {
  if (!sharpCargado) {
    sharpCargado = import("sharp")
      .then((m) => ((m as unknown as { default?: Sharp }).default ?? (m as unknown as Sharp)))
      .catch((e) => {
        console.error("No se pudo cargar sharp; los PDF salen sin fotos:", e);
        return null;
      });
  }
  return sharpCargado;
}

const LADO = 240; // px: ~3x el tamaño en el PDF, se ve nítido impreso
const MAX_EN_MEMORIA = 300;
const cache = new Map<string, Buffer | null>(); // clave: id + fecha de última edición del producto

async function miniatura(base64: string, tipo: string | null): Promise<Buffer | null> {
  const original = Buffer.from(base64, "base64");
  const sharp = await cargarSharp();
  if (!sharp) {
    // sin sharp, sólo sirven las que ya son JPG o PNG
    return tipo === "image/jpeg" || tipo === "image/png" ? original : null;
  }
  try {
    return await sharp(original)
      .rotate() // respeta la orientación de las fotos sacadas con el celular
      .resize(LADO, LADO, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // PNG con transparencia: fondo blanco
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.error("Foto de producto ilegible:", e);
    return null;
  }
}

/** Miniaturas JPG de los productos que tienen foto, por id de producto. */
export async function fotosParaPdf(productIds: string[]): Promise<Map<string, Buffer>> {
  const ids = [...new Set(productIds)];
  const resultado = new Map<string, Buffer>();
  if (ids.length === 0) return resultado;

  // primero lo liviano: qué productos tienen foto y cuándo se editaron
  const productos = await prisma.product.findMany({
    where: { id: { in: ids }, imageName: { not: null } },
    select: { id: true, updatedAt: true },
  });

  const faltan: string[] = [];
  for (const p of productos) {
    const clave = `${p.id}:${p.updatedAt.getTime()}`;
    if (cache.has(clave)) {
      const foto = cache.get(clave);
      if (foto) resultado.set(p.id, foto);
    } else {
      faltan.push(p.id);
    }
  }

  if (faltan.length > 0) {
    const conFoto = await prisma.product.findMany({
      where: { id: { in: faltan } },
      select: { id: true, updatedAt: true, imageData: true, imageType: true },
    });
    for (const p of conFoto) {
      const foto = p.imageData ? await miniatura(p.imageData, p.imageType) : null;
      if (cache.size >= MAX_EN_MEMORIA) cache.delete(cache.keys().next().value!);
      cache.set(`${p.id}:${p.updatedAt.getTime()}`, foto);
      if (foto) resultado.set(p.id, foto);
    }
  }
  return resultado;
}

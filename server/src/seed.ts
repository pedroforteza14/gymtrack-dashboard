import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Usuario dueño del local
  const hashOwner = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@gymtrack.com" },
    update: { role: "OWNER" },
    create: { email: "admin@gymtrack.com", password: hashOwner, name: "Dueño", role: "OWNER" },
  });

  // Usuario marketing
  const hashMkt = await bcrypt.hash("marketing123", 10);
  await prisma.user.upsert({
    where: { email: "marketing@gymtrack.com" },
    update: { role: "MARKETING" },
    create: { email: "marketing@gymtrack.com", password: hashMkt, name: "Marketing", role: "MARKETING" },
  });

  // Create categories
  const categories = ["Cardio", "Fuerza", "Funcional", "Accesorios", "Recuperación"];
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  const cats = await prisma.category.findMany();
  const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  // Sample products
  const products = [
    { name: "Cinta de Correr Pro X1", sku: "CARD-001", categoryId: catMap["Cardio"], costPrice: 850, sellPrice: 1400, stock: 8, stockMinAlert: 3 },
    { name: "Bicicleta Estática Elite", sku: "CARD-002", categoryId: catMap["Cardio"], costPrice: 420, sellPrice: 750, stock: 12, stockMinAlert: 4 },
    { name: "Elíptica CrossFit 2000", sku: "CARD-003", categoryId: catMap["Cardio"], costPrice: 580, sellPrice: 980, stock: 5, stockMinAlert: 3 },
    { name: "Banco Multiposición", sku: "FUER-001", categoryId: catMap["Fuerza"], costPrice: 180, sellPrice: 320, stock: 15, stockMinAlert: 5 },
    { name: "Rack de Sentadillas Olímpico", sku: "FUER-002", categoryId: catMap["Fuerza"], costPrice: 650, sellPrice: 1100, stock: 6, stockMinAlert: 2 },
    { name: "Set Mancuernas 2-30kg", sku: "FUER-003", categoryId: catMap["Fuerza"], costPrice: 290, sellPrice: 520, stock: 10, stockMinAlert: 4 },
    { name: "Polea Funcional Doble", sku: "FUNC-001", categoryId: catMap["Funcional"], costPrice: 720, sellPrice: 1250, stock: 4, stockMinAlert: 2 },
    { name: "TRX Pro System", sku: "FUNC-002", categoryId: catMap["Funcional"], costPrice: 85, sellPrice: 160, stock: 20, stockMinAlert: 6 },
    { name: "Kettlebell Set 8-32kg", sku: "FUNC-003", categoryId: catMap["Funcional"], costPrice: 210, sellPrice: 380, stock: 14, stockMinAlert: 5 },
    { name: "Colchoneta Yoga Pro", sku: "ACCE-001", categoryId: catMap["Accesorios"], costPrice: 25, sellPrice: 55, stock: 40, stockMinAlert: 10 },
    { name: "Rodillo de Espuma", sku: "RECU-001", categoryId: catMap["Recuperación"], costPrice: 18, sellPrice: 40, stock: 3, stockMinAlert: 5 },
  ];

  for (const p of products) {
    await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p });
  }

  console.log("Seed completado.");
  console.log("Dueño:     admin@gymtrack.com     / admin123");
  console.log("Marketing: marketing@gymtrack.com / marketing123");
}

main().catch(console.error).finally(() => prisma.$disconnect());

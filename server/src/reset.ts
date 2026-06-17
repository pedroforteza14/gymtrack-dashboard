/**
 * reset.ts — Borra todos los datos de negocio y deja la DB limpia
 * Mantiene los usuarios. Ejecutar: npx tsx src/reset.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🗑️  Limpiando base de datos...");

  // Orden importa por las FK
  await prisma.adMetrics.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.adAccount.deleteMany();

  await prisma.stockMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();

  await prisma.quoteItem.deleteMany();
  await prisma.quote.deleteMany();

  await prisma.client.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  console.log("✅ Base de datos limpia. Los usuarios se mantienen.");
  console.log("   admin@gymtrack.com / admin123");
  console.log("   marketing@gymtrack.com / marketing123");
}

main().catch(console.error).finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const categories = [
  "Bancos",
  "Dorsaleras",
  "Racks",
  "Pinos",
  "Poleas",
  "Accesorios para poleas",
  "Piernas",
  "Espalda",
  "Accesorios para racks",
  "Mancuernas",
  "Discos",
  "Combos",
];

// sellPrice = precio real del sitio. costPrice = 1 (completar con costo real de fabricación)
const products = [
  // BANCOS
  { sku: "BAN-001", name: "Banco Multiangular Clásico", cat: "Bancos", sell: 280000 },
  { sku: "BAN-002", name: "Banco Multiangular Profesional", cat: "Bancos", sell: 300000 },
  { sku: "BAN-003", name: "Banco Multi Angular Premium", cat: "Bancos", sell: 385000 },
  { sku: "BAN-004", name: "Banco Multiangular con módulo para abdominales", cat: "Bancos", sell: 365000 },
  { sku: "BAN-005", name: "Banco Multi Angular + Módulo Abdominales/Declinados", cat: "Bancos", sell: 475000 },
  { sku: "BAN-006", name: "Banco Multi Angular + módulo p/piernas", cat: "Bancos", sell: 400000 },
  { sku: "BAN-007", name: "Banco Multi Angular + módulo p/piernas + Agarre p/isquios", cat: "Bancos", sell: 425000 },
  { sku: "BAN-008", name: "Banco Multiangular + módulo piernas + agarre isquios/cuádriceps", cat: "Bancos", sell: 450000 },
  { sku: "BAN-009", name: "Banco Multi Angular + Módulo piernas + Módulo scott", cat: "Bancos", sell: 550000 },
  { sku: "BAN-010", name: "Banco Multi Angular + Módulo p/piernas + Agarre PREMIUM", cat: "Bancos", sell: 500000 },
  { sku: "BAN-011", name: "Banco Multi Angular + Módulo Para Piernas + Doble Agarre", cat: "Bancos", sell: 535000 },
  { sku: "BAN-012", name: "Banco Multi Angular Línea Pesada Profesional", cat: "Bancos", sell: 500000 },
  // DORSALERAS
  { sku: "DOR-001", name: "Dorsalera Clásica", cat: "Dorsaleras", sell: 600000 },
  { sku: "DOR-002", name: "Dorsalera con rodillos", cat: "Dorsaleras", sell: 650000 },
  { sku: "DOR-003", name: "Dorsalera con rodillera regulable", cat: "Dorsaleras", sell: 650000 },
  { sku: "DOR-004", name: "Dorsalera + Módulo Scott", cat: "Dorsaleras", sell: 750000 },
  { sku: "DOR-005", name: "Dorsalera + Remo Bajo Profesional", cat: "Dorsaleras", sell: 2000000 },
  { sku: "DOR-006", name: "Polea regulable/pivotante", cat: "Dorsaleras", sell: 975000 },
  { sku: "DOR-007", name: "Carro Porta Poleas Regulable", cat: "Dorsaleras", sell: 150000 },
  // RACKS
  { sku: "RAC-001", name: "Rack TP-01", cat: "Racks", sell: 300000 },
  { sku: "RAC-002", name: "Rack TP-02", cat: "Racks", sell: 500000 },
  { sku: "RAC-003", name: "Rack TP-02 + Módulo Hip Thrust + Landmine", cat: "Racks", sell: 750000 },
  { sku: "RAC-004", name: "Rack TP-03", cat: "Racks", sell: 600000 },
  { sku: "RAC-005", name: "Rack TP-03 Plus", cat: "Racks", sell: 800000 },
  { sku: "RAC-006", name: "Rack TP-04 Amurable", cat: "Racks", sell: 500000 },
  { sku: "RAC-007", name: "Rack TP-04 Con Poleas Enfrentadas", cat: "Racks", sell: 1500000 },
  { sku: "RAC-008", name: "Monster Rack", cat: "Racks", sell: 1500000 },
  // PINOS
  { sku: "PIN-001", name: "Pino TP-01 clásico de 30mm", cat: "Pinos", sell: 70000 },
  { sku: "PIN-002", name: "Pino TP-01 clásico de 50mm", cat: "Pinos", sell: 75000 },
  { sku: "PIN-003", name: "Pino TP-01 30mm (con ruedas)", cat: "Pinos", sell: 95000 },
  { sku: "PIN-004", name: "Pino TP-01 50mm (con ruedas)", cat: "Pinos", sell: 105000 },
  { sku: "PIN-005", name: "Pino TP-02 de 30mm", cat: "Pinos", sell: 80000 },
  { sku: "PIN-006", name: "Pino TP-02 de 50mm", cat: "Pinos", sell: 90000 },
  { sku: "PIN-007", name: "Pino TP-02 + 2 Porta barras", cat: "Pinos", sell: 80000 },
  { sku: "PIN-008", name: "Pino TP-02 de 30mm con 3 Porta Barras", cat: "Pinos", sell: 95000 },
  { sku: "PIN-009", name: "Pino TP-03 de 30mm", cat: "Pinos", sell: 180000 },
  { sku: "PIN-010", name: "Pino TP-03 50mm", cat: "Pinos", sell: 195000 },
  { sku: "PIN-011", name: "Pino TP-03 de 30mm con Porta barra + ruedas", cat: "Pinos", sell: 200000 },
  { sku: "PIN-012", name: "Pino TP-04 de 50mm", cat: "Pinos", sell: 140000 },
  // POLEAS
  { sku: "POL-001", name: "Polea Clásica", cat: "Poleas", sell: 90000 },
  { sku: "POL-002", name: "Polea De Pared clásica", cat: "Poleas", sell: 320000 },
  { sku: "POL-003", name: "Polea Doble De Pared", cat: "Poleas", sell: 350000 },
  { sku: "POL-004", name: "Polea Regulable A Discos", cat: "Poleas", sell: 650000 },
  // ACCESORIOS PARA POLEAS
  { sku: "ACP-001", name: "Barra Recta Accesorio para polea", cat: "Accesorios para poleas", sell: 20000 },
  { sku: "ACP-002", name: "Remo Triangulo Accesorio", cat: "Accesorios para poleas", sell: 30000 },
  { sku: "ACP-003", name: "Barra Dorsalera Accesorio", cat: "Accesorios para poleas", sell: 35000 },
  { sku: "ACP-004", name: "Barra En V Accesorio", cat: "Accesorios para poleas", sell: 30000 },
  { sku: "ACP-005", name: "Estribo Simple Accesorio", cat: "Accesorios para poleas", sell: 32000 },
  { sku: "ACP-006", name: "Tobillera Para Polea Con Talón", cat: "Accesorios para poleas", sell: 30000 },
  { sku: "ACP-007", name: "Remo Tríangulo TP", cat: "Accesorios para poleas", sell: 35000 },
  { sku: "ACP-008", name: "Soga Tríceps Accesorio Para Poleas", cat: "Accesorios para poleas", sell: 37000 },
  { sku: "ACP-009", name: "Combo Accesorios Para Poleas (3 piezas)", cat: "Accesorios para poleas", sell: 85000 },
  { sku: "ACP-010", name: "Combo Accesorios Para Poleas (5 piezas)", cat: "Accesorios para poleas", sell: 150000 },
  // PIERNAS
  { sku: "PIE-001", name: "Hip Thrust", cat: "Piernas", sell: 350000 },
  { sku: "PIE-002", name: "Hip Thrust PREMIUM", cat: "Piernas", sell: 400000 },
  { sku: "PIE-003", name: "Banco Sentadillas Búlgaras", cat: "Piernas", sell: 250000 },
  { sku: "PIE-004", name: "Sentadilla Sissy con registro", cat: "Piernas", sell: 300000 },
  { sku: "PIE-005", name: "Banco para Femorales/Isquiotibiales parado", cat: "Piernas", sell: 500000 },
  { sku: "PIE-006", name: "Plataforma Para Sentadilla Sumo Profesional", cat: "Piernas", sell: 185000 },
  { sku: "PIE-007", name: "Barra Hexagonal Abierta Gimnasio 30/50mm", cat: "Piernas", sell: 175000 },
  { sku: "PIE-008", name: "Sillón de Cuadríceps", cat: "Piernas", sell: 1500000 },
  { sku: "PIE-009", name: "Prensa 45° Profesional", cat: "Piernas", sell: 2000000 },
  // ESPALDA
  { sku: "ESP-001", name: "Banco Hiperextensiones a 45°", cat: "Espalda", sell: 390000 },
  { sku: "ESP-002", name: "Remo T a caballo PREMIUM", cat: "Espalda", sell: 425000 },
  { sku: "ESP-003", name: "Máquina para espalda tipo Hammer Arms", cat: "Espalda", sell: 400000 },
  { sku: "ESP-004", name: "Barra Dominadas Tipo Crossfit", cat: "Espalda", sell: 120000 },
  { sku: "ESP-005", name: "Accesorio Landmine Dorsalera P/Barras", cat: "Espalda", sell: 80000 },
  // ACCESORIOS PARA RACKS
  { sku: "ACR-001", name: "J Hook", cat: "Accesorios para racks", sell: 90000 },
  { sku: "ACR-002", name: "Safety Bar", cat: "Accesorios para racks", sell: 105000 },
  { sku: "ACR-003", name: "Combo J Hooks + Barra de Seguridad", cat: "Accesorios para racks", sell: 200000 },
  { sku: "ACR-004", name: "Paralelas", cat: "Accesorios para racks", sell: 95000 },
  // MANCUERNAS
  { sku: "MAN-001", name: "Mancuernas Huecas 30mm", cat: "Mancuernas", sell: 75000 },
  { sku: "MAN-002", name: "Mancuernero", cat: "Mancuernas", sell: 400000 },
  { sku: "MAN-003", name: "Mancuernero Completo + Set Mancuernas Hexagonales (2.5kg a 30kg)", cat: "Mancuernas", sell: 3250000 },
  // DISCOS
  { sku: "DIS-001", name: "Discos Olímpicos Strong", cat: "Discos", sell: 40000, stock: 0 },
  // COMBOS
  { sku: "COM-001", name: "Combo Banco Plano Clásico + Rack Regulable", cat: "Combos", sell: 350000 },
  { sku: "COM-002", name: "Combo Banco Multi Angular Clásico + Rack Regulable", cat: "Combos", sell: 450000 },
  { sku: "COM-003", name: "Combo Banco Multiangular + Rack Regulable", cat: "Combos", sell: 500000 },
  { sku: "COM-004", name: "Combo Banco Multi Angular + Módulo p/Piernas + Rack TP-01", cat: "Combos", sell: 700000 },
  { sku: "COM-005", name: "Combo Banco Multi Angular Profesional + Half Rack TP-03", cat: "Combos", sell: 800000 },
  { sku: "COM-006", name: "Combo Banco Multi Angular + Módulo PREMIUM + Rack TP-03", cat: "Combos", sell: 1100000 },
];

async function main() {
  console.log("Limpiando datos anteriores...");
  await prisma.stockMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  // Usuario admin
  const hash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@gymtrack.com" },
    update: {},
    create: { email: "admin@gymtrack.com", password: hash, name: "Administrador" },
  });

  // Categorías
  for (const name of categories) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  const cats = await prisma.category.findMany();
  const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  // Productos reales
  console.log(`Cargando ${products.length} productos...`);
  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        sellPrice: p.sell,
        categoryId: catMap[p.cat],
      },
      create: {
        sku: p.sku,
        name: p.name,
        categoryId: catMap[p.cat],
        costPrice: 1,       // ← COMPLETAR con el costo real de fabricación
        sellPrice: p.sell,
        stock: p.stock ?? 10,
        stockMinAlert: 3,
      },
    });
  }

  console.log(`\n✓ ${products.length} productos cargados correctamente.`);
  console.log("⚠️  Recordá actualizar el 'Costo' de cada producto en la sección Productos.");
  console.log("\nUsuario: admin@gymtrack.com / admin123");
}

main().catch(console.error).finally(() => prisma.$disconnect());

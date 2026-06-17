/**
 * seed-tpm.ts — Carga los productos de The Promise Machine
 * Ejecutar: npx tsx src/seed-tpm.ts
 *
 * NOTA: costPrice queda en 0 — completar con los costos reales de fabricación.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── Categorías ────────────────────────────────────────────────────────────
  const catNames = [
    "Bancos", "Racks", "Piernas", "Espalda",
    "Dorsaleras", "Pinos", "Mancuernas", "Tríceps", "Pisos",
  ];

  for (const name of catNames) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  const cats = await prisma.category.findMany();
  const c = Object.fromEntries(cats.map((x) => [x.name, x.id]));

  // ── Productos ─────────────────────────────────────────────────────────────
  const products = [
    // BANCOS
    { sku: "BAN-001", name: "Banco Multi Angular Premium",                               categoryId: c["Bancos"],    costPrice: 0, sellPrice: 425000 },
    { sku: "BAN-002", name: "Banco Multi Angular + Módulo p/piernas",                    categoryId: c["Bancos"],    costPrice: 0, sellPrice: 440000 },
    { sku: "BAN-003", name: "Banco Multi Angular + Módulo p/piernas + Agarre p/isquios", categoryId: c["Bancos"],    costPrice: 0, sellPrice: 475000 },
    { sku: "BAN-004", name: "Banco Multi Angular + Módulo p/piernas + Agarre PREMIUM",   categoryId: c["Bancos"],    costPrice: 0, sellPrice: 550000 },
    { sku: "BAN-005", name: "Banco Multi Angular + Módulo Piernas + Doble Agarre",       categoryId: c["Bancos"],    costPrice: 0, sellPrice: 600000 },
    { sku: "BAN-006", name: "Banco Multi Angular Línea Pesada Profesional",               categoryId: c["Bancos"],    costPrice: 0, sellPrice: 550000 },
    { sku: "BAN-007", name: "Banco Multi Angular Monster",                                categoryId: c["Bancos"],    costPrice: 0, sellPrice: 900000 },
    { sku: "BAN-008", name: "Banco Plano Olímpico",                                      categoryId: c["Bancos"],    costPrice: 0, sellPrice: 550000 },
    { sku: "BAN-009", name: "Banco Inclinado Olímpico",                                  categoryId: c["Bancos"],    costPrice: 0, sellPrice: 550000 },
    { sku: "BAN-010", name: "Banco Scott Premium",                                        categoryId: c["Bancos"],    costPrice: 0, sellPrice: 360000 },
    { sku: "BAN-011", name: "Banco para Hombro Premium",                                  categoryId: c["Bancos"],    costPrice: 0, sellPrice: 275000 },
    { sku: "BAN-012", name: "Banco Hiperextensiones a 45°",                               categoryId: c["Bancos"],    costPrice: 0, sellPrice: 430000 },

    // RACKS
    { sku: "RAC-001", name: "Rack TP-01",                                                 categoryId: c["Racks"],     costPrice: 0, sellPrice: 330000 },
    { sku: "RAC-002", name: "Rack TP-02",                                                 categoryId: c["Racks"],     costPrice: 0, sellPrice: 550000 },
    { sku: "RAC-003", name: "Rack TP-02 + Módulo Hip Thrust + Landmine",                  categoryId: c["Racks"],     costPrice: 0, sellPrice: 800000 },
    { sku: "RAC-004", name: "Rack TP-03",                                                 categoryId: c["Racks"],     costPrice: 0, sellPrice: 660000 },
    { sku: "RAC-005", name: "Rack TP-03 Plus",                                            categoryId: c["Racks"],     costPrice: 0, sellPrice: 880000 },
    { sku: "RAC-006", name: "Rack TP-04 Amurable",                                        categoryId: c["Racks"],     costPrice: 0, sellPrice: 550000 },
    { sku: "RAC-007", name: "Rack TP-04 Con Poleas Enfrentadas",                          categoryId: c["Racks"],     costPrice: 0, sellPrice: 1500000 },
    { sku: "RAC-008", name: "Monster Rack",                                                categoryId: c["Racks"],     costPrice: 0, sellPrice: 1500000 },
    { sku: "RAC-009", name: "Rack Smith Línea Alfa",                                       categoryId: c["Racks"],     costPrice: 0, sellPrice: 1650000 },

    // PIERNAS
    { sku: "PIE-001", name: "Hip Thrust PREMIUM",                                          categoryId: c["Piernas"],   costPrice: 0, sellPrice: 440000 },
    { sku: "PIE-002", name: "Banco para Femorales/Isquiotibiales Parado",                 categoryId: c["Piernas"],   costPrice: 0, sellPrice: 500000 },
    { sku: "PIE-003", name: "Prensa 45° Profesional",                                      categoryId: c["Piernas"],   costPrice: 0, sellPrice: 2000000 },
    { sku: "PIE-004", name: "Barra Hexagonal Abierta Gimnasio 30/50mm",                   categoryId: c["Piernas"],   costPrice: 0, sellPrice: 175000 },
    { sku: "PIE-005", name: "Plataforma Para Sentadilla Sumo Profesional",                 categoryId: c["Piernas"],   costPrice: 0, sellPrice: 185000 },
    { sku: "PIE-006", name: "Sillón de Cuádriceps",                                        categoryId: c["Piernas"],   costPrice: 0, sellPrice: 1650000 },
    { sku: "PIE-007", name: "Banco Sentadillas Búlgaras",                                  categoryId: c["Piernas"],   costPrice: 0, sellPrice: 250000 },
    { sku: "PIE-008", name: "Sentadilla Sissy con Registro",                               categoryId: c["Piernas"],   costPrice: 0, sellPrice: 300000 },

    // ESPALDA
    { sku: "ESP-001", name: "Remo T a Caballo PREMIUM",                                    categoryId: c["Espalda"],   costPrice: 0, sellPrice: 485000 },
    { sku: "ESP-002", name: "Peck Deck Con Lingotera",                                     categoryId: c["Espalda"],   costPrice: 0, sellPrice: 1600000 },

    // DORSALERAS
    { sku: "DOR-001", name: "Dorsalera Clásica",                                           categoryId: c["Dorsaleras"], costPrice: 0, sellPrice: 660000 },
    { sku: "DOR-002", name: "Dorsalera con Rodillos",                                      categoryId: c["Dorsaleras"], costPrice: 0, sellPrice: 700000 },
    { sku: "DOR-003", name: "Dorsalera con Rodillera Regulable",                           categoryId: c["Dorsaleras"], costPrice: 0, sellPrice: 700000 },
    { sku: "DOR-004", name: "Dorsalera + Módulo Scott",                                    categoryId: c["Dorsaleras"], costPrice: 0, sellPrice: 800000 },
    { sku: "DOR-005", name: "Dorsalera + Remo Bajo Profesional",                           categoryId: c["Dorsaleras"], costPrice: 0, sellPrice: 2100000 },
    { sku: "DOR-006", name: "Polea Regulable/Pivotante",                                   categoryId: c["Dorsaleras"], costPrice: 0, sellPrice: 975000 },
    { sku: "DOR-007", name: "Carro Porta Poleas Regulable",                                categoryId: c["Dorsaleras"], costPrice: 0, sellPrice: 150000 },

    // PINOS
    { sku: "PIN-001", name: "Pino TP-01 Clásico 30mm",                                    categoryId: c["Pinos"],     costPrice: 0, sellPrice: 80000 },
    { sku: "PIN-002", name: "Pino TP-01 Clásico 50mm",                                    categoryId: c["Pinos"],     costPrice: 0, sellPrice: 80000 },
    { sku: "PIN-003", name: "Pino TP-01 30mm con Ruedas",                                 categoryId: c["Pinos"],     costPrice: 0, sellPrice: 105000 },
    { sku: "PIN-004", name: "Pino TP-01 50mm con Ruedas",                                 categoryId: c["Pinos"],     costPrice: 0, sellPrice: 105000 },
    { sku: "PIN-005", name: "Pino TP-02 30mm",                                             categoryId: c["Pinos"],     costPrice: 0, sellPrice: 90000 },
    { sku: "PIN-006", name: "Pino TP-02 + 2 Porta Barras",                                categoryId: c["Pinos"],     costPrice: 0, sellPrice: 90000 },
    { sku: "PIN-007", name: "Pino TP-02 30mm con 3 Porta Barras",                         categoryId: c["Pinos"],     costPrice: 0, sellPrice: 100000 },
    { sku: "PIN-008", name: "Pino TP-03 30mm",                                             categoryId: c["Pinos"],     costPrice: 0, sellPrice: 220000 },
    { sku: "PIN-009", name: "Pino TP-03 50mm",                                             categoryId: c["Pinos"],     costPrice: 0, sellPrice: 220000 },
    { sku: "PIN-010", name: "Pino TP-03 30mm con Porta Barra + Ruedas",                   categoryId: c["Pinos"],     costPrice: 0, sellPrice: 250000 },
    { sku: "PIN-011", name: "Pino TP-04 50mm",                                             categoryId: c["Pinos"],     costPrice: 0, sellPrice: 150000 },
    { sku: "PIN-012", name: "Porta Barra 30mm",                                            categoryId: c["Pinos"],     costPrice: 0, sellPrice: 85000 },

    // MANCUERNAS
    { sku: "MAN-001", name: "Mancuernas Huecas 30mm",                                     categoryId: c["Mancuernas"], costPrice: 0, sellPrice: 75000 },
    { sku: "MAN-002", name: "Mancuernero",                                                 categoryId: c["Mancuernas"], costPrice: 0, sellPrice: 500000 },
    { sku: "MAN-003", name: "Mancuernero Completo + Set Hexagonales 2.5kg a 30kg",        categoryId: c["Mancuernas"], costPrice: 0, sellPrice: 3500000 },

    // TRÍCEPS
    { sku: "TRI-001", name: "Soga Tríceps Accesorio Para Poleas",                          categoryId: c["Tríceps"],   costPrice: 0, sellPrice: 37000 },

    // PISOS
    { sku: "PIS-001", name: "Placa Caucho Virgen Premium 1x1",                             categoryId: c["Pisos"],     costPrice: 0, sellPrice: 45000 },
  ];

  let created = 0;
  for (const p of products) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, sellPrice: p.sellPrice, categoryId: p.categoryId },
      create: { ...p, stock: 0, stockMinAlert: 2, active: true },
    });
    created++;
  }

  console.log(`✅ ${created} productos cargados de The Promise Machine`);
  console.log("⚠️  Los precios de costo están en $0 — completar en Productos con los costos reales.");
}

main().catch(console.error).finally(() => prisma.$disconnect());

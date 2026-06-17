/**
 * seed-demo.ts  — Crea datos de muestra para que el sistema se vea completo
 * Ejecutar: npx tsx src/seed-demo.ts
 */
import { PrismaClient, QuoteStatus } from "@prisma/client";

const prisma = new PrismaClient();

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  // ── Clientes de muestra ───────────────────────────────────────────────────
  const clientsData = [
    { name: "CrossFit Palermo", email: "compras@crossfitpalermo.com", phone: "11-4521-0011", address: "Av. Santa Fe 3400, CABA" },
    { name: "Gym Industrial Norte", email: "admin@gymnorte.com.ar", phone: "11-3320-8844", address: "Independencia 780, San Martín" },
    { name: "Studio Wellness BA", email: "info@studiowellness.com", phone: "11-5544-2200", address: "Libertador 2800, CABA" },
    { name: "Club Atlético Sur", email: "gerencia@atleticosur.com.ar", phone: "11-6677-1122" },
    { name: "Sport Center Quilmes", email: "ventas@sportquilmes.com", phone: "11-4253-7788" },
  ];

  const clients: { id: string }[] = [];
  for (const c of clientsData) {
    const existing = await prisma.client.findFirst({ where: { email: c.email } });
    if (!existing) {
      const client = await prisma.client.create({ data: c });
      clients.push(client);
    } else {
      clients.push(existing);
    }
  }

  console.log(`✓ ${clients.length} clientes`);

  // ── Productos activos ─────────────────────────────────────────────────────
  const products = await prisma.product.findMany({ where: { active: true } });
  if (products.length === 0) {
    console.error("No hay productos. Ejecutá el seed principal primero.");
    return;
  }

  // ── Ventas de los últimos 60 días ─────────────────────────────────────────
  const salesCount = await prisma.sale.count();
  if (salesCount > 0) {
    console.log("Ya hay ventas cargadas, saltando...");
  } else {
    let saleIndex = 1;
    const salesToCreate = [];

    for (let daysBack = 58; daysBack >= 0; daysBack -= rand(1, 4)) {
      const numSales = rand(1, 3);
      for (let s = 0; s < numSales; s++) {
        const numItems = rand(1, 3);
        const saleItems = [];
        let totalCost = 0;
        let totalRevenue = 0;

        const usedProducts = new Set<string>();
        for (let i = 0; i < numItems; i++) {
          let product = products[rand(0, products.length - 1)];
          let tries = 0;
          while (usedProducts.has(product.id) && tries < 10) {
            product = products[rand(0, products.length - 1)];
            tries++;
          }
          usedProducts.add(product.id);

          const qty = rand(1, 2);
          const unitCost = Number(product.costPrice);
          const unitPrice = Number(product.sellPrice) * (rand(90, 105) / 100); // variación de precio ±5%
          const subtotal = unitPrice * qty;
          const cost = unitCost * qty;
          const profit = subtotal - cost;

          totalRevenue += subtotal;
          totalCost += cost;

          saleItems.push({
            productId: product.id,
            quantity: qty,
            unitCost,
            unitPrice,
            subtotal,
            profit,
          });
        }

        const totalProfit = totalRevenue - totalCost;
        const saleNumber = `VTA-${String(saleIndex).padStart(5, "0")}`;
        saleIndex++;

        const createdAt = daysAgo(daysBack);
        createdAt.setHours(rand(9, 19), rand(0, 59), 0, 0);

        const clientIndex = rand(0, clients.length);
        const clientId = clientIndex < clients.length ? clients[clientIndex].id : null;

        salesToCreate.push({
          saleNumber,
          totalCost,
          totalRevenue,
          totalProfit,
          clientId,
          createdAt,
          items: saleItems,
        });
      }
    }

    // Create sales one by one (for items relation)
    for (const sale of salesToCreate) {
      const { items, ...saleData } = sale;
      await prisma.sale.create({
        data: {
          ...saleData,
          items: { create: items },
        },
      });

      // Update stock for each item
      for (const item of items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
        await prisma.stockMovement.create({
          data: {
            productId: item.productId,
            type: "SALE",
            quantity: -item.quantity,
            reason: `Venta ${saleData.saleNumber}`,
          },
        });
      }
    }

    console.log(`✓ ${salesToCreate.length} ventas generadas (últimos 60 días)`);
  }

  // ── Presupuestos de muestra ───────────────────────────────────────────────
  const quotesCount = await prisma.quote.count();
  if (quotesCount === 0) {
    const quoteStatuses: QuoteStatus[] = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "SENT"];
    for (let q = 0; q < 8; q++) {
      const client = clients[rand(0, clients.length - 1)];
      const numItems = rand(2, 4);
      const items = [];
      let total = 0;

      for (let i = 0; i < numItems; i++) {
        const product = products[rand(0, products.length - 1)];
        const qty = rand(1, 3);
        const unitPrice = Number(product.sellPrice);
        const subtotal = unitPrice * qty;
        total += subtotal;
        items.push({ productId: product.id, quantity: qty, unitPrice, subtotal });
      }

      await prisma.quote.create({
        data: {
          quoteNumber: `PRE-${String(q + 1).padStart(5, "0")}`,
          clientId: client.id,
          status: quoteStatuses[rand(0, quoteStatuses.length - 1)],
          totalAmount: total,
          validDays: 15,
          notes: q % 3 === 0 ? "Precio válido para pago al contado. Consultar disponibilidad." : undefined,
          createdAt: daysAgo(rand(0, 30)),
          items: { create: items },
        },
      });
    }
    console.log("✓ 8 presupuestos generados");
  } else {
    console.log("Ya hay presupuestos, saltando...");
  }

  // ── Ajuste de stock: reponer algunos productos ────────────────────────────
  const lowStock = await prisma.product.findMany({
    where: { active: true, stock: { lte: 2 } },
  });

  for (const p of lowStock) {
    const qty = rand(5, 15);
    await prisma.product.update({
      where: { id: p.id },
      data: { stock: { increment: qty } },
    });
    await prisma.stockMovement.create({
      data: {
        productId: p.id,
        type: "IN",
        quantity: qty,
        reason: "Reposición de stock — proveedor",
      },
    });
  }
  if (lowStock.length > 0) console.log(`✓ Stock repuesto en ${lowStock.length} productos`);

  console.log("\n✅ Demo seed completado. El sistema tiene datos reales para mostrar.");
}

main().catch(console.error).finally(() => prisma.$disconnect());

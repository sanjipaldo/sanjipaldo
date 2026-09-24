import { and, asc, gte, lte } from "drizzle-orm";
import { getDb } from "../_core/db";
import { salesDailySuppliers } from "../db/schema";

function monthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit"
    });
    month = formatter.format(now);
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, monthNumber, 0));
  const end = `${year}-${String(monthNumber).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { month: `${year}-${String(monthNumber).padStart(2, "0")}`, start, end };
}

export async function getSalesOverview(requestedMonth: string) {
  const db = getDb();
  const bounds = monthBounds(requestedMonth);
  const rows = await db.select().from(salesDailySuppliers)
    .where(and(
      gte(salesDailySuppliers.saleDate, bounds.start),
      lte(salesDailySuppliers.saleDate, bounds.end)
    ))
    .orderBy(asc(salesDailySuppliers.saleDate), asc(salesDailySuppliers.supplierName));

  const byDate = new Map<string, { revenue: number; cost: number; orderCount: number }>();
  const bySupplier = new Map<string, { revenue: number; cost: number; orderCount: number }>();
  for (const row of rows) {
    const day = byDate.get(row.saleDate) ?? { revenue: 0, cost: 0, orderCount: 0 };
    day.revenue += row.revenue;
    day.cost += row.cost;
    day.orderCount += row.orderCount;
    byDate.set(row.saleDate, day);
    const supplier = bySupplier.get(row.supplierName) ?? { revenue: 0, cost: 0, orderCount: 0 };
    supplier.revenue += row.revenue;
    supplier.cost += row.cost;
    supplier.orderCount += row.orderCount;
    bySupplier.set(row.supplierName, supplier);
  }

  const totals = rows.reduce((sum, row) => ({
    revenue: sum.revenue + row.revenue,
    cost: sum.cost + row.cost,
    orderCount: sum.orderCount + row.orderCount
  }), { revenue: 0, cost: 0, orderCount: 0 });
  const profit = totals.revenue - totals.cost;

  return {
    month: bounds.month,
    sourceConnected: rows.length > 0,
    sourceStatus: rows.length > 0
      ? "발주오라 주문 집계 데이터 수신"
      : "발주오라 주문·매출 데이터 연결 대기",
    updatedAt: rows.reduce<string | null>((latest, row) => {
      const value = row.sourceUpdatedAt ?? row.updatedAt;
      return !latest || value > latest ? value : latest;
    }, null),
    totals: {
      ...totals,
      profit,
      profitRate: totals.revenue > 0 ? Math.round((profit / totals.revenue) * 100) : 0
    },
    days: Array.from(byDate.entries()).map(([date, value]) => ({
      date,
      ...value,
      profit: value.revenue - value.cost
    })),
    suppliers: Array.from(bySupplier.entries()).map(([supplierName, value]) => ({
      supplierName,
      ...value,
      profit: value.revenue - value.cost
    })).sort((a, b) => b.revenue - a.revenue)
  };
}

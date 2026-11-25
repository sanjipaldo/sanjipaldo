// 입점 성공 → 공급사 등록·정산 방식 맞추기(2026-11-25 관리자 요청: 입점 신청 → 전화 상담으로 정산 방식 결정 → ID를 만들고 계약대로 세팅).
// 입점 성공(계약)으로 저장한 신청을 공급사 관리의 공급사로 등록하고(이름이 같은 공급사가 있으면 새로 만들지 않고 연결),
// 계약 형태대로 정산 방식을 저장합니다. 그다음 공급사 관리에서 공급사 센터 계정(ID)을 만듭니다.
// - 수수료 위탁 → 판매수수료(계약 수수료율, 비어 있으면 10%) · 일반 도소매 → 일반 도매(매입) · 기타 → 정산 방식은 그대로(공급사 관리에서 고름)
// - 신청서의 [업체 정보](대표자·사업자등록번호)·연락처·이메일은 공급사 칸이 비어 있을 때만 채웁니다(이미 적힌 값은 덮어쓰지 않음).
// - 어떤 신청이 어떤 공급사와 이어졌는지는 키-값 저장소(baljuora_sync_store "partner_supplier_links")에 남깁니다(마이그레이션 없음).
import { and, eq } from "drizzle-orm";
import { hometaxBuyerProblems } from "@repo/shared/baljuora-sales";
import { parsePartnerProfile, type PartnerDealHistory, type PartnerSupplierLink } from "@repo/shared/partner-deal";
import { DEFAULT_SETTLEMENT_SETTINGS, DEFAULT_SUPPLIER_COMMISSION_RATE, type SupplierSettlementCycle } from "@repo/shared/supplier-portal";
import { DatabaseError, getDb } from "../_core/db";
import { baljuoraSyncStore, partnerDeals, sourcingRequests, supplierAccounts, suppliers } from "../db/schema";
import { loadSettlementDirectory, saveSupplierSettlementSettings } from "./supplier-settlement";

export const PARTNER_SUPPLIER_LINKS_KEY = "partner_supplier_links";

type StoredLink = { supplierId: string; supplierName: string; linkedAt: string; linkedBy: string | null };

const FIELD_LABELS = { businessNumber: "사업자등록번호", representative: "대표자", phone: "연락처", email: "이메일" } as const;
type FilledField = keyof typeof FIELD_LABELS;

function fail(message: string, status = 400): never {
  throw new DatabaseError("DATABASE_QUERY_FAILED", message, status);
}

function isMissingTable(error: unknown, name: string) {
  const texts = [error instanceof Error ? error.message : String(error), (error as { cause?: { message?: string } })?.cause?.message ?? ""];
  return texts.some((text) => text.includes("no such table") && text.includes(name));
}

async function readLinks(): Promise<Record<string, StoredLink>> {
  try {
    const row = (await getDb().select({ value: baljuoraSyncStore.value }).from(baljuoraSyncStore).where(eq(baljuoraSyncStore.key, PARTNER_SUPPLIER_LINKS_KEY)).limit(1))[0];
    if (!row) return {};
    const parsed = JSON.parse(row.value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, StoredLink> : {};
  } catch (error) {
    if (isMissingTable(error, "baljuora_sync_store") || error instanceof SyntaxError) return {};
    throw error;
  }
}

async function writeLinks(links: Record<string, StoredLink>) {
  const value = JSON.stringify(links);
  const now = new Date().toISOString();
  await getDb().insert(baljuoraSyncStore).values({ key: PARTNER_SUPPLIER_LINKS_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: baljuoraSyncStore.key, set: { value, updatedAt: now } });
}

/** 입점 신청을 지우면 연결 기록도 지웁니다(공급사·정산·계정은 그대로). */
export async function forgetPartnerSupplierLink(requestId: string) {
  const links = await readLinks();
  if (!links[requestId]) return;
  delete links[requestId];
  await writeLinks(links);
}

async function accountRows() {
  try {
    return await getDb().select({ supplierId: supplierAccounts.supplierId, username: supplierAccounts.username }).from(supplierAccounts);
  } catch (error) {
    if (isMissingTable(error, "supplier_accounts")) return [];
    throw error;
  }
}

/** 입점 신청 → 공급사(이은 공급사, 없으면 이름이 같은 공급사). 공급사가 없으면 Map에 넣지 않습니다. */
export async function partnerSupplierLinksFor(requests: Array<{ id: string; companyName: string | null }>) {
  const result = new Map<string, PartnerSupplierLink>();
  if (requests.length === 0) return result;
  const [links, supplierRows, accounts, directory] = await Promise.all([
    readLinks(),
    getDb().select({ id: suppliers.id, name: suppliers.name, businessNumber: suppliers.businessNumber, representative: suppliers.representative, isActive: suppliers.isActive }).from(suppliers),
    accountRows(),
    loadSettlementDirectory()
  ]);
  const byId = new Map(supplierRows.map((row) => [row.id, row]));
  const byName = new Map(supplierRows.map((row) => [row.name.trim(), row]));
  const accountBySupplier = new Map(accounts.map((row) => [row.supplierId, row]));
  for (const request of requests) {
    const stored = links[request.id];
    const supplier = (stored ? byId.get(stored.supplierId) : undefined) ?? byName.get(request.companyName?.trim() ?? "");
    if (!supplier) continue;
    const linked = Boolean(stored && stored.supplierId === supplier.id);
    const settlement = directory.byId.get(supplier.id);
    const account = accountBySupplier.get(supplier.id);
    result.set(request.id, {
      supplierId: supplier.id,
      supplierName: supplier.name,
      linked,
      linkedAt: linked ? stored.linkedAt : null,
      isActive: supplier.isActive,
      hasAccount: Boolean(account),
      username: account?.username ?? null,
      settlement: settlement ? { type: settlement.type, commissionRate: settlement.commissionRate, cycle: settlement.cycle, explicit: settlement.explicit } : null,
      taxProblems: hometaxBuyerProblems({ businessNumber: supplier.businessNumber ?? "", companyName: supplier.name, ceoName: supplier.representative ?? "" })
    });
  }
  return result;
}

function parseHistory(value: string | null): PartnerDealHistory[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed as PartnerDealHistory[] : [];
  } catch {
    return [];
  }
}

function cleanName(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

/**
 * 입점 성공한 신청을 공급사로 등록(또는 연결)하고 계약대로 정산 방식을 맞춥니다. 여러 번 눌러도 안전합니다:
 * 이미 이은 공급사는 그대로 두고, 빈 칸만 채우고, 정산 방식을 지금 계약대로 다시 맞춥니다(계약을 바꾼 뒤 다시 누르면 됨).
 */
export async function registerPartnerSupplier(requestId: string, input: { name?: string | null; cycle?: SupplierSettlementCycle | null }, updatedBy: string | null) {
  const db = getDb();
  const request = (await db.select().from(sourcingRequests).where(and(eq(sourcingRequests.id, requestId), eq(sourcingRequests.requestType, "partner"))).limit(1))[0];
  if (!request) fail("입점 신청을 찾을 수 없습니다.", 404);
  const deal = (await db.select().from(partnerDeals).where(eq(partnerDeals.requestId, requestId)).limit(1))[0];
  if (!deal || deal.stage !== "contracted" || !deal.contractType) fail("진행 단계를 '입점 성공'으로 바꾸고 계약 형태까지 저장한 뒤 공급사로 등록해 주세요.");

  const links = await readLinks();
  const previousLink = links[requestId];
  // 1) 이미 이은 공급사 → 2) 이름이 같은 공급사 → 3) 새로 등록
  let supplier = previousLink ? (await db.select().from(suppliers).where(eq(suppliers.id, previousLink.supplierId)).limit(1))[0] : undefined;
  const name = supplier ? supplier.name : cleanName(input.name) || cleanName(request.companyName);
  if (!name) fail("매입처명(공급사 이름)을 입력해 주세요.");
  if (!supplier) supplier = (await db.select().from(suppliers).where(eq(suppliers.name, name)).limit(1))[0];

  const profile = parsePartnerProfile(request.details);
  const candidate: Record<FilledField, string | null> = {
    businessNumber: profile.businessNumber?.slice(0, 40) ?? null,
    representative: profile.representative?.slice(0, 80) ?? null,
    phone: request.contact?.trim().slice(0, 40) || null,
    email: request.email?.trim().slice(0, 160) || null
  };
  const memo = [`입점 신청(${request.createdAt.slice(0, 10)})에서 등록`, request.requesterName?.trim() ? `담당자 ${request.requesterName.trim()}` : null, profile.shipFrom ? `출고지 ${profile.shipFrom}` : null]
    .filter(Boolean).join(" · ").slice(0, 1000);
  const now = new Date().toISOString();
  const filled: string[] = [];
  let created = false;
  let reactivated = false;
  if (!supplier) {
    const rows = await db.insert(suppliers).values({ id: crypto.randomUUID(), name, ...candidate, address: null, memo, isActive: true, createdAt: now, updatedAt: now }).returning();
    supplier = rows[0];
    if (!supplier) fail("공급사를 등록하지 못했습니다.", 502);
    created = true;
    for (const key of Object.keys(FIELD_LABELS) as FilledField[]) if (candidate[key]) filled.push(FIELD_LABELS[key]);
  } else {
    const patch: Partial<typeof suppliers.$inferInsert> = {};
    for (const key of Object.keys(FIELD_LABELS) as FilledField[]) {
      if (candidate[key] && !supplier[key]?.trim()) {
        patch[key] = candidate[key];
        filled.push(FIELD_LABELS[key]);
      }
    }
    if (!supplier.memo?.trim()) patch.memo = memo;
    // 사용 중지된 공급사와 이으면 다시 사용 중으로(입점 성공한 업체)
    if (!supplier.isActive) {
      patch.isActive = true;
      reactivated = true;
    }
    if (Object.keys(patch).length > 0) {
      const rows = await db.update(suppliers).set({ ...patch, updatedAt: now }).where(eq(suppliers.id, supplier.id)).returning();
      supplier = rows[0] ?? supplier;
    }
  }

  // 정산 방식: 계약 형태대로(기타는 그대로). 지급 주기는 고른 값 → 이미 저장한 값 → 기본(주 정산)
  const current = (await loadSettlementDirectory()).byId.get(supplier.id);
  const cycle = input.cycle ?? (current?.explicit ? current.cycle : DEFAULT_SETTLEMENT_SETTINGS.cycle);
  let settlementApplied = false;
  if (deal.contractType === "commission") {
    await saveSupplierSettlementSettings(supplier.id, { type: "commission", commissionRate: deal.commissionRate ?? DEFAULT_SUPPLIER_COMMISSION_RATE, cycle }, updatedBy);
    settlementApplied = true;
  } else if (deal.contractType === "wholesale") {
    await saveSupplierSettlementSettings(supplier.id, { type: "wholesale", cycle }, updatedBy);
    settlementApplied = true;
  }

  links[requestId] = { supplierId: supplier.id, supplierName: supplier.name, linkedAt: previousLink?.supplierId === supplier.id ? previousLink.linkedAt : now, linkedBy: updatedBy ? updatedBy.slice(0, 120) : null };
  await writeLinks(links);
  // 처음 이을 때만 진행 기록에 남깁니다.
  if (previousLink?.supplierId !== supplier.id) {
    const history = parseHistory(deal.history);
    history.push({ at: now, stage: "contracted", contractType: deal.contractType, commissionRate: deal.commissionRate, memo: `${created ? "공급사로 등록" : "공급사와 연결"}: ${supplier.name}` });
    await db.update(partnerDeals).set({ history: JSON.stringify(history.slice(-100)), updatedAt: now }).where(eq(partnerDeals.requestId, requestId));
  }
  console.info(`[partner] ${requestId.slice(0, 8)} → supplier ${supplier.id.slice(0, 8)} (${created ? "created" : "linked"}, settlement ${settlementApplied ? deal.contractType : "unchanged"})`);
  return { created, reactivated, filled, settlementApplied, supplierId: supplier.id, supplierName: supplier.name };
}

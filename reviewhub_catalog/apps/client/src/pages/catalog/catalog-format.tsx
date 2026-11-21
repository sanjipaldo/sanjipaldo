// 공개 단가표·옵션 카드·옵션 팝업·신규상품·백과사전이 같이 쓰는 표시 도우미(가격 글자, 상품 이미지, 판매기간, 판매가, 배송비 요약).
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { seasonApplies } from "@repo/shared/supply-status";
import { RATE_TYPE_LABELS, effectiveRate, rateTierLines, representativeFee } from "@/lib/shipping-rates";
import type { Product, PublicShippingPolicy } from "./types";

export function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

// 수강생 단가(A단가): 비어 있거나 0이면 일반공급가와 같습니다.
export function effectiveAPrice(aPrice: number | null | undefined, generalPrice: number) {
  return typeof aPrice === "number" && aPrice > 0 ? aPrice : generalPrice;
}

export function seasonLabel(product: Product, categoryName?: string) {
  if (!seasonApplies(product, categoryName)) return "상시 판매";
  if (product.isAlwaysOnSale) return "상시 판매";
  if (!product.saleStartMonth || !product.saleEndMonth) return "판매기간 미설정";
  if (product.saleStartMonth === product.saleEndMonth) return `${product.saleStartMonth}월 판매`;
  return `${product.saleStartMonth}월 ~ ${product.saleEndMonth}월`;
}

export function salePriceLabel(mode: "autonomous" | "fixed", value: number | null) {
  if (mode === "autonomous") return { main: "자율", sub: "판매자 자율 판매가" };
  return {
    main: value === null ? "미설정" : formatPrice(value),
    sub: "지정 판매가"
  };
}

export function productImageSrc(product: Pick<Product, "id" | "imageUrl">) {
  if (product.imageUrl) return product.imageUrl;
  const known: Record<string, string> = {
    "muskmelon-gift": "/assets/products/muskmelon-gift.webp",
    "premium-rice-cake": "/assets/products/rice-cake-gift.webp",
    "ramie-songpyeon": "/assets/products/songpyeon.webp",
    "gold-mango": "/assets/products/gold-mango.webp",
    "naju-pear": "/assets/products/naju-pear.webp",
    "shine-muscat": "/assets/products/shine-muscat.webp",
    "hami-melon": "/assets/products/hami-melon.webp",
    "global-supplement": "/assets/products/health-supplement.webp"
  };
  return known[product.id] || "";
}

// src를 주면(옵션 묶음 대표 이미지 등) 그 이미지를 먼저 씁니다.
export function ProductThumb({ product, src: preferredSrc, className = "product-thumb", size = 112, alt }: { product: Product; src?: string | null; className?: string; size?: number; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const src = preferredSrc || productImageSrc(product);
  const slot = product.id === "muskmelon-gift" ? "product.muskmelon-gift.card"
    : product.id === "premium-rice-cake" ? "product.rice-cake-gift.card"
    : product.id === "ramie-songpyeon" ? "product.songpyeon.card"
    : product.id === "gold-mango" ? "product.gold-mango.card"
    : product.id === "naju-pear" ? "product.naju-pear.card"
    : product.id === "shine-muscat" ? "product.shine-muscat.card"
    : product.id === "hami-melon" ? "product.hami-melon.card"
    : product.id === "global-supplement" ? "product.health-supplement.card" : undefined;
  if (!src || failed) {
    return <div className={`${className} product-thumb-empty`}><ImageOff size={26} /><span>이미지 준비중</span></div>;
  }
  return <img data-image-slot={slot} className={className} src={src} alt={alt ?? product.name} width={size} height={size} loading="lazy" onError={() => setFailed(true)} />;
}

export type ShippingSummary = { kind: "free" | "paid" | "unknown"; text: string };

export function shippingFeeSummary(_product: Product, policy?: PublicShippingPolicy): ShippingSummary {
  if (!policy) return { kind: "unknown", text: "확인" };
  const rate = effectiveRate(policy);
  const fee = representativeFee(policy);
  const lastFee = rate.tiers?.last.repeat ? fee : rate.tiers?.last.fee ?? 0;
  if (rate.rateType === "free" || (fee === 0 && lastFee === 0)) return { kind: "free", text: "무료" };
  // 구간형은 첫 구간(가장 적게 주문할 때) 배송비를 대표 금액으로 보여 주고, 자세한 구간은 팝업에서 안내합니다.
  return { kind: "paid", text: fee > 0 ? `유료 (${formatPrice(fee)})` : "유료" };
}

// 배송비 안내 줄(배송비 ? 팝업·옵션 팝업 배송 안내): 유형, 배송비(구간), 제주·도서산간 추가, 반품·교환, 택배사
export function shippingInfoRows(product: Product, policy?: PublicShippingPolicy): Array<[string, string]> {
  const extra = (value: number) => value > 0 ? `+${formatPrice(value)}` : "추가 없음";
  const rows: Array<[string, string]> = [];
  if (policy) {
    const rate = effectiveRate(policy);
    rows.push(["배송비 유형", RATE_TYPE_LABELS[rate.rateType]]);
    if (rate.rateType === "free") {
      rows.push(["배송비", policy.freeWholeOrder ? "무료배송 (이 상품이 포함된 주문은 배송비 전체 무료)" : "무료배송"]);
    } else if (rate.rateType === "fixed" || !rate.tiers) {
      rows.push(["배송비", `${formatPrice(rate.fee)} (주문 금액에 관계없이)`]);
    } else {
      // 금액별·수량별·단위별: 구간마다 한 줄씩
      rows.push([rate.rateType === "amount" ? "주문 금액별 배송비" : rate.rateType === "quantity" ? "주문 수량별 배송비" : "단위별 배송비", rateTierLines(rate.rateType, rate.tiers, rate.unitLabel).join("\n")]);
    }
    rows.push(["제주 추가배송비", extra(policy.jejuExtraFee)]);
    rows.push(["도서산간 추가배송비", extra(policy.islandExtraFee)]);
    if (policy.returnFee != null) rows.push(["반품 배송비(편도)", formatPrice(policy.returnFee)]);
    if (policy.exchangeFee != null) rows.push(["교환 배송비(왕복)", formatPrice(policy.exchangeFee)]);
    rows.push(["택배사", policy.courier || product.courier || "택배사 지정"]);
  } else {
    rows.push(["배송비", product.shippingFee || "상품별로 달라 문의가 필요합니다"]);
    rows.push(["택배사", product.courier || "택배사 지정"]);
  }
  return rows;
}

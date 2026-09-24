INSERT OR IGNORE INTO price_histories (
  id, productId, productName, optionId, optionName, field,
  oldPrice, newPrice, changedBy, changedAt
) VALUES
  (
    'sample-price-20260914-01',
    'muskmelon-gift',
    '머스크메론세트 5kg',
    'option-muskmelon-2',
    '2수 · 총 5kg 내외',
    'generalPrice',
    31000,
    29700,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-12 minutes')
  ),
  (
    'sample-price-20260914-02',
    'gold-mango',
    '베트남 골드망고',
    'option-mango-3',
    '3kg · 6~10입',
    'aPrice',
    21500,
    22450,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-24 minutes')
  ),
  (
    'sample-price-20260914-03',
    'shine-muscat',
    '샤인머스캣',
    'option-shine-2',
    '2kg · 4~5수',
    'generalPrice',
    11500,
    11000,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-38 minutes')
  ),
  (
    'sample-price-20260914-04',
    'hami-melon',
    '하미과 메론 가정용',
    'option-hami-4',
    '1.5kg 내외 × 4통',
    'aPrice',
    32500,
    31500,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-51 minutes')
  ),
  (
    'sample-price-20260914-05',
    'global-supplement',
    '캐네디언 프리미엄 헬스케어',
    'option-health-1',
    '60캡슐 · 1병',
    'generalPrice',
    25900,
    26900,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-67 minutes')
  ),
  (
    'sample-price-20260914-06',
    'gold-mango',
    '베트남 골드망고',
    'option-mango-10',
    '10kg · 20~32입',
    'generalPrice',
    75900,
    74500,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-83 minutes')
  ),
  (
    'sample-price-20260914-07',
    'naju-pear',
    '[선물포장] 나주 배 특품 5kg',
    NULL,
    NULL,
    'aPrice',
    30500,
    31500,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-104 minutes')
  ),
  (
    'sample-price-20260914-08',
    'premium-rice-cake',
    '프리미엄 떡 선물세트',
    NULL,
    NULL,
    'generalPrice',
    15500,
    15000,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-126 minutes')
  ),
  (
    'sample-price-20260914-09',
    'ramie-songpyeon',
    '영광 국내산 모싯잎 송편 1kg',
    NULL,
    NULL,
    'aPrice',
    6900,
    7200,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-148 minutes')
  ),
  (
    'sample-price-20260914-10',
    'global-supplement',
    '캐네디언 프리미엄 헬스케어',
    'option-health-2',
    '60캡슐 · 2병',
    'aPrice',
    46500,
    45500,
    'admin',
    datetime(CURRENT_TIMESTAMP, '-171 minutes')
  );

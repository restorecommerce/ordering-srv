
export const COUNTRY_CODES_EU = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES',
  'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU',
  'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'
];
export const COUNTRY_CODES_ALL = [
  'AD', 'AE', 'AF', 'AG', 'AL', 'AM', 'AO', 'AR', 'AT',
  'AU', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH',
  'BI', 'BJ', 'BN', 'BO', 'BR', 'BS', 'BT', 'BW', 'BY',
  'BZ', 'CA', 'CD', 'CF', 'CG', 'CH', 'CI', 'CL', 'CM',
  'CN', 'CO', 'CR', 'CU', 'CV', 'CY', 'CZ', 'DE', 'DJ',
  'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'ER', 'ES',
  'ET', 'FI', 'FJ', 'FM', 'FR', 'GA', 'GB', 'GD', 'GE',
  'GH', 'GM', 'GN', 'GQ', 'GR', 'GT', 'GW', 'GY', 'HN',
  'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IN', 'IQ', 'IR',
  'IS', 'IT', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI',
  'KM', 'KN', 'KP', 'KR', 'KW', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA',
  'MC', 'MD', 'ME', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN',
  'MR', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NE', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NZ', 'OM',
  'PA', 'PE', 'PG', 'PH', 'PK', 'PL', 'PT', 'PW', 'PY',
  'QA', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD',
  'SE', 'SG', 'SI', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR',
  'SS', 'ST', 'SV', 'SY', 'SZ', 'TA', 'TD', 'TG', 'TH',
  'TJ', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
  'TZ', 'UA', 'UG', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE',
  'VN', 'VU', 'WS', 'YE', 'ZA', 'ZM', 'ZW'
];
export const COUNTRY_CODES_NON_EU = COUNTRY_CODES_ALL.filter(
  c => !COUNTRY_CODES_EU.includes(c)
);
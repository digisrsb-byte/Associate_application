export type ImportDomain = 'it' | 'gst';

export type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  sensitive?: boolean;
  aliases: string[];
};

export const IT_FIELDS: FieldDef[] = [
  {
    key: 'pan',
    label: 'PAN / Client ID',
    required: true,
    aliases: ['pan', 'client id', 'client id (pan)', 'clientid'],
  },
  {
    key: 'name',
    label: 'Name',
    required: true,
    aliases: ['name', 'client name', 'client name (latest)'],
  },
  {
    key: 'assessmentYear',
    label: 'Assessment Year',
    required: true,
    aliases: ['assessment year', 'ay', 'year'],
  },
  {
    key: 'phone',
    label: 'Mobile / Phone',
    required: false,
    aliases: ['mobile', 'mobile (primary)', 'phone', 'primary mobile'],
  },
  {
    key: 'otherMobiles',
    label: 'Other Mobile(s)',
    required: false,
    aliases: ['other mobile', 'other mobile(s)', 'other mobiles'],
  },
  {
    key: 'nameVariants',
    label: 'Name Variants',
    required: false,
    aliases: ['name variants', 'name variants (if differ)'],
  },
  {
    key: 'filingDate',
    label: 'Filing Date',
    required: false,
    aliases: ['filing date', 'date of filing', 'filed on'],
  },
  {
    key: 'fees',
    label: 'Fees / Amount Billed',
    required: false,
    aliases: ['amount billed', 'fees', 'fee', 'billed'],
  },
  {
    key: 'received',
    label: 'Received',
    required: false,
    aliases: ['received', 'amount received', 'recd'],
  },
  {
    key: 'outstanding',
    label: 'Outstanding / Balance',
    required: false,
    aliases: ['outstanding', 'balance', 'due'],
  },
  {
    key: 'paymentType',
    label: 'Payment Mode',
    required: false,
    aliases: ['payment mode', 'payment type', 'mode'],
  },
  {
    key: 'paymentReceiveDate',
    label: 'Payment Date',
    required: false,
    aliases: ['payment date', 'payment receive date', 'received date'],
  },
];

export const GST_FIELDS: FieldDef[] = [
  {
    key: 'userId',
    label: 'User ID / Portal ID',
    required: true,
    aliases: ['user id', 'userid', 'portal user id', 'gstin', 'login id'],
  },
  {
    key: 'companyName',
    label: 'Company Name',
    required: true,
    aliases: ['company name', 'name', 'trade name'],
  },
  {
    key: 'month',
    label: 'GST Month / Period',
    required: true,
    aliases: ['month', 'gst month', 'period', 'return period'],
  },
  {
    key: 'phone',
    label: 'Phone',
    required: false,
    aliases: ['phone', 'mobile'],
  },
  {
    key: 'referenceNumber',
    label: 'Reference No',
    required: false,
    aliases: ['ref no', 'reference no', 'reference number'],
  },
  {
    key: 'remark',
    label: 'Remark',
    required: false,
    aliases: ['remark', 'remarks', 'notes'],
  },
  {
    key: 'password',
    label: 'Portal Password',
    required: false,
    sensitive: true,
    aliases: ['password', 'portal password'],
  },
  {
    key: 'fees',
    label: 'Fees',
    required: false,
    aliases: ['fees', 'fee', 'amount billed', 'professional fee'],
  },
  {
    key: 'interest',
    label: 'Interest',
    required: false,
    aliases: ['interest'],
  },
  {
    key: 'tax',
    label: 'Tax',
    required: false,
    aliases: ['tax'],
  },
  {
    key: 'total',
    label: 'Total',
    required: false,
    aliases: ['total'],
  },
  {
    key: 'totalReceived',
    label: 'Total Received',
    required: false,
    aliases: [
      'total recd',
      'total received',
      'company total recd',
      'received',
    ],
  },
  {
    key: 'gstin',
    label: 'GSTIN (optional)',
    required: false,
    aliases: ['gstin', 'gstin / uin'],
  },
];

export function fieldsForDomain(domain: ImportDomain): FieldDef[] {
  return domain === 'it' ? IT_FIELDS : GST_FIELDS;
}

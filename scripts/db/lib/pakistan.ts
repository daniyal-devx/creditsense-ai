/**
 * Pakistan-specific reference data for the synthetic population.
 *
 * The point of this file is plausibility. A demo where a Lahore shopkeeper
 * pays a Karachi water utility, or where every CNIC starts with the same five
 * digits, is one a lender in the room will spot immediately — and once they
 * distrust the data they stop listening to the model.
 */

export interface CityInfo {
  name: string
  province: string
  /** First five digits of the CNIC are the applicant's home locality code. */
  cnicPrefixes: string[]
  /** Relative share of the population we generate. */
  weight: number
  /** Electricity distribution company serving the area. */
  electricityBiller: string
  /** Gas utility. Sui Northern in the north, Sui Southern in the south. */
  gasBiller: string
  waterBiller: string | null
}

export const CITIES: CityInfo[] = [
  {
    name: 'Karachi',
    province: 'Sindh',
    cnicPrefixes: ['42101', '42201', '42301', '42401', '42501'],
    weight: 26,
    electricityBiller: 'K-Electric',
    gasBiller: 'Sui Southern Gas Company',
    waterBiller: 'Karachi Water & Sewerage Board',
  },
  {
    name: 'Lahore',
    province: 'Punjab',
    cnicPrefixes: ['35201', '35202'],
    weight: 22,
    electricityBiller: 'LESCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: 'WASA Lahore',
  },
  {
    name: 'Faisalabad',
    province: 'Punjab',
    cnicPrefixes: ['33100', '33101'],
    weight: 9,
    electricityBiller: 'FESCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: 'WASA Faisalabad',
  },
  {
    name: 'Rawalpindi',
    province: 'Punjab',
    cnicPrefixes: ['37405', '37406'],
    weight: 8,
    electricityBiller: 'IESCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: 'WASA Rawalpindi',
  },
  {
    name: 'Islamabad',
    province: 'Islamabad Capital Territory',
    cnicPrefixes: ['61101'],
    weight: 7,
    electricityBiller: 'IESCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: 'CDA Water',
  },
  {
    name: 'Multan',
    province: 'Punjab',
    cnicPrefixes: ['36302', '36303'],
    weight: 6,
    electricityBiller: 'MEPCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: 'WASA Multan',
  },
  {
    name: 'Peshawar',
    province: 'Khyber Pakhtunkhwa',
    cnicPrefixes: ['17301'],
    weight: 6,
    electricityBiller: 'PESCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: 'WSSP Peshawar',
  },
  {
    name: 'Gujranwala',
    province: 'Punjab',
    cnicPrefixes: ['34101'],
    weight: 5,
    electricityBiller: 'GEPCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: null,
  },
  {
    name: 'Hyderabad',
    province: 'Sindh',
    cnicPrefixes: ['41303'],
    weight: 4,
    electricityBiller: 'HESCO',
    gasBiller: 'Sui Southern Gas Company',
    waterBiller: 'WASA Hyderabad',
  },
  {
    name: 'Quetta',
    province: 'Balochistan',
    cnicPrefixes: ['54400'],
    weight: 4,
    electricityBiller: 'QESCO',
    gasBiller: 'Sui Southern Gas Company',
    waterBiller: null,
  },
  {
    name: 'Sialkot',
    province: 'Punjab',
    cnicPrefixes: ['34603'],
    weight: 3,
    electricityBiller: 'GEPCO',
    gasBiller: 'Sui Northern Gas Pipelines',
    waterBiller: null,
  },
]

export const MALE_FIRST_NAMES = [
  'Ahmed', 'Ali', 'Bilal', 'Danish', 'Faisal', 'Farhan', 'Hamza', 'Haris', 'Hassan', 'Imran',
  'Junaid', 'Kamran', 'Khalid', 'Nadeem', 'Naveed', 'Noman', 'Omar', 'Rizwan', 'Saad', 'Salman',
  'Shahzad', 'Sohail', 'Tariq', 'Usman', 'Waqar', 'Yasir', 'Zain', 'Zeeshan', 'Adnan', 'Asad',
  'Fahad', 'Ibrahim', 'Mudassir', 'Talha', 'Waleed',
]

export const FEMALE_FIRST_NAMES = [
  'Aisha', 'Amna', 'Ayesha', 'Fatima', 'Hina', 'Iqra', 'Javeria', 'Kiran', 'Maria', 'Mehwish',
  'Nadia', 'Nimra', 'Rabia', 'Rimsha', 'Saba', 'Sadia', 'Sana', 'Sidra', 'Sumaira', 'Zainab',
  'Areeba', 'Bushra', 'Hafsa', 'Komal', 'Laiba', 'Mahnoor', 'Noor', 'Sehrish', 'Tehreem', 'Warda',
]

export const LAST_NAMES = [
  'Khan', 'Ahmed', 'Ali', 'Hussain', 'Malik', 'Raza', 'Sheikh', 'Chaudhry', 'Butt', 'Qureshi',
  'Siddiqui', 'Abbasi', 'Farooq', 'Iqbal', 'Javed', 'Mahmood', 'Nawaz', 'Rashid', 'Saeed', 'Shah',
  'Tariq', 'Zafar', 'Bhatti', 'Dar', 'Gill', 'Jatoi', 'Memon', 'Niazi', 'Rana', 'Sattar',
]

export const MOBILE_NETWORKS = [
  { id: 'jazz', name: 'Jazz', prefixes: ['0300', '0301', '0302', '0303', '0304', '0305', '0306', '0307'] },
  { id: 'telenor', name: 'Telenor', prefixes: ['0340', '0341', '0342', '0343', '0344', '0345', '0346'] },
  { id: 'zong', name: 'Zong', prefixes: ['0310', '0311', '0312', '0313', '0314', '0315'] },
  { id: 'ufone', name: 'Ufone', prefixes: ['0330', '0331', '0332', '0333', '0334', '0335'] },
] as const

export type NetworkId = (typeof MOBILE_NETWORKS)[number]['id']

export const INTERNET_PROVIDERS = [
  'PTCL Broadband',
  'StormFiber',
  'Nayatel',
  'Transworld Home',
  'Optix Fiber',
  'Wateen',
]

export const EDUCATION_LEVELS = [
  'No formal education',
  'Primary',
  'Middle',
  'Matric',
  'Intermediate',
  'Bachelors',
  'Masters',
]

/** Counterparties a wallet user actually transacts with. */
export const MERCHANTS = [
  'Imtiaz Super Market', 'Al-Fatah Store', 'Metro Cash & Carry', 'Chase Up',
  'Foodpanda', 'Careem', 'Daraz.pk', 'Bykea', 'Cheetay',
  'Naheed.pk', 'Sapphire', 'Khaadi', 'Gul Ahmed', 'Servis Shoes',
  'Shell Pakistan', 'PSO Filling Station', 'Total Parco',
  'Dr. Essa Laboratory', 'Chughtai Lab', 'Agha Khan Pharmacy',
]

export const FREELANCE_CLIENTS = [
  'Payoneer Payout', 'Upwork Escrow', 'Fiverr Revenue Card', 'Wise Transfer',
  'Deel Payroll', 'Remote Client — Dubai', 'Remote Client — London',
  'Remote Client — Toronto', 'Direct Client Invoice',
]

export const SUPPLIERS = [
  'Wholesale Market Karachi', 'Akbari Mandi Supplier', 'Shah Alam Market',
  'Bolton Market Supplier', 'Hall Road Distributor', 'Rainbow Centre Trader',
]

/**
 * Build a valid-format CNIC: 5-digit locality, 7-digit serial, 1 check digit
 * whose parity encodes gender (odd = male, even = female), as issued by NADRA.
 */
export function makeCnic(prefix: string, serial: number, gender: 'male' | 'female' | 'other'): string {
  const body = String(serial).padStart(7, '0').slice(-7)
  // Parity is the real-world convention; "other" is not represented in the
  // national scheme, so those are generated with an odd digit.
  const isEven = gender === 'female'
  const base = serial % 9
  let check = base
  if (isEven && check % 2 !== 0) check = (check + 1) % 10
  if (!isEven && check % 2 === 0) check = (check + 1) % 10
  return `${prefix}${body}${check}`
}

/** Format `03001234567` from a network prefix. */
export function makePhone(prefix: string, serial: number): string {
  return `${prefix}${String(serial).padStart(7, '0').slice(-7)}`
}

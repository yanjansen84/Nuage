const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
const TEENS = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function belowThousand(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const r = n % 100
  const parts: string[] = []
  if (c > 0) parts.push(HUNDREDS[c])
  if (r >= 10 && r <= 19) parts.push(TEENS[r - 10])
  else {
    const t = Math.floor(r / 10)
    const u = r % 10
    if (t > 0) parts.push(TENS[t])
    if (u > 0) parts.push(UNITS[u])
  }
  return parts.join(' e ')
}

function integerWords(n: number): string {
  if (n === 0) return 'zero'
  const scales: [number, string, string][] = [
    [1_000_000_000, 'bilhão', 'bilhões'],
    [1_000_000, 'milhão', 'milhões'],
    [1_000, 'mil', 'mil'],
    [1, '', ''],
  ]
  const parts: string[] = []
  let rem = n
  for (const [div, sing, plur] of scales) {
    const q = Math.floor(rem / div)
    rem %= div
    if (!q) continue
    if (div === 1000 && q === 1) parts.push('mil')
    else {
      const label = q === 1 ? sing : plur
      parts.push(label ? `${belowThousand(q)} ${label}` : belowThousand(q))
    }
  }
  if (parts.length === 1) return parts[0]
  const last = parts.pop()!
  const needsE = !last.includes(' e ') && (Number.isInteger(n % 1000) && (n % 1000 < 100 || (n % 100 === 0)))
  return `${parts.join(', ')}${needsE ? ' e ' : ', '}${last}`
}

/**
 * Converte um valor numérico em reais por extenso (ex.: 900 -> "novecentos reais").
 */
export function valorPorExtenso(value: number): string {
  const rounded = Math.round(Math.max(0, value) * 100)
  const reais = Math.floor(rounded / 100)
  const cents = rounded % 100
  const out: string[] = []
  if (reais > 0) out.push(`${integerWords(reais)} ${reais === 1 ? 'real' : 'reais'}`)
  if (cents > 0) out.push(`${integerWords(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`)
  return out.length ? out.join(' e ') : 'zero reais'
}

/**
 * Converte um número inteiro pequeno em texto com numeral + extenso (ex.: 30 -> "30 (trinta)").
 */
export function numeroComExtenso(n: number): string {
  return `${n} (${integerWords(Math.max(0, Math.round(n)))})`
}

/**
 * Utilitários de formatação e máscaras para inputs do sistema Na.Nu
 */

/**
 * Máscara de Telefone / WhatsApp brasileiro:
 * - Fixo (10 dígitos): (99) 9999-9999
 * - Celular (11 dígitos): (99) 99999-9999
 * Bloqueia inserções além de 11 dígitos.
 */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return ''
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Remove caracteres não numéricos.
 */
export function unmaskDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

/**
 * Máscara para moeda brasileira (BRL).
 * Aceita números ou string digitada (formato centavos deslocados conforme digita).
 * Exemplo:
 *  - 1500 -> "1.500,00"
 *  - "150000" -> "1.500,00"
 */
export function maskMoney(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const num = Number(digits) / 100
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Converte string formatada de moeda para número puro (ex: "1.500,00" -> 1500).
 */
export function parseMoney(value: string | null | undefined): number | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (!digits) return null
  return Number(digits) / 100
}

/**
 * Formata e-mail: sem espaços, minúsculas automáticas.
 */
export function maskEmail(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toLowerCase()
}

/**
 * Formata arroba para redes sociais (@usuario).
 */
export function maskSocial(value: string | null | undefined): string {
  if (!value) return ''
  const clean = value.replace(/^@+/, '').replace(/\s+/g, '')
  return clean ? `@${clean}` : ''
}

/**
 * Limita dia do mês entre 1 e 31.
 */
export function maskDay(value: string | null | undefined): string {
  if (!value) return ''
  const d = value.replace(/\D/g, '').slice(0, 2)
  if (!d) return ''
  const n = Number(d)
  if (n > 31) return '31'
  if (n === 0 && d.length === 2) return '1'
  return d
}

/**
 * Limita número inteiro positivo (ex: meses, dias, parcelas).
 */
export function maskInteger(value: string | null | undefined, max?: number): string {
  if (!value) return ''
  const d = value.replace(/\D/g, '')
  if (!d) return ''
  if (max !== undefined && Number(d) > max) return String(max)
  return d
}

/**
 * Formata número decimal positivo (ex: horas com 0.5).
 */
export function maskDecimal(value: string | null | undefined): string {
  if (!value) return ''
  const clean = value.replace(/[^0-9.,]/g, '').replace(',', '.')
  const parts = clean.split('.')
  if (parts.length > 2) return `${parts[0]}.${parts.slice(1).join('')}`
  return clean
}

/**
 * Máscara dinâmica de CPF (11 dígitos) ou CNPJ (14 dígitos).
 */
export function maskDocument(value: string | null | undefined): string {
  if (!value) return ''
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (!d) return ''
  if (d.length <= 11) {
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/**
 * Máscara de CPF (11 dígitos): 000.000.000-00.
 */
export function maskCpf(value: string | null | undefined): string {
  if (!value) return ''
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (!d) return ''
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

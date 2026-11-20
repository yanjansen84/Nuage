// Geração de PDFs (contrato e extrato financeiro) direto no navegador.
// jsPDF é carregado só quando o usuário pede um PDF, para não pesar o sistema.
import type { jsPDF as JsPDF } from 'jspdf'
import logoUrl from '../assets/logo-nanu.png'

const ORANGE: [number, number, number] = [234, 92, 42]   // #ea5c2a
const SUN: [number, number, number] = [255, 209, 102]    // #ffd166
const INK: [number, number, number] = [30, 30, 30]
const MUTED: [number, number, number] = [107, 107, 112]
const LINE: [number, number, number] = [230, 227, 234]
const M = 18 // margem (mm)

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

async function loadLibs() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable }
}

/** Carrega a imagem já reduzida para a largura usada no PDF (mantém o arquivo leve). */
function toDataUrl(url: string, width = 480) {
  return new Promise<string>((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = width
      c.height = Math.round(width * (img.naturalHeight / img.naturalWidth))
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      res(c.toDataURL('image/png'))
    }
    img.onerror = rej
    img.src = url
  })
}

/** Cabeçalho com logo, faixa xadrez da marca e título. Retorna o Y onde o conteúdo começa. */
async function header(doc: JsPDF, title: string, subtitle?: string) {
  const W = doc.internal.pageSize.getWidth()
  // faixa xadrez laranja/amarela no topo (assinatura visual da Na.Nu)
  doc.setFillColor(...INK); doc.rect(0, 0, W, 4, 'F')
  for (let x = 0, i = 0; x < W; x += 4, i++) {
    doc.setFillColor(...(i % 2 ? SUN : ORANGE))
    doc.triangle(x, 4, x + 4, 4, x + 2, 1.2, 'F')
  }
  try {
    const logo = await toDataUrl(logoUrl)
    doc.addImage(logo, 'PNG', M, 12, 38, 38 * (309 / 1200))
  } catch { doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('Na.Nu', M, 20) }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, W - M, 16, { align: 'right' })
  doc.text('Nuage', W - M, 21, { align: 'right' })

  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(17)
  doc.text(title, M, 36)
  let y = 36
  if (subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED); y += 6; doc.text(subtitle, M, y) }
  doc.setDrawColor(...ORANGE); doc.setLineWidth(0.8); doc.line(M, y + 4, M + 24, y + 4)
  return y + 12
}

function footer(doc: JsPDF, label: string) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, H - 14, W - M, H - 14)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(`${label} · gerado pelo Na.Nu`, M, H - 9)
    doc.text(`Página ${i} de ${n}`, W - M, H - 9, { align: 'right' })
  }
}

function section(doc: JsPDF, title: string, y: number) {
  y = ensure(doc, y, 18)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...INK)
  doc.setFillColor(...ORANGE); doc.rect(M, y - 3.6, 1.4, 4.6, 'F')
  doc.text(title, M + 4, y)
  return y + 5
}

function ensure(doc: JsPDF, y: number, need: number) {
  const H = doc.internal.pageSize.getHeight()
  if (y + need > H - 22) { doc.addPage(); return 22 }
  return y
}

/** Pares rótulo: valor em duas colunas. */
function keyValues(doc: JsPDF, pairs: [string, string][], y: number) {
  const W = doc.internal.pageSize.getWidth()
  const colW = (W - M * 2) / 2
  doc.setFontSize(9.5)
  pairs.forEach(([k, v], i) => {
    const col = i % 2, x = M + col * colW
    if (col === 0 && i > 0) y += 11
    y = ensure(doc, y, 11)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); doc.text(k, x, y)
    doc.setTextColor(...INK); doc.text(doc.splitTextToSize(v || '—', colW - 4)[0], x, y + 4.6)
  })
  return y + 14
}

function paragraph(doc: JsPDF, text: string, y: number) {
  const W = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK)
  for (const line of doc.splitTextToSize(text, W - M * 2) as string[]) {
    y = ensure(doc, y, 5)
    doc.text(line, M, y); y += 4.6
  }
  return y + 3
}

const safeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()

// ======================================================================
// Contrato
// ======================================================================
export interface ContractPdfData {
  client: { name: string; contact_name?: string | null; email?: string | null; phone?: string | null; segment?: string | null }
  status: string
  items: { service: string; option: string | null; quantity: number; billing: string; listPrice: number | null; price: number; deliverables: string[]; deliveryNote?: string | null }[]
  monthly: number
  oneTime: number
  terms: {
    start: string | null; minMonths: number | null; minEnd: string | null; renewal: string; noticeDays: number | null
    dueDay: number | null; paymentMethod: string | null; installments: number | null; paymentTerms: string | null; notes: string | null
  }
}

export async function contractPdf(d: ContractPdfData) {
  const { jsPDF, autoTable } = await loadLibs()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = doc.internal.pageSize.getWidth()
  let y = await header(doc, 'Contrato de prestação de serviços', `Termos comerciais · ${d.client.name}${d.status !== 'Ativo' ? ` · ${d.status}` : ''}`)

  y = section(doc, 'Contratante', y + 2)
  y = keyValues(doc, [
    ['Cliente', d.client.name], ['Segmento', d.client.segment ?? '—'],
    ['Responsável', d.client.contact_name ?? '—'], ['Contato', [d.client.email, d.client.phone].filter(Boolean).join(' · ') || '—'],
  ], y + 3)

  y = section(doc, 'Contratada', y)
  y = keyValues(doc, [['Empresa', 'Nuage'], ['Sistema', 'Na.Nu']], y + 3)

  y = section(doc, 'Serviços contratados', y)
  autoTable(doc, {
    startY: y + 1, margin: { left: M, right: M },
    head: [['Serviço', 'Opção', 'Qtd.', 'Cobrança', 'Valor unitário', 'Total']],
    body: d.items.map((i) => [i.service, i.option ?? '—', String(i.quantity), i.billing, brl(i.price), brl(i.price * i.quantity) + (i.billing === 'Mensal' ? '/mês' : '')]),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.6, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 250, 255] },
    columnStyles: { 2: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // totais
  y = ensure(doc, y, 20)
  doc.setFillColor(253, 236, 229); doc.roundedRect(W - M - 80, y - 4, 80, 18, 2, 2, 'F')
  doc.setFontSize(9.5); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal')
  doc.text('Total mensal', W - M - 76, y + 2); doc.text('Pacotes e avulsos', W - M - 76, y + 9)
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold')
  doc.text(brl(d.monthly), W - M - 4, y + 2, { align: 'right' }); doc.text(brl(d.oneTime), W - M - 4, y + 9, { align: 'right' })
  y += 22

  const withScope = d.items.filter((i) => i.deliverables.length)
  if (withScope.length) {
    y = section(doc, 'Escopo dos serviços', y)
    for (const i of withScope) {
      y = ensure(doc, y + 2, 10)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...INK)
      doc.text(i.service + (i.deliveryNote ? ` · prazo de entrega: ${i.deliveryNote.toLowerCase()}` : ''), M, y + 3)
      y += 8
      doc.setFont('helvetica', 'normal')
      for (const del of i.deliverables) {
        for (const [k, line] of (doc.splitTextToSize(del, W - M * 2 - 6) as string[]).entries()) {
          y = ensure(doc, y, 5)
          if (k === 0) { doc.setFillColor(...ORANGE); doc.circle(M + 1.4, y - 1.2, 0.7, 'F') }
          doc.text(line, M + 5, y); y += 4.6
        }
      }
    }
    y += 3
  }

  y = section(doc, 'Condições comerciais', y)
  const t = d.terms
  y = keyValues(doc, [
    ['Início', date(t.start)], ['Prazo mínimo', t.minMonths ? `${t.minMonths} meses${t.minEnd ? ` (até ${date(t.minEnd)})` : ''}` : '—'],
    ['Renovação', t.renewal], ['Aviso prévio para cancelamento', t.noticeDays ? `${t.noticeDays} dias` : '—'],
    ['Dia de vencimento', t.dueDay ? `Todo dia ${t.dueDay}` : '—'], ['Forma de pagamento', t.paymentMethod ?? '—'],
    ['Parcelas', t.installments ? String(t.installments) : '—'], ['Condições de pagamento', t.paymentTerms ?? '—'],
  ], y + 3)
  if (t.renewal === 'Automática') y = paragraph(doc, 'O contrato renova automaticamente ao fim do prazo mínimo, caso não haja solicitação de encerramento pelo contratante dentro do aviso prévio informado.', y)
  if (t.notes) { y = section(doc, 'Observações', y); y = paragraph(doc, t.notes, y + 3) }

  // assinaturas
  y = ensure(doc, y + 18, 30)
  const half = (W - M * 2 - 16) / 2
  doc.setDrawColor(...INK); doc.setLineWidth(0.3)
  doc.line(M, y, M + half, y); doc.line(M + half + 16, y, W - M, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text(d.client.name, M, y + 5); doc.text('Contratante', M, y + 9.5)
  doc.text('Nuage', M + half + 16, y + 5); doc.text('Contratada', M + half + 16, y + 9.5)
  doc.text('Local e data: ____________________________________', M, y + 20)

  footer(doc, `Contrato · ${d.client.name}`)
  doc.save(`contrato-${safeName(d.client.name)}.pdf`)
}

// ======================================================================
// Extrato financeiro de um cliente
// ======================================================================
export interface StatementPdfData {
  client: { name: string; contact_name?: string | null; email?: string | null }
  period: string
  rows: { due: string; description: string; amount: number; status: string; paidAt: string | null; method: string | null }[]
  totals: { previsto: number; recebido: number; atraso: number }
}

export async function statementPdf(d: StatementPdfData) {
  const { jsPDF, autoTable } = await loadLibs()
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = doc.internal.pageSize.getWidth()
  let y = await header(doc, 'Extrato financeiro', `${d.client.name} · ${d.period}`)

  y = section(doc, 'Cliente', y + 2)
  y = keyValues(doc, [['Cliente', d.client.name], ['Contato', [d.client.contact_name, d.client.email].filter(Boolean).join(' · ') || '—']], y + 3)

  // resumo em três blocos
  const boxW = (W - M * 2 - 8) / 3
  const boxes: [string, number, [number, number, number]][] = [
    ['Previsto', d.totals.previsto, INK], ['Recebido', d.totals.recebido, [46, 158, 106]], ['Em atraso', d.totals.atraso, [192, 57, 43]],
  ]
  boxes.forEach(([label, value, color], i) => {
    const x = M + i * (boxW + 4)
    doc.setFillColor(252, 250, 255); doc.setDrawColor(...LINE); doc.roundedRect(x, y, boxW, 18, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED); doc.text(label, x + 4, y + 6)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...color); doc.text(brl(value), x + 4, y + 13.5)
  })
  y += 26

  y = section(doc, 'Lançamentos', y)
  autoTable(doc, {
    startY: y + 1, margin: { left: M, right: M },
    head: [['Vencimento', 'Descrição', 'Valor', 'Situação', 'Pago em', 'Método']],
    body: d.rows.map((r) => [date(r.due), r.description, brl(r.amount), r.status, date(r.paidAt), r.method ?? '—']),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.6, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    headStyles: { fillColor: ORANGE, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [252, 250, 255] },
    columnStyles: { 2: { halign: 'right' } },
    didParseCell: (c) => {
      if (c.section === 'body' && c.column.index === 3) {
        const v = String(c.cell.raw)
        c.cell.styles.textColor = v === 'Pago' ? [46, 158, 106] : v === 'Atrasado' ? [192, 57, 43] : INK
        c.cell.styles.fontStyle = 'bold'
      }
    },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  y = paragraph(doc, 'Valores conforme lançamentos registrados no Na.Nu. Previsto considera os vencimentos do período (exceto cancelados); recebido considera os pagamentos confirmados.', y)

  footer(doc, `Extrato · ${d.client.name}`)
  doc.save(`extrato-${safeName(d.client.name)}.pdf`)
}

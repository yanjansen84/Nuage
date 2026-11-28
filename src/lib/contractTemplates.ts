import type { ContractTemplateKey } from '../data/types'
import { fdFull, money } from '../ui/kit'
import { numeroComExtenso, valorPorExtenso } from './extenso'

export const NUAGE_COMPANY = {
  legalName: '54.970.818 HARCLISSON MAGNO DE SOUSA VIANA',
  cnpj: '54.970.818/0001-66',
  tradeName: 'NUAGE — Comunicação Criativa',
  shortTradeName: 'NUAGE',
  representative: 'Harclisson Magno de Sousa Viana',
}

export interface ContractClause {
  title: string
  paragraphs: string[]
}

export interface ContractClientInfo {
  name: string
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  segment?: string | null
  legal_name?: string | null
  document?: string | null
  address?: string | null
  legal_rep_name?: string | null
  legal_rep_cpf?: string | null
}

export interface ContractDocContext {
  client: ContractClientInfo
  templates: ContractTemplateKey[]
  items: { service: string; option: string | null; quantity: number; billing: string; price: number }[]
  monthly: number
  oneTime: number
  minMonths: number | null
  start: string | null
  minEnd: string | null
  renewal: string
  noticeDays: number | null
  dueDay: number | null
  paymentMethod: string | null
  installments: number | null
  paymentTerms: string | null
  firstPaymentDate: string | null
  billingPeriodicity: string | null
  platforms: string | null
  publisher: 'contratada' | 'contratante' | null
  videoQuantity: number | null
  shootingLocation: string | null
  portfolioAuthorized: boolean
  forumCity: string
  notes: string | null
}

export interface ContractDocument {
  modelLabel: string
  title: string
  subtitle: string
  contratanteLine: string
  contratadaLine: string
  preamble: string
  closingLine: string
  dateLine: string
  clauses: ContractClause[]
  forumCity: string
}

function formatTotalValue(ctx: ContractDocContext): { numeric: string; words: string } {
  if (ctx.monthly > 0 && ctx.oneTime > 0) {
    return {
      numeric: `${money(ctx.monthly).replace(/^R\$\s?/, '')}/mês + ${money(ctx.oneTime).replace(/^R\$\s?/, '')}`,
      words: `${valorPorExtenso(ctx.monthly)} mensais mais ${valorPorExtenso(ctx.oneTime)} em pacote/avulso`,
    }
  }
  const base = ctx.monthly > 0 ? ctx.monthly : ctx.oneTime
  return {
    numeric: base > 0 ? money(base).replace(/^R\$\s?/, '') : '__________',
    words: base > 0 ? valorPorExtenso(base) : 'VALOR POR EXTENSO',
  }
}

function vars(ctx: ContractDocContext) {
  const c = ctx.client
  const val = formatTotalValue(ctx)
  const prazoContratual = ctx.minMonths ? String(ctx.minMonths) : '________'
  const dataInicio = ctx.start ? fdFull(ctx.start) : '____/____/________'
  const dataTermino = ctx.minEnd ? fdFull(ctx.minEnd) : (ctx.minMonths ? 'após o decurso do prazo mínimo' : 'prazo indeterminado')
  const primeiroPg = ctx.firstPaymentDate ? fdFull(ctx.firstPaymentDate) : (ctx.start ? fdFull(ctx.start) : '____/____/________')
  const diaVenc = ctx.dueDay ? String(ctx.dueDay) : '____'
  const periodicidade = ctx.billingPeriodicity?.trim() || (ctx.monthly > 0 ? 'mensal' : 'conforme contratação')
  const plataformas = ctx.platforms?.trim() || 'plataformas digitais acordadas entre as partes'
  const responsavelPub = ctx.publisher === 'contratante' ? 'CONTRATANTE' : 'CONTRATADA'
  const qtdVideos = ctx.videoQuantity ? numeroComExtenso(ctx.videoQuantity) : '________'
  const localCaptacao = ctx.shootingLocation?.trim() || 'local previamente definido entre as partes'
  const condPg = [ctx.paymentMethod, ctx.installments && ctx.installments > 1 ? `em ${ctx.installments}x` : null, ctx.paymentTerms].filter(Boolean).join(', ') || 'conforme ajustado entre as partes'
  const avisoPrevio = `${numeroComExtenso(ctx.noticeDays ?? 30)}`
  const forumCity = ctx.forumCity?.trim() || 'São Luís - MA'

  const doc = c.document?.trim() || '____________________'
  const addr = c.address?.trim() || '________________________________________'
  const repName = c.legal_rep_name?.trim() || c.contact_name?.trim() || 'não aplicável'
  const repCpf = c.legal_rep_cpf?.trim() || 'não aplicável'
  const email = c.email?.trim() || '____________________'
  const phone = c.phone?.trim() || '____________________'
  const legalName = c.legal_name?.trim() || c.name

  const contratanteLine = `CONTRATANTE: ${legalName}, inscrito(a) no CPF/CNPJ sob o nº ${doc}, com endereço em ${addr}, neste ato representado(a), quando aplicável, por ${repName}, inscrito(a) no CPF sob o nº ${repCpf}, e-mail ${email} e telefone ${phone}.`
  const contratadaLine = `CONTRATADA: ${NUAGE_COMPANY.legalName}, inscrita no CNPJ sob o nº ${NUAGE_COMPANY.cnpj}, sob o nome fantasia ${NUAGE_COMPANY.shortTradeName}, neste ato representada por ${NUAGE_COMPANY.representative}, doravante denominada simplesmente NUAGE ou CONTRATADA.`

  const portfolioLines = [
    `${ctx.portfolioAuthorized ? '[ X ]' : '[   ]'} AUTORIZO a utilização dos materiais produzidos para fins de portfólio e divulgação institucional da NUAGE.`,
    `${!ctx.portfolioAuthorized ? '[ X ]' : '[   ]'} NÃO AUTORIZO a utilização dos materiais produzidos para fins de divulgação ou portfólio.`,
  ]

  return {
    val,
    prazoContratual,
    dataInicio,
    dataTermino,
    primeiroPg,
    diaVenc,
    periodicidade,
    plataformas,
    responsavelPub,
    qtdVideos,
    localCaptacao,
    condPg,
    avisoPrevio,
    forumCity,
    contratanteLine,
    contratadaLine,
    portfolioLines,
  }
}

// ======================================================================
// CONTRATO 01 — AGÊNCIA NUAGE (texto integral, Cláusulas 1ª a 16ª)
// ======================================================================
function buildAgencia(ctx: ContractDocContext): ContractDocument {
  const v = vars(ctx)
  const clauses: ContractClause[] = [
    {
      title: 'CLÁUSULA 1ª — DO OBJETO DO CONTRATO',
      paragraphs: [
        '1.1. O presente instrumento tem por objeto a prestação de serviços de gestão geral e integrada da comunicação da CONTRATANTE pela CONTRATADA, compreendendo planejamento estratégico, posicionamento de marca, gestão de canais digitais, produção de conteúdo, acompanhamento de resultados, estruturação de processos e desenvolvimento de ações de comunicação.',
        '1.2. A prestação dos serviços tem como finalidade organizar, desenvolver e fortalecer a comunicação institucional e comercial da CONTRATANTE, considerando seus objetivos, posicionamento, identidade, público e necessidades estratégicas.',
        '1.3. O escopo contratado compreende as seguintes atividades:',
        'I. Gestão completa de redes sociais;',
        'II. Planejamento estratégico de conteúdo;',
        'III. Planejamento de Stories;',
        'IV. Gestão de comunidade, incluindo acompanhamento de interações e respostas a comentários;',
        'V. Captação, roteirização, direção e edição de fotos e vídeos;',
        'VI. Impulsionamento e gestão de tráfego pago por meio do Meta Ads;',
        'VII. Análise de resultados e elaboração de relatórios de desempenho;',
        'VIII. Posicionamento estratégico de marca;',
        'IX. Avaliação e otimização dos processos de atendimento da CONTRATANTE;',
        'X. Planejamento e execução de campanhas e eventos;',
        'XI. Estruturação de processos internos de comunicação da marca;',
        'XII. Criação de manuais, documentos e materiais operacionais relacionados à comunicação;',
        'XIII. Acompanhamento estratégico e consultoria em comunicação.',
        '1.4. Os serviços serão executados de acordo com as prioridades estratégicas, necessidades identificadas e planejamento estabelecido pela CONTRATADA, respeitando as condições acordadas entre as partes.',
        `1.5. As plataformas digitais abrangidas pela contratação serão: ${v.plataformas}.`,
        '1.6. A prestação dos serviços de gestão integrada da comunicação pressupõe o acompanhamento estratégico contínuo entre as partes, sendo estabelecida a realização de reuniões de alinhamento com a CONTRATANTE, na frequência mínima de 01 (uma) reunião semanal ou 02 (duas) reuniões mensais, conforme organização e cronograma previamente acordados.',
        '1.7. As reuniões terão como finalidade discutir estratégias de comunicação, acompanhar o desenvolvimento das ações, identificar necessidades da marca, alinhar prioridades, avaliar resultados, definir direcionamentos e fornecer informações necessárias à elaboração dos planejamentos de conteúdo e demais atividades previstas neste contrato.',
        '1.8. A participação da CONTRATANTE nas reuniões de alinhamento constitui condição importante para o adequado desenvolvimento dos serviços. A ausência de disponibilidade, recusa ou não participação injustificada da CONTRATANTE poderá comprometer o levantamento de informações, a definição de estratégias, a elaboração dos planejamentos e o andamento geral das atividades, não podendo eventuais atrasos ou limitações decorrentes dessa ausência ser atribuídos à CONTRATADA.',
        '1.9. A inclusão das atividades no escopo geral deste contrato não implica execução ilimitada ou disponibilidade irrestrita da CONTRATADA. As entregas estarão condicionadas às prioridades estratégicas, ao planejamento e à capacidade operacional da agência.',
        '1.10. Demandas extraordinárias, produções adicionais, campanhas especiais, materiais institucionais, serviços de impressão, contratações de terceiros e outras atividades não previstas expressamente poderão ser orçadas separadamente, mediante aprovação prévia da CONTRATANTE.',
      ],
    },
    {
      title: 'CLÁUSULA 2ª — DO PLANEJAMENTO, EXECUÇÃO E ENTREGA DOS SERVIÇOS',
      paragraphs: [
        '2.1. A CONTRATADA será responsável pela elaboração do planejamento estratégico e operacional da comunicação, estabelecendo as ações, prioridades e entregas previstas para cada período.',
        '2.2. O planejamento mensal de conteúdo será encaminhado à CONTRATANTE até o 5º (quinto) dia útil de cada mês, contemplando as diretrizes, pautas, formatos e demais informações pertinentes à programação de conteúdo.',
        '2.3. A CONTRATADA realizará as atividades de captação, roteirização, direção e edição de fotos e vídeos conforme o cronograma previamente estabelecido entre as partes.',
        '2.4. Os materiais audiovisuais resultantes das captações serão entregues em até 48 (quarenta e oito) horas após a realização da respectiva gravação.',
        '2.5. As entregas serão disponibilizadas por meio de pasta compartilhada no Google Drive e encaminhadas à CONTRATANTE pelo WhatsApp, em formato de mídia ou documento, conforme os formatos disponibilizados pela agência.',
        '2.6. A CONTRATANTE terá o prazo de até 24 (vinte e quatro) horas, contado do recebimento do material, para analisar, aprovar ou solicitar ajustes.',
        '2.7. As solicitações de alteração deverão ser encaminhadas de maneira objetiva e consolidada, respeitando o planejamento, o direcionamento estratégico e o escopo originalmente aprovado.',
        '2.8. Alterações que impliquem mudança substancial de conceito, roteiro, direcionamento criativo ou finalidade do material poderão ser consideradas demandas adicionais, sujeitas à avaliação e orçamento complementar.',
        '2.9. A ausência de manifestação dentro do prazo de aprovação não autoriza automaticamente a publicação de conteúdos em nome da CONTRATANTE. A CONTRATADA poderá reprogramar as entregas e publicações, preservando a organização do calendário editorial.',
        '2.10. Os relatórios de métricas e desempenho serão encaminhados até o dia 2 (dois) do mês subsequente ao período analisado, observada a disponibilidade, atualização e acessibilidade dos dados fornecidos pelas plataformas digitais utilizadas.',
        '2.11. A CONTRATADA não será responsabilizada por atrasos decorrentes de indisponibilidade das plataformas, falhas de acesso, instabilidades técnicas ou limitações de ferramentas de terceiros.',
        '2.12. A execução de campanhas, eventos, ações institucionais e demais projetos estratégicos observará cronogramas e condições específicos, definidos previamente entre as partes.',
      ],
    },
    {
      title: 'CLÁUSULA 3ª — DO TRÁFEGO PAGO E INVESTIMENTO PUBLICITÁRIO',
      paragraphs: [
        '3.1. A gestão de tráfego pago integra os serviços contratados e compreende o planejamento, a configuração, o acompanhamento e a otimização de campanhas publicitárias realizadas por meio do Gerenciador de Anúncios da Meta e demais ferramentas abrangidas pelo escopo.',
        '3.2. A remuneração pela gestão estratégica e operacional das campanhas está incluída no valor mensal deste contrato, não sendo cobrada taxa adicional específica pela execução desse serviço.',
        '3.3. O investimento financeiro destinado à veiculação dos anúncios, impulsionamentos e campanhas publicitárias não está incluído na remuneração da CONTRATADA, sendo de responsabilidade exclusiva da CONTRATANTE, que deverá disponibilizar os recursos diretamente à plataforma ou conforme procedimento previamente acordado entre as partes.',
        '3.4. A CONTRATADA será responsável pela gestão estratégica das campanhas, não garantindo resultados específicos de alcance, conversão, vendas, geração de leads, crescimento de audiência ou faturamento.',
        '3.5. A execução das campanhas dependerá da disponibilidade das plataformas, aprovação dos anúncios, regularidade das contas e cumprimento das políticas de publicidade aplicáveis.',
      ],
    },
    {
      title: 'CLÁUSULA 4ª — DO PRAZO E DA VIGÊNCIA',
      paragraphs: [
        `4.1. O presente contrato terá duração de ${v.prazoContratual} meses, com início em ${v.dataInicio} e término previsto para ${v.dataTermino}.`,
        '4.2. A renovação poderá ocorrer mediante manifestação expressa das partes, podendo ser formalizada por termo aditivo ou novo instrumento contratual.',
        `4.3. Qualquer uma das partes poderá solicitar a rescisão contratual mediante comunicação formal por escrito, respeitando o prazo mínimo de ${v.avisoPrevio} dias de antecedência.`,
        '4.4. A continuidade da prestação dos serviços durante o período de aviso prévio dependerá do cumprimento das obrigações contratuais e financeiras de ambas as partes.',
        '4.5. A rescisão não desobriga as partes do cumprimento das obrigações vencidas ou constituídas durante a vigência do contrato.',
      ],
    },
    {
      title: 'CLÁUSULA 5ª — DA RESCISÃO ANTECIPADA E PENALIDADES',
      paragraphs: [
        '5.1. Em caso de rescisão antecipada e imotivada por iniciativa da CONTRATANTE, durante o período de vigência contratual, será devida multa compensatória equivalente a 20% (vinte por cento) do valor correspondente aos meses restantes do contrato.',
        '5.2. O cálculo da multa observará a seguinte fórmula:',
        'Valor mensal contratado × quantidade de meses restantes × 20%.',
        '5.3. A multa não será aplicada quando a rescisão decorrer de descumprimento contratual comprovado por parte da CONTRATADA ou de outra hipótese legal que justifique o encerramento sem penalidade.',
        '5.4. Em qualquer hipótese de encerramento, permanecerão devidos os valores vencidos, os serviços efetivamente prestados e as despesas previamente aprovadas e realizadas até a data da rescisão.',
        '5.5. Em caso de rescisão por iniciativa da CONTRATADA, esta deverá comunicar previamente a CONTRATANTE, respeitando o aviso prévio estabelecido neste instrumento, e realizar o encerramento organizado das atividades.',
        '5.6. Caso a CONTRATADA encerre a prestação dos serviços após o recebimento antecipado de valores referentes a períodos não executados, deverá realizar a restituição proporcional dos valores correspondentes, observadas as obrigações pendentes e os serviços efetivamente prestados.',
        '5.7. O descumprimento de obrigações contratuais deverá ser comunicado formalmente à parte responsável, concedendo-se prazo razoável para regularização, quando cabível, antes da adoção das medidas de rescisão.',
      ],
    },
    {
      title: 'CLÁUSULA 6ª — DA EXECUÇÃO, REPROGRAMAÇÃO E COMPENSAÇÃO DE DEMANDAS',
      paragraphs: [
        '6.1. As demandas previstas serão executadas dentro do mês vigente, conforme planejamento e cronograma previamente alinhados entre as partes.',
        '6.2. Caso ocorra a não execução total ou parcial das demandas por responsabilidade exclusiva da CONTRATADA, as entregas pendentes poderão ser convertidas em crédito operacional de demanda, a ser executado no mês subsequente ou em prazo acordado entre as partes, sem custo adicional.',
        '6.3. O crédito operacional corresponde exclusivamente ao saldo de entregas contratadas e não executadas, não possuindo natureza de crédito financeiro, abatimento, reembolso ou desconto automático sobre os valores contratuais.',
        '6.4. A utilização dos créditos deverá respeitar o escopo originalmente contratado, a capacidade operacional e agenda da CONTRATADA, o prazo máximo de utilização e a necessidade de alinhamento prévio entre as partes.',
        '6.5. Os créditos operacionais terão validade máxima de 60 (sessenta) dias, contados do período em que a entrega deveria ter sido executada, salvo acordo formal em sentido contrário.',
        '6.6. Os créditos não poderão ser transferidos, convertidos em valores financeiros, utilizados fora do escopo contratado ou cedidos a terceiros.',
        '6.7. A existência de créditos operacionais não implicará suspensão, isenção ou postergação automática dos pagamentos mensais.',
        '6.8. Caso a não execução das demandas decorra de responsabilidade da CONTRATANTE, incluindo ausência de envio de materiais, atrasos em aprovações, falta de informações ou descumprimento de prazos acordados, as entregas poderão ser reprogramadas conforme disponibilidade da CONTRATADA, permanecendo devido o pagamento integral do período contratado.',
        '6.9. A execução das demandas depende da colaboração ativa da CONTRATANTE, que deverá fornecer os insumos, informações, acessos e aprovações necessários dentro dos prazos estabelecidos.',
        '6.10. As demandas reprogramadas estarão sujeitas à disponibilidade de agenda da CONTRATADA e serão organizadas conforme as prioridades do cronograma vigente.',
        '6.11. As regras desta cláusula não afastam eventual direito de reembolso, abatimento ou reparação quando legalmente aplicável.',
      ],
    },
    {
      title: 'CLÁUSULA 7ª — DA REMUNERAÇÃO E DAS CONDIÇÕES DE PAGAMENTO',
      paragraphs: [
        `7.1. Pela prestação dos serviços descritos neste instrumento, a CONTRATANTE pagará à CONTRATADA o valor de R$ ${v.val.numeric} (${v.val.words}), com periodicidade ${v.periodicidade}, mediante vencimento no dia ${v.diaVenc} de cada período contratado.`,
        `7.2. O primeiro pagamento será realizado em ${v.primeiroPg}, iniciando-se a prestação dos serviços conforme a data estabelecida na Cláusula 4ª.`,
        `7.3. O pagamento poderá ser realizado por PIX, transferência bancária, boleto ou outro meio previamente acordado entre as partes (${v.condPg}).`,
        '7.4. Em caso de atraso no pagamento, será concedido prazo de tolerância de até 15 (quinze) dias corridos, sem incidência de encargos, desde que não haja reincidência.',
        '7.5. Após o prazo de tolerância, incidirá multa moratória de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês, calculados proporcionalmente aos dias de atraso.',
        '7.6. O atraso superior a 30 (trinta) dias autoriza a CONTRATADA, mediante comunicação prévia, a suspender temporariamente a execução dos serviços até a regularização integral dos valores pendentes.',
        '7.7. A suspensão dos serviços por inadimplência poderá ocasionar a reprogramação das entregas, sem obrigação de manutenção dos prazos originalmente estabelecidos.',
        '7.8. A retomada das atividades estará condicionada à regularização financeira e à reorganização do cronograma de execução, conforme disponibilidade operacional da CONTRATADA.',
        '7.9. O investimento em tráfego pago, despesas extraordinárias e serviços adicionais não está incluído na remuneração mensal, salvo quando expressamente previsto neste instrumento.',
      ],
    },
    {
      title: 'CLÁUSULA 8ª — DAS OBRIGAÇÕES DA CONTRATANTE',
      paragraphs: [
        '8.1. São obrigações da CONTRATANTE:',
        'I. Fornecer todas as informações, documentos, materiais e acessos necessários à execução dos serviços;',
        'II. Disponibilizar informações institucionais, comerciais e operacionais que permitam o desenvolvimento adequado das estratégias de comunicação;',
        'III. Garantir a veracidade e a regularidade dos materiais e informações fornecidos à CONTRATADA;',
        'IV. Possuir autorização para utilização de imagens, marcas, documentos e demais materiais de terceiros encaminhados para produção de conteúdo;',
        'V. Realizar a análise e aprovação dos materiais dentro dos prazos estabelecidos neste instrumento;',
        'VI. Participar das reuniões estratégicas de alinhamento na frequência acordada;',
        'VII. Comparecer às reuniões previamente agendadas ou comunicar eventual impossibilidade com antecedência mínima de 24 (vinte e quatro) horas;',
        'VIII. Efetuar os pagamentos nos valores e prazos acordados;',
        'IX. Disponibilizar os recursos necessários para investimento publicitário;',
        'X. Informar alterações relevantes em seus serviços, produtos, funcionamento, posicionamento ou condições comerciais que possam interferir na comunicação;',
        'XI. Designar um responsável pelo contato, acompanhamento e aprovação das demandas, quando aplicável.',
        '8.2. A CONTRATANTE será responsável pelas informações comerciais, técnicas, institucionais e publicitárias fornecidas à CONTRATADA, incluindo a veracidade de alegações, condições de ofertas e informações sobre produtos e serviços.',
        '8.3. A CONTRATANTE deverá observar os prazos de envio de materiais e informações, reconhecendo que atrasos poderão comprometer o cronograma de produção, aprovação e publicação.',
        '8.4. As despesas extraordinárias necessárias à execução dos serviços, incluindo deslocamentos, viagens, hospedagem, impressão, contratação de equipe adicional e aquisição de materiais específicos, serão previamente apresentadas para aprovação da CONTRATANTE e custeadas por esta.',
        '8.5. A CONTRATANTE deverá manter os acessos e permissões necessários às plataformas digitais, ferramentas de gestão e contas utilizadas na execução dos serviços.',
      ],
    },
    {
      title: 'CLÁUSULA 9ª — DAS OBRIGAÇÕES DA CONTRATADA',
      paragraphs: [
        '9.1. São obrigações da CONTRATADA:',
        'I. Executar os serviços conforme o escopo contratado e as diretrizes estratégicas estabelecidas;',
        'II. Elaborar e apresentar os planejamentos de comunicação e conteúdo nos prazos previstos;',
        'III. Realizar as atividades de produção, captação, roteirização, direção e edição de acordo com o cronograma acordado;',
        'IV. Encaminhar os materiais para aprovação da CONTRATANTE pelos canais de comunicação estabelecidos;',
        'V. Acompanhar os resultados das ações de comunicação e apresentar relatórios quando previstos no escopo;',
        'VI. Manter comunicação profissional e transparente durante a execução contratual;',
        'VII. Preservar a confidencialidade das informações recebidas;',
        'VIII. Informar à CONTRATANTE eventuais impedimentos técnicos ou operacionais que possam comprometer a execução dos serviços;',
        'IX. Zelar pela qualidade técnica e criativa das entregas, observando os padrões profissionais da agência;',
        'X. Cumprir as disposições legais aplicáveis à prestação dos serviços.',
        '9.2. A CONTRATADA possui autonomia técnica e criativa para desenvolver as estratégias, propostas e materiais de comunicação, respeitando o posicionamento, as diretrizes e os objetivos previamente alinhados com a CONTRATANTE.',
        '9.3. A CONTRATADA poderá organizar sua equipe e distribuir internamente as atividades necessárias à execução dos serviços, permanecendo responsável pelo cumprimento das obrigações assumidas neste contrato.',
        '9.4. A CONTRATADA não será responsável por falhas, bloqueios, indisponibilidades ou alterações promovidas por plataformas digitais, ferramentas de terceiros ou serviços externos que estejam fora de seu controle.',
      ],
    },
    {
      title: 'CLÁUSULA 10ª — DOS LIMITES DA PRESTAÇÃO DE SERVIÇOS E DA AUSÊNCIA DE GARANTIA DE RESULTADOS',
      paragraphs: [
        '10.1. A CONTRATADA assume a obrigação de executar os serviços contratados com diligência, qualidade técnica e observância das estratégias estabelecidas, caracterizando-se a prestação como obrigação de meio, e não de resultado.',
        '10.2. A CONTRATADA não garante resultados comerciais, financeiros ou quantitativos específicos, incluindo faturamento, vendas, conversões, alcance, engajamento, crescimento de seguidores ou geração de oportunidades comerciais.',
        '10.3. Os resultados das ações de comunicação dependem de fatores diversos, incluindo condições de mercado, qualidade dos produtos e serviços, atendimento, preços, concorrência, comportamento do público, investimento publicitário e funcionamento das plataformas.',
        '10.4. A prestação dos serviços não contempla atendimento comercial direto aos clientes da CONTRATANTE, fechamento de vendas, negociação, suporte técnico de produtos ou serviços, SAC, gerenciamento de reclamações ou operação comercial, salvo contratação expressa dessas atividades.',
        '10.5. A gestão de comunidade limita-se ao acompanhamento das interações e às respostas a comentários e manifestações compatíveis com as diretrizes de comunicação previamente estabelecidas.',
        '10.6. A execução de atividades estratégicas, campanhas e eventos deverá respeitar o escopo e os limites operacionais definidos entre as partes, não implicando disponibilidade permanente da equipe da CONTRATADA.',
      ],
    },
    {
      title: 'CLÁUSULA 11ª — DA PROPRIEDADE INTELECTUAL E DOS DIREITOS AUTORAIS',
      paragraphs: [
        '11.1. Os materiais finais desenvolvidos pela CONTRATADA especificamente para a CONTRATANTE poderão ser utilizados por esta para as finalidades relacionadas à contratação, após a quitação integral dos valores correspondentes.',
        '11.2. A autorização de utilização dos materiais finais não implica transferência automática da titularidade dos métodos, processos, estruturas estratégicas, modelos de trabalho, ferramentas, conhecimentos técnicos e materiais preexistentes da CONTRATADA.',
        '11.3. Não estão incluídos na entrega regular, salvo previsão expressa ou contratação adicional:',
        'I. Arquivos editáveis e projetos abertos;',
        'II. Arquivos brutos de captação;',
        'III. Templates e estruturas internas de produção;',
        'IV. Arquivos-fonte de identidade visual e peças gráficas;',
        'V. Materiais de planejamento e documentos internos da agência;',
        'VI. Outros elementos técnicos utilizados na produção dos materiais finais.',
        '11.4. A utilização de músicas, imagens, fontes, vídeos, fotografias e demais recursos de terceiros estará sujeita às respectivas licenças e condições de uso.',
        '11.5. A CONTRATANTE não poderá utilizar os materiais de maneira que viole direitos autorais, direitos de terceiros ou as condições de licenciamento dos recursos empregados.',
        '11.6. A entrega dos materiais finais não implica obrigação de fornecimento dos arquivos originais de produção, salvo quando expressamente acordado entre as partes.',
      ],
    },
    {
      title: 'CLÁUSULA 12ª — DO USO DE IMAGEM E PORTFÓLIO',
      paragraphs: [
        '12.1. A utilização dos trabalhos desenvolvidos pela CONTRATADA em seu portfólio, redes sociais, apresentações comerciais e materiais de divulgação institucional dependerá da autorização expressa da CONTRATANTE, conforme opção abaixo:',
        ...v.portfolioLines,
        '12.2. A autorização, quando concedida, não implica obrigação de pagamento adicional, desde que respeitados os limites estabelecidos nesta cláusula.',
        '12.3. A utilização de imagens de pessoas, colaboradores, clientes, parceiros ou terceiros dependerá das respectivas autorizações legais, não sendo a autorização da CONTRATANTE suficiente para substituir consentimentos ou outras bases legais exigíveis.',
        '12.4. A CONTRATADA compromete-se a não divulgar informações confidenciais, dados pessoais protegidos ou informações comerciais não autorizadas sob a justificativa de utilização em portfólio.',
      ],
    },
    {
      title: 'CLÁUSULA 13ª — DA CONFIDENCIALIDADE E PROTEÇÃO DE DADOS PESSOAIS',
      paragraphs: [
        '13.1. As partes comprometem-se a manter sigilo sobre informações comerciais, financeiras, estratégicas, operacionais, documentos, processos internos e demais informações confidenciais às quais tenham acesso em razão deste contrato.',
        '13.2. As informações confidenciais não poderão ser divulgadas, compartilhadas ou utilizadas para finalidades distintas da execução contratual, salvo mediante autorização da parte responsável ou por obrigação legal.',
        '13.3. As partes comprometem-se a observar a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD), tratando os dados pessoais envolvidos na relação contratual de acordo com as finalidades legítimas e as bases legais aplicáveis.',
        '13.4. Quando a CONTRATADA realizar tratamento de dados pessoais em nome da CONTRATANTE, as partes deverão observar as respectivas responsabilidades e instruções relacionadas ao tratamento, respeitando a legislação vigente.',
        '13.5. A CONTRATADA compromete-se a adotar medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra acessos não autorizados, perda, alteração, divulgação ou qualquer forma de tratamento inadequado.',
        '13.6. Eventuais incidentes de segurança que possam comprometer dados pessoais tratados no âmbito deste contrato deverão ser comunicados à outra parte em prazo razoável, observadas as obrigações legais e regulamentares aplicáveis.',
        '13.7. Ao término da relação contratual, os dados pessoais serão tratados conforme as finalidades, obrigações legais e prazos de conservação aplicáveis.',
        '13.8. As obrigações de confidencialidade permanecerão vigentes mesmo após o encerramento deste contrato.',
      ],
    },
    {
      title: 'CLÁUSULA 14ª — DO CASO FORTUITO E DA FORÇA MAIOR',
      paragraphs: [
        '14.1. Nenhuma das partes será responsabilizada pelo descumprimento de obrigações diretamente decorrente de eventos imprevisíveis ou inevitáveis que caracterizem caso fortuito ou força maior, nos termos da legislação aplicável.',
        '14.2. A parte afetada deverá comunicar a outra parte sobre a ocorrência do evento, informando, sempre que possível, seus impactos e a previsão de regularização das atividades.',
        '14.3. As obrigações diretamente afetadas poderão ser reprogramadas mediante alinhamento entre as partes, preservadas as responsabilidades legalmente aplicáveis.',
        '14.4. Caso a situação impossibilite a continuidade da prestação dos serviços por período prolongado, as partes poderão negociar a suspensão ou o encerramento contratual.',
      ],
    },
    {
      title: 'CLÁUSULA 15ª — DAS DISPOSIÇÕES GERAIS',
      paragraphs: [
        '15.1. O presente contrato representa o acordo integral entre as partes em relação aos serviços nele descritos.',
        '15.2. Qualquer alteração de escopo, valores, prazos, condições ou obrigações deverá ser formalizada por escrito, mediante termo aditivo ou outro instrumento de concordância expressa entre as partes.',
        '15.3. A tolerância de qualquer das partes quanto ao descumprimento de obrigações contratuais não constituirá renúncia de direitos ou alteração das condições estabelecidas.',
        '15.4. As partes reconhecem que a relação estabelecida por este instrumento possui natureza de prestação de serviços, sem formação de vínculo empregatício, societário ou de representação comercial entre elas.',
        '15.5. As comunicações relacionadas à execução contratual poderão ser realizadas por e-mail ou WhatsApp, utilizando os contatos informados na qualificação das partes.',
        '15.6. As partes comprometem-se a buscar inicialmente a resolução consensual de eventuais divergências decorrentes deste instrumento, por meio de negociação direta ou mediação.',
        '15.7. Não sendo possível solucionar a controvérsia de forma consensual, serão adotadas as medidas judiciais cabíveis, observadas as regras legais de competência e proteção aplicáveis.',
        '15.8. O presente instrumento poderá ser assinado física ou eletronicamente, reconhecendo as partes a validade jurídica das assinaturas realizadas por meios eletrônicos admitidos pela legislação brasileira.',
        ...(ctx.notes?.trim() ? [`15.9. Observações específicas acordadas entre as partes: ${ctx.notes.trim()}`] : []),
      ],
    },
    {
      title: 'CLÁUSULA 16ª — DO FORO',
      paragraphs: [
        `16.1. Para dirimir eventuais controvérsias decorrentes deste contrato, as partes elegem o foro da Comarca de ${v.forumCity}, observadas as regras legais de competência e eventual proteção de foro aplicável à CONTRATANTE.`,
      ],
    },
  ]

  return {
    modelLabel: 'CONTRATO 01 — AGÊNCIA NUAGE',
    subtitle: 'Prestação de serviços de gestão integrada da comunicação',
    title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE GESTÃO INTEGRADA DA COMUNICAÇÃO',
    contratanteLine: v.contratanteLine,
    contratadaLine: v.contratadaLine,
    preamble: 'As partes acima identificadas resolvem celebrar o presente Contrato de Prestação de Serviços de Gestão Integrada da Comunicação, mediante as cláusulas e condições seguintes.',
    closingLine: 'E, por estarem de acordo com as condições estabelecidas, as partes assinam o presente instrumento, juntamente com duas testemunhas, para que produza seus efeitos jurídicos e legais.',
    dateLine: `${v.forumCity}, ______ de ______________________ de ________.`,
    clauses,
    forumCity: v.forumCity,
  }
}

// ======================================================================
// CONTRATO 02 — SOCIAL MEDIA NUAGE (texto integral, Cláusulas 1ª a 15ª)
// ======================================================================
function buildSocialMedia(ctx: ContractDocContext): ContractDocument {
  const v = vars(ctx)
  const clauses: ContractClause[] = [
    {
      title: 'CLÁUSULA 1ª — DO OBJETO DO CONTRATO',
      paragraphs: [
        '1.1. O presente contrato tem por objeto a prestação de serviços de Social Media pela CONTRATADA à CONTRATANTE, compreendendo planejamento estratégico, criação, produção, gestão e acompanhamento de conteúdos digitais destinados ao fortalecimento da presença da marca nas redes sociais.',
        '1.2. O escopo contratado compreende as seguintes atividades:',
        'I. Gestão de redes sociais;',
        'II. Análise de perfil e diagnóstico de presença digital;',
        'III. Planejamento estratégico de conteúdo;',
        'IV. Planejamento de Stories;',
        'V. Gestão de comunidade, incluindo acompanhamento de interações e respostas a comentários;',
        'VI. Captação, roteirização, direção e edição de fotos e vídeos.',
        `1.3. As plataformas digitais abrangidas pela contratação serão: ${v.plataformas}.`,
        '1.4. A quantidade e distribuição dos conteúdos serão estabelecidas conforme o planejamento estratégico mensal, respeitando as condições comerciais acordadas entre as partes.',
        '1.5. O serviço de Social Media compreende a gestão da comunicação digital nos canais contratados, não incluindo automaticamente atividades de gestão empresarial, consultoria comercial, estruturação de processos internos, planejamento de eventos, campanhas institucionais especiais ou gestão de tráfego pago.',
        '1.6. A contratação não implica disponibilidade ilimitada da CONTRATADA, ficando as atividades restritas ao escopo e às condições estabelecidas neste instrumento.',
        '1.7. Demandas adicionais ou atividades não previstas expressamente neste contrato poderão ser orçadas separadamente, mediante aprovação prévia da CONTRATANTE.',
      ],
    },
    {
      title: 'CLÁUSULA 2ª — DO PLANEJAMENTO, EXECUÇÃO E ENTREGA DOS SERVIÇOS',
      paragraphs: [
        '2.1. A CONTRATADA será responsável pela elaboração do planejamento estratégico mensal de conteúdo, considerando os objetivos da marca, o público-alvo, o posicionamento, as necessidades de comunicação e as oportunidades identificadas.',
        '2.2. O planejamento mensal será encaminhado à CONTRATANTE até o 5º (quinto) dia útil de cada mês, contemplando as pautas, formatos, direcionamentos e demais informações necessárias à organização do calendário editorial.',
        '2.3. A produção dos conteúdos poderá compreender textos, roteiros, peças gráficas, fotografias, vídeos e demais formatos compatíveis com as plataformas contratadas e com o planejamento aprovado.',
        '2.4. As atividades de captação, roteirização, direção e edição de fotos e vídeos serão realizadas conforme cronograma previamente alinhado entre as partes.',
        '2.5. Os materiais audiovisuais resultantes das captações serão entregues em até 48 (quarenta e oito) horas após a realização da respectiva gravação.',
        '2.6. As entregas serão disponibilizadas por meio de pasta compartilhada no Google Drive e encaminhadas à CONTRATANTE pelo WhatsApp, em formato de mídia ou documento, conforme os formatos disponibilizados pela agência.',
        '2.7. A CONTRATANTE terá o prazo de até 24 (vinte e quatro) horas, contado do recebimento dos materiais, para analisar, aprovar ou solicitar ajustes.',
        '2.8. As solicitações de alteração deverão ser encaminhadas de maneira objetiva e consolidada, respeitando o planejamento, o direcionamento estratégico e o escopo originalmente aprovado.',
        '2.9. Alterações que impliquem mudança substancial de conceito, roteiro, direcionamento criativo ou finalidade do material poderão ser consideradas demandas adicionais, sujeitas à avaliação e orçamento complementar.',
        '2.10. A ausência de manifestação dentro do prazo de aprovação não autoriza automaticamente a publicação de conteúdos em nome da CONTRATANTE. A CONTRATADA poderá reprogramar as entregas e publicações, preservando a organização do calendário editorial.',
        '2.11. Os relatórios de métricas e desempenho serão encaminhados até o dia 2 (dois) do mês subsequente ao período analisado, observada a disponibilidade, atualização e acessibilidade dos dados fornecidos pelas plataformas digitais utilizadas.',
        '2.12. A CONTRATADA não será responsabilizada por atrasos decorrentes de indisponibilidade das plataformas, falhas de acesso, instabilidades técnicas ou limitações de ferramentas de terceiros.',
        '2.13. A publicação dos conteúdos será realizada conforme a responsabilidade previamente estabelecida entre as partes:',
        `RESPONSÁVEL PELA PUBLICAÇÃO: ${v.responsavelPub}.`,
        '2.14. Quando a publicação estiver sob responsabilidade da CONTRATADA, a CONTRATANTE deverá disponibilizar os acessos e permissões necessários, bem como realizar as aprovações dentro dos prazos acordados.',
      ],
    },
    {
      title: 'CLÁUSULA 3ª — DO PRAZO E DA VIGÊNCIA',
      paragraphs: [
        `3.1. O presente contrato terá duração de ${v.prazoContratual} meses, com início em ${v.dataInicio} e término previsto para ${v.dataTermino}.`,
        '3.2. A renovação poderá ocorrer mediante manifestação expressa das partes, podendo ser formalizada por termo aditivo ou novo instrumento contratual.',
        `3.3. Qualquer uma das partes poderá solicitar a rescisão contratual mediante comunicação formal por escrito, respeitando o prazo mínimo de ${v.avisoPrevio} dias de antecedência.`,
        '3.4. A continuidade da prestação dos serviços durante o período de aviso prévio dependerá do cumprimento das obrigações contratuais e financeiras de ambas as partes.',
        '3.5. A rescisão não desobriga as partes do cumprimento das obrigações vencidas ou constituídas durante a vigência do contrato.',
      ],
    },
    {
      title: 'CLÁUSULA 4ª — DA RESCISÃO ANTECIPADA E PENALIDADES',
      paragraphs: [
        '4.1. Em caso de rescisão antecipada e imotivada por iniciativa da CONTRATANTE, durante o período de vigência contratual, será devida multa compensatória equivalente a 20% (vinte por cento) do valor correspondente aos meses restantes do contrato.',
        '4.2. O cálculo da multa observará a seguinte fórmula:',
        'Valor mensal contratado × quantidade de meses restantes × 20%.',
        '4.3. A multa não será aplicada quando a rescisão decorrer de descumprimento contratual comprovado por parte da CONTRATADA ou de outra hipótese legal que justifique o encerramento sem penalidade.',
        '4.4. Em qualquer hipótese de encerramento, permanecerão devidos os valores vencidos, os serviços efetivamente prestados e as despesas previamente aprovadas e realizadas até a data da rescisão.',
        '4.5. Em caso de rescisão por iniciativa da CONTRATADA, esta deverá comunicar previamente a CONTRATANTE, respeitando o aviso prévio estabelecido neste instrumento, e realizar o encerramento organizado das atividades.',
        '4.6. Caso a CONTRATADA encerre a prestação dos serviços após o recebimento antecipado de valores referentes a períodos não executados, deverá realizar a restituição proporcional dos valores correspondentes, observadas as obrigações pendentes e os serviços efetivamente prestados.',
        '4.7. O descumprimento de obrigações contratuais deverá ser comunicado formalmente à parte responsável, concedendo-se prazo razoável para regularização, quando cabível, antes da adoção das medidas de rescisão.',
      ],
    },
    {
      title: 'CLÁUSULA 5ª — DA EXECUÇÃO, REPROGRAMAÇÃO E COMPENSAÇÃO DE DEMANDAS',
      paragraphs: [
        '5.1. As demandas previstas serão executadas dentro do mês vigente, conforme planejamento e cronograma previamente alinhados entre as partes.',
        '5.2. Caso ocorra a não execução total ou parcial das demandas por responsabilidade exclusiva da CONTRATADA, as entregas pendentes poderão ser convertidas em crédito operacional de demanda, a ser executado no mês subsequente ou em prazo acordado entre as partes, sem custo adicional.',
        '5.3. O crédito operacional corresponde exclusivamente ao saldo de entregas contratadas e não executadas, não possuindo natureza de crédito financeiro, abatimento, reembolso ou desconto automático sobre os valores contratuais.',
        '5.4. A utilização dos créditos deverá respeitar o escopo originalmente contratado, a capacidade operacional e agenda da CONTRATADA, o prazo máximo de utilização e a necessidade de alinhamento prévio entre as partes.',
        '5.5. Os créditos operacionais terão validade máxima de 60 (sessenta) dias, contados do período em que a entrega deveria ter sido executada, salvo acordo formal em sentido contrário.',
        '5.6. Os créditos não poderão ser transferidos, convertidos em valores financeiros, utilizados fora do escopo contratado ou cedidos a terceiros.',
        '5.7. A existência de créditos operacionais não implicará suspensão, isenção ou postergação automática dos pagamentos mensais.',
        '5.8. Caso a não execução das demandas decorra de responsabilidade da CONTRATANTE, incluindo ausência de envio de materiais, atrasos em aprovações, falta de informações ou descumprimento de prazos acordados, as entregas poderão ser reprogramadas conforme disponibilidade da CONTRATADA, permanecendo devido o pagamento integral do período contratado.',
        '5.9. A execução das demandas depende da colaboração ativa da CONTRATANTE, que deverá fornecer os insumos, informações, acessos e aprovações necessários dentro dos prazos estabelecidos.',
        '5.10. As demandas reprogramadas estarão sujeitas à disponibilidade de agenda da CONTRATADA e serão organizadas conforme as prioridades do cronograma vigente.',
        '5.11. As regras desta cláusula não afastam eventual direito de reembolso, abatimento ou reparação quando legalmente aplicável.',
      ],
    },
    {
      title: 'CLÁUSULA 6ª — DA REMUNERAÇÃO E DAS CONDIÇÕES DE PAGAMENTO',
      paragraphs: [
        `6.1. Pela prestação dos serviços descritos neste instrumento, a CONTRATANTE pagará à CONTRATADA o valor de R$ ${v.val.numeric} (${v.val.words}), com periodicidade ${v.periodicidade}, mediante vencimento no dia ${v.diaVenc} de cada período contratado.`,
        `6.2. O primeiro pagamento será realizado em ${v.primeiroPg}, iniciando-se a prestação dos serviços conforme a data estabelecida na Cláusula 3ª.`,
        `6.3. O pagamento poderá ser realizado por PIX, transferência bancária, boleto ou outro meio previamente acordado entre as partes (${v.condPg}).`,
        '6.4. Em caso de atraso no pagamento, será concedido prazo de tolerância de até 15 (quinze) dias corridos, sem incidência de encargos, desde que não haja reincidência.',
        '6.5. Após o prazo de tolerância, incidirá multa moratória de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês, calculados proporcionalmente aos dias de atraso.',
        '6.6. O atraso superior a 30 (trinta) dias autoriza a CONTRATADA, mediante comunicação prévia, a suspender temporariamente a execução dos serviços até a regularização integral dos valores pendentes.',
        '6.7. A suspensão dos serviços por inadimplência poderá ocasionar a reprogramação das entregas, sem obrigação de manutenção dos prazos originalmente estabelecidos.',
        '6.8. A retomada das atividades estará condicionada à regularização financeira e à reorganização do cronograma de execução, conforme disponibilidade operacional da CONTRATADA.',
        '6.9. Despesas extraordinárias e serviços adicionais não estão incluídos na remuneração mensal, salvo quando expressamente previstos neste instrumento.',
      ],
    },
    {
      title: 'CLÁUSULA 7ª — DAS OBRIGAÇÕES DA CONTRATANTE',
      paragraphs: [
        '7.1. São obrigações da CONTRATANTE:',
        'I. Fornecer todas as informações, documentos, materiais e acessos necessários à execução dos serviços;',
        'II. Disponibilizar informações institucionais, comerciais e operacionais que permitam o desenvolvimento adequado das estratégias de conteúdo;',
        'III. Garantir a veracidade e a regularidade dos materiais e informações fornecidos à CONTRATADA;',
        'IV. Possuir autorização para utilização de imagens, marcas, documentos e demais materiais de terceiros encaminhados para produção de conteúdo;',
        'V. Realizar a análise e aprovação dos materiais dentro dos prazos estabelecidos neste instrumento;',
        'VI. Comparecer às reuniões previamente agendadas ou comunicar eventual impossibilidade com antecedência mínima de 24 (vinte e quatro) horas;',
        'VII. Efetuar os pagamentos nos valores e prazos acordados;',
        'VIII. Informar alterações relevantes em seus serviços, produtos, funcionamento, posicionamento ou condições comerciais que possam interferir na comunicação;',
        'IX. Designar um responsável pelo contato, acompanhamento e aprovação das demandas, quando aplicável;',
        'X. Manter os acessos e permissões necessários às plataformas digitais utilizadas na prestação dos serviços.',
        '7.2. A CONTRATANTE será responsável pelas informações comerciais, técnicas, institucionais e publicitárias fornecidas à CONTRATADA, incluindo a veracidade de alegações, condições de ofertas e informações sobre produtos e serviços.',
        '7.3. A CONTRATANTE deverá observar os prazos de envio de materiais e informações, reconhecendo que atrasos poderão comprometer o cronograma de produção, aprovação e publicação.',
        '7.4. As despesas extraordinárias necessárias à execução dos serviços, incluindo deslocamentos, viagens, hospedagem, impressão, contratação de equipe adicional e aquisição de materiais específicos, serão previamente apresentadas para aprovação da CONTRATANTE e custeadas por esta.',
      ],
    },
    {
      title: 'CLÁUSULA 8ª — DAS OBRIGAÇÕES DA CONTRATADA',
      paragraphs: [
        '8.1. São obrigações da CONTRATADA:',
        'I. Executar os serviços conforme o escopo contratado e as diretrizes estratégicas estabelecidas;',
        'II. Elaborar e apresentar o planejamento mensal de conteúdo nos prazos previstos;',
        'III. Realizar as atividades de produção, captação, roteirização, direção e edição de acordo com o cronograma acordado;',
        'IV. Encaminhar os materiais para aprovação da CONTRATANTE pelos canais de comunicação estabelecidos;',
        'V. Acompanhar os resultados das ações de comunicação e apresentar relatórios quando previstos no escopo;',
        'VI. Manter comunicação profissional e transparente durante a execução contratual;',
        'VII. Preservar a confidencialidade das informações recebidas;',
        'VIII. Informar à CONTRATANTE eventuais impedimentos técnicos ou operacionais que possam comprometer a execução dos serviços;',
        'IX. Zelar pela qualidade técnica e criativa das entregas, observando os padrões profissionais da agência;',
        'X. Cumprir as disposições legais aplicáveis à prestação dos serviços.',
        '8.2. A CONTRATADA possui autonomia técnica e criativa para desenvolver estratégias, propostas e materiais de comunicação, respeitando o posicionamento, as diretrizes e os objetivos previamente alinhados com a CONTRATANTE.',
        '8.3. A CONTRATADA poderá organizar sua equipe e distribuir internamente as atividades necessárias à execução dos serviços, permanecendo responsável pelo cumprimento das obrigações assumidas neste contrato.',
        '8.4. A CONTRATADA não será responsável por falhas, bloqueios, indisponibilidades ou alterações promovidas por plataformas digitais, ferramentas de terceiros ou serviços externos que estejam fora de seu controle.',
      ],
    },
    {
      title: 'CLÁUSULA 9ª — DOS LIMITES DA PRESTAÇÃO DE SERVIÇOS E DA AUSÊNCIA DE GARANTIA DE RESULTADOS',
      paragraphs: [
        '9.1. A CONTRATADA assume a obrigação de executar os serviços contratados com diligência, qualidade técnica e observância das estratégias estabelecidas, caracterizando-se a prestação como obrigação de meio, e não de resultado.',
        '9.2. A CONTRATADA não garante resultados comerciais, financeiros ou quantitativos específicos, incluindo faturamento, vendas, conversões, alcance, engajamento, crescimento de seguidores ou geração de oportunidades comerciais.',
        '9.3. Os resultados das ações de comunicação dependem de fatores diversos, incluindo condições de mercado, qualidade dos produtos e serviços, atendimento, preços, concorrência, comportamento do público e funcionamento das plataformas.',
        '9.4. A prestação dos serviços não contempla atendimento comercial direto aos clientes da CONTRATANTE, fechamento de vendas, negociação, suporte técnico de produtos ou serviços, SAC ou gerenciamento de reclamações, salvo contratação expressa dessas atividades.',
        '9.5. A gestão de comunidade limita-se ao acompanhamento das interações e às respostas a comentários e manifestações compatíveis com as diretrizes de comunicação previamente estabelecidas.',
        '9.6. Não estão incluídos neste contrato, salvo contratação expressa:',
        'I. Gestão de tráfego pago e investimento publicitário;',
        'II. Planejamento e execução de campanhas institucionais especiais;',
        'III. Organização e execução de eventos;',
        'IV. Estruturação de processos administrativos e comerciais;',
        'V. Consultoria empresarial;',
        'VI. Desenvolvimento de identidade visual completa ou rebranding;',
        'VII. Serviços extraordinários de produção audiovisual.',
      ],
    },
    {
      title: 'CLÁUSULA 10ª — DA PROPRIEDADE INTELECTUAL E DOS DIREITOS AUTORAIS',
      paragraphs: [
        '10.1. Os materiais finais desenvolvidos pela CONTRATADA especificamente para a CONTRATANTE poderão ser utilizados por esta para as finalidades relacionadas à contratação, após a quitação integral dos valores correspondentes.',
        '10.2. A autorização de utilização dos materiais finais não implica transferência automática da titularidade dos métodos, processos, estruturas estratégicas, modelos de trabalho, ferramentas, conhecimentos técnicos e materiais preexistentes da CONTRATADA.',
        '10.3. Não estão incluídos na entrega regular, salvo previsão expressa ou contratação adicional:',
        'I. Arquivos editáveis e projetos abertos;',
        'II. Arquivos brutos de captação;',
        'III. Templates e estruturas internas de produção;',
        'IV. Arquivos-fonte de identidade visual e peças gráficas;',
        'V. Materiais de planejamento e documentos internos da agência;',
        'VI. Outros elementos técnicos utilizados na produção dos materiais finais.',
        '10.4. A utilização de músicas, imagens, fontes, vídeos, fotografias e demais recursos de terceiros estará sujeita às respectivas licenças e condições de uso.',
        '10.5. A entrega dos materiais finais não implica obrigação de fornecimento dos arquivos originais de produção, salvo quando expressamente acordado entre as partes.',
      ],
    },
    {
      title: 'CLÁUSULA 11ª — DO USO DE IMAGEM E PORTFÓLIO',
      paragraphs: [
        '11.1. A utilização dos trabalhos desenvolvidos pela CONTRATADA em seu portfólio, redes sociais, apresentações comerciais e materiais de divulgação institucional dependerá da autorização expressa da CONTRATANTE, conforme opção abaixo:',
        ...v.portfolioLines,
        '11.2. A autorização, quando concedida, não implica obrigação de pagamento adicional, desde que respeitados os limites estabelecidos nesta cláusula.',
        '11.3. A utilização de imagens de pessoas, colaboradores, clientes, parceiros ou terceiros dependerá das respectivas autorizações legais.',
        '11.4. A CONTRATADA compromete-se a não divulgar informações confidenciais, dados pessoais protegidos ou informações comerciais não autorizadas sob a justificativa de utilização em portfólio.',
      ],
    },
    {
      title: 'CLÁUSULA 12ª — DA CONFIDENCIALIDADE E PROTEÇÃO DE DADOS PESSOAIS',
      paragraphs: [
        '12.1. As partes comprometem-se a manter sigilo sobre informações comerciais, financeiras, estratégicas, operacionais, documentos, processos internos e demais informações confidenciais às quais tenham acesso em razão deste contrato.',
        '12.2. As informações confidenciais não poderão ser divulgadas, compartilhadas ou utilizadas para finalidades distintas da execução contratual, salvo mediante autorização da parte responsável ou por obrigação legal.',
        '12.3. As partes comprometem-se a observar a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD), tratando os dados pessoais envolvidos na relação contratual de acordo com as finalidades legítimas e as bases legais aplicáveis.',
        '12.4. Quando a CONTRATADA realizar tratamento de dados pessoais em nome da CONTRATANTE, as partes deverão observar as respectivas responsabilidades e instruções relacionadas ao tratamento, respeitando a legislação vigente.',
        '12.5. A CONTRATADA compromete-se a adotar medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra acessos não autorizados, perda, alteração, divulgação ou qualquer forma de tratamento inadequado.',
        '12.6. Eventuais incidentes de segurança que possam comprometer dados pessoais tratados no âmbito deste contrato deverão ser comunicados à outra parte em prazo razoável, observadas as obrigações legais e regulamentares aplicáveis.',
        '12.7. Ao término da relação contratual, os dados pessoais serão tratados conforme as finalidades, obrigações legais e prazos de conservação aplicáveis.',
        '12.8. As obrigações de confidencialidade permanecerão vigentes mesmo após o encerramento deste contrato.',
      ],
    },
    {
      title: 'CLÁUSULA 13ª — DO CASO FORTUITO E DA FORÇA MAIOR',
      paragraphs: [
        '13.1. Nenhuma das partes será responsabilizada pelo descumprimento de obrigações diretamente decorrente de eventos imprevisíveis ou inevitáveis que caracterizem caso fortuito ou força maior, nos termos da legislação aplicável.',
        '13.2. A parte afetada deverá comunicar a outra parte sobre a ocorrência do evento, informando, sempre que possível, seus impactos e a previsão de regularização das atividades.',
        '13.3. As obrigações diretamente afetadas poderão ser reprogramadas mediante alinhamento entre as partes, preservadas as responsabilidades legalmente aplicáveis.',
        '13.4. Caso a situação impossibilite a continuidade da prestação dos serviços por período prolongado, as partes poderão negociar a suspensão ou o encerramento contratual.',
      ],
    },
    {
      title: 'CLÁUSULA 14ª — DAS DISPOSIÇÕES GERAIS',
      paragraphs: [
        '14.1. O presente contrato representa o acordo integral entre as partes em relação aos serviços nele descritos.',
        '14.2. Qualquer alteração de escopo, valores, prazos, condições ou obrigações deverá ser formalizada por escrito, mediante termo aditivo ou outro instrumento de concordância expressa entre as partes.',
        '14.3. A tolerância de qualquer das partes quanto ao descumprimento de obrigações contratuais não constituirá renúncia de direitos ou alteração das condições estabelecidas.',
        '14.4. As partes reconhecem que a relação estabelecida por este instrumento possui natureza de prestação de serviços, sem formação de vínculo empregatício, societário ou de representação comercial entre elas.',
        '14.5. As comunicações relacionadas à execução contratual poderão ser realizadas por e-mail ou WhatsApp, utilizando os contatos informados na qualificação das partes.',
        '14.6. As partes comprometem-se a buscar inicialmente a resolução consensual de eventuais divergências decorrentes deste instrumento, por meio de negociação direta ou mediação.',
        '14.7. Não sendo possível solucionar a controvérsia de forma consensual, serão adotadas as medidas judiciais cabíveis, observadas as regras legais de competência e proteção aplicáveis.',
        '14.8. O presente instrumento poderá ser assinado física ou eletronicamente, reconhecendo as partes a validade jurídica das assinaturas realizadas por meios eletrônicos admitidos pela legislação brasileira.',
        ...(ctx.notes?.trim() ? [`14.9. Observações específicas acordadas entre as partes: ${ctx.notes.trim()}`] : []),
      ],
    },
    {
      title: 'CLÁUSULA 15ª — DO FORO',
      paragraphs: [
        `15.1. Para dirimir eventuais controvérsias decorrentes deste contrato, as partes elegem o foro da Comarca de ${v.forumCity}, observadas as regras legais de competência e eventual proteção de foro aplicável à CONTRATANTE.`,
      ],
    },
  ]

  return {
    modelLabel: 'CONTRATO 02 — SOCIAL MEDIA NUAGE',
    subtitle: 'Prestação de serviços de gestão de redes sociais e produção de conteúdo',
    title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE SOCIAL MEDIA',
    contratanteLine: v.contratanteLine,
    contratadaLine: v.contratadaLine,
    preamble: 'As partes acima identificadas resolvem celebrar o presente Contrato de Prestação de Serviços de Social Media, mediante as cláusulas e condições seguintes.',
    closingLine: 'E, por estarem de acordo com as condições estabelecidas, as partes assinam o presente instrumento, juntamente com duas testemunhas, para que produza seus efeitos jurídicos e legais.',
    dateLine: `${v.forumCity}, ______ de ______________________ de ________.`,
    clauses,
    forumCity: v.forumCity,
  }
}

// ======================================================================
// CONTRATO 03 — STUDIO NUAGE (texto integral, Cláusulas 1ª a 16ª)
// ======================================================================
function buildStudio(ctx: ContractDocContext): ContractDocument {
  const v = vars(ctx)
  const clauses: ContractClause[] = [
    {
      title: 'CLÁUSULA 1ª — DO OBJETO DO CONTRATO',
      paragraphs: [
        '1.1. O presente contrato tem por objeto a prestação de serviços de produção audiovisual pela CONTRATADA à CONTRATANTE, compreendendo planejamento criativo, desenvolvimento de roteiros, captação, direção e edição de conteúdos em vídeo destinados à comunicação institucional, comercial ou promocional da CONTRATANTE.',
        '1.2. O escopo contratado compreende as seguintes atividades:',
        'I. Realização de 01 (uma) reunião de brainstorm para alinhamento criativo e definição das ideias e direcionamentos dos conteúdos;',
        'II. Desenvolvimento de roteiros para os conteúdos audiovisuais;',
        'III. Captação de imagens e vídeos;',
        'IV. Direção audiovisual durante as gravações;',
        'V. Edição, finalização e entrega dos materiais audiovisuais.',
        '1.3. Cada vídeo contratado terá duração máxima de 01 (um) minuto e 30 (trinta) segundos.',
        '1.4. Será realizada até 01 (uma) captação por semana, conforme cronograma previamente acordado entre as partes.',
        `1.5. A quantidade de vídeos contratados será de ${v.qtdVideos}, conforme o pacote ou condição comercial estabelecida entre as partes.`,
        `1.6. As gravações serão realizadas em ${v.localCaptacao}, conforme agendamento e disponibilidade de ambas as partes.`,
        '1.7. A contratação contempla exclusivamente os serviços descritos neste instrumento, não incluindo automaticamente gestão de redes sociais, planejamento mensal de conteúdo, publicação de materiais, gestão de comunidade, tráfego pago ou consultoria de comunicação.',
        '1.8. Serviços adicionais, como captações extraordinárias, vídeos com duração superior à estabelecida, produções especiais, locações, contratação de atores, modelos, profissionais externos, equipamentos específicos, animações avançadas ou demais recursos não previstos no escopo, poderão ser orçados separadamente, mediante aprovação prévia da CONTRATANTE.',
      ],
    },
    {
      title: 'CLÁUSULA 2ª — DO PLANEJAMENTO, CAPTAÇÃO E PRODUÇÃO',
      paragraphs: [
        '2.1. A CONTRATADA realizará 01 (uma) reunião de brainstorm com a CONTRATANTE, destinada ao levantamento de ideias, identificação de objetivos, definição de temas e alinhamento da proposta criativa dos conteúdos.',
        '2.2. A partir das informações obtidas na reunião, a CONTRATADA desenvolverá os direcionamentos e roteiros necessários à produção dos materiais contratados.',
        '2.3. A CONTRATANTE deverá disponibilizar as informações, referências, materiais e demais elementos necessários à construção dos roteiros e à execução das gravações.',
        '2.4. As captações serão realizadas mediante agendamento prévio, respeitando o limite de até 01 (uma) captação por semana e a disponibilidade operacional da CONTRATADA.',
        '2.5. As datas, horários e locais das gravações serão definidos em comum acordo entre as partes.',
        '2.6. A CONTRATANTE deverá comparecer às gravações nos horários estabelecidos, garantindo a disponibilidade das pessoas, ambientes, produtos e demais elementos necessários à produção.',
        '2.7. A ausência da CONTRATANTE ou de pessoas cuja participação seja indispensável à gravação, sem comunicação prévia, poderá ocasionar o reagendamento da captação, sujeito à disponibilidade de agenda da CONTRATADA.',
        '2.8. Alterações substanciais de roteiro, conceito ou direcionamento criativo após a aprovação e início da produção poderão ser consideradas demandas adicionais, sujeitas à avaliação e orçamento complementar.',
      ],
    },
    {
      title: 'CLÁUSULA 3ª — DOS PRAZOS E DAS ENTREGAS',
      paragraphs: [
        '3.1. Os materiais audiovisuais resultantes de cada captação serão entregues em até 48 (quarenta e oito) horas após a realização da respectiva gravação.',
        '3.2. As entregas serão disponibilizadas por meio de pasta compartilhada no Google Drive e encaminhadas à CONTRATANTE pelo WhatsApp, em formato de mídia ou documento, conforme os formatos disponibilizados pela agência.',
        '3.3. A CONTRATANTE terá o prazo máximo de 24 (vinte e quatro) horas, contado do recebimento de cada material, para realizar sua aprovação ou encaminhar solicitações de alteração.',
        '3.4. As solicitações de alteração deverão ser apresentadas de maneira objetiva e consolidada, dentro do prazo estabelecido, respeitando o roteiro, a proposta criativa e as condições originalmente acordadas.',
        '3.5. A ausência de manifestação da CONTRATANTE dentro do prazo de 24 (vinte e quatro) horas será considerada aprovação do material para fins de encerramento da etapa de edição.',
        '3.6. Após o encerramento do prazo de aprovação, a CONTRATADA não terá obrigação de realizar novas alterações no conteúdo entregue. Solicitações posteriores poderão ser avaliadas como serviços adicionais, sujeitos à disponibilidade operacional e orçamento complementar.',
        '3.7. As alterações solicitadas deverão respeitar o conceito, o roteiro e o direcionamento criativo previamente aprovados, não abrangendo mudanças substanciais de proposta ou refação integral do material.',
        '3.8. A CONTRATADA não será responsabilizada por atrasos decorrentes da ausência de informações, materiais, aprovações ou demais elementos que dependam da CONTRATANTE.',
      ],
    },
    {
      title: 'CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATANTE',
      paragraphs: [
        '4.1. São obrigações da CONTRATANTE:',
        'I. Fornecer as informações necessárias à elaboração dos roteiros e à produção dos conteúdos;',
        'II. Participar da reunião de brainstorm e dos alinhamentos necessários à execução dos serviços;',
        'III. Disponibilizar os materiais, produtos, ambientes e pessoas necessários às gravações;',
        'IV. Comparecer às captações previamente agendadas ou comunicar eventual impossibilidade com antecedência mínima de 24 (vinte e quatro) horas;',
        'V. Garantir que possui autorização para utilização de imagens, marcas, documentos e demais materiais de terceiros fornecidos à CONTRATADA;',
        'VI. Realizar a análise e aprovação dos materiais dentro do prazo de 24 (vinte e quatro) horas;',
        'VII. Encaminhar solicitações de alterações de maneira objetiva e consolidada;',
        'VIII. Efetuar os pagamentos nos valores e prazos acordados;',
        'IX. Arcar com despesas extraordinárias previamente aprovadas, quando necessárias à produção;',
        'X. Informar eventuais alterações de agenda ou condições que possam interferir no cronograma de gravação.',
        '4.2. A CONTRATANTE será responsável pelas informações comerciais, técnicas, institucionais e publicitárias fornecidas à CONTRATADA para elaboração dos roteiros e produção dos conteúdos.',
        '4.3. A CONTRATANTE deverá garantir que as pessoas que participarem das gravações tenham ciência e autorizem a utilização de sua imagem e voz para as finalidades previstas, quando necessário.',
        '4.4. Despesas extraordinárias relacionadas à produção, incluindo deslocamentos, viagens, hospedagem, locações, alimentação de equipe, contratação de profissionais adicionais e aquisição de materiais específicos, serão previamente apresentadas para aprovação da CONTRATANTE e custeadas por esta.',
      ],
    },
    {
      title: 'CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATADA',
      paragraphs: [
        '5.1. São obrigações da CONTRATADA:',
        'I. Realizar a reunião de brainstorm prevista neste contrato;',
        'II. Desenvolver os roteiros e direcionamentos criativos dos conteúdos;',
        'III. Realizar as captações conforme o cronograma acordado;',
        'IV. Executar a direção e produção audiovisual dos materiais;',
        'V. Realizar a edição e finalização dos vídeos contratados;',
        'VI. Disponibilizar os materiais dentro dos prazos estabelecidos;',
        'VII. Encaminhar os conteúdos para aprovação pelos canais de comunicação acordados;',
        'VIII. Manter comunicação profissional e transparente durante a execução contratual;',
        'IX. Preservar a confidencialidade das informações recebidas;',
        'X. Informar à CONTRATANTE eventuais impedimentos técnicos ou operacionais que possam comprometer a execução dos serviços;',
        'XI. Zelar pela qualidade técnica e criativa das entregas, observando os padrões profissionais da agência.',
        '5.2. A CONTRATADA possui autonomia técnica e criativa para definir os métodos de produção, enquadramentos, direção, edição e demais aspectos técnicos dos materiais, respeitando o conceito e os direcionamentos previamente alinhados.',
        '5.3. A CONTRATADA poderá organizar sua equipe e distribuir internamente as atividades necessárias à execução dos serviços, permanecendo responsável pelo cumprimento das obrigações assumidas neste contrato.',
      ],
    },
    {
      title: 'CLÁUSULA 6ª — DO PRAZO E DA VIGÊNCIA',
      paragraphs: [
        `6.1. O presente contrato terá duração de ${v.prazoContratual} meses, com início em ${v.dataInicio} e término previsto para ${v.dataTermino}.`,
        '6.2. A renovação poderá ocorrer mediante manifestação expressa das partes, podendo ser formalizada por termo aditivo ou novo instrumento contratual.',
        `6.3. Qualquer uma das partes poderá solicitar a rescisão contratual mediante comunicação formal por escrito, respeitando o prazo mínimo de ${v.avisoPrevio} dias de antecedência.`,
        '6.4. A continuidade da prestação dos serviços durante o período de aviso prévio dependerá do cumprimento das obrigações contratuais e financeiras de ambas as partes.',
        '6.5. A rescisão não desobriga as partes do cumprimento das obrigações vencidas ou constituídas durante a vigência do contrato.',
      ],
    },
    {
      title: 'CLÁUSULA 7ª — DA RESCISÃO ANTECIPADA E PENALIDADES',
      paragraphs: [
        '7.1. Em caso de rescisão antecipada e imotivada por iniciativa da CONTRATANTE, durante o período de vigência contratual, será devida multa compensatória equivalente a 20% (vinte por cento) do valor correspondente aos meses restantes do contrato.',
        '7.2. O cálculo da multa observará a seguinte fórmula:',
        'Valor mensal contratado × quantidade de meses restantes × 20%.',
        '7.3. A multa não será aplicada quando a rescisão decorrer de descumprimento contratual comprovado por parte da CONTRATADA ou de outra hipótese legal que justifique o encerramento sem penalidade.',
        '7.4. Em qualquer hipótese de encerramento, permanecerão devidos os valores vencidos, os serviços efetivamente prestados e as despesas previamente aprovadas e realizadas até a data da rescisão.',
        '7.5. Em caso de rescisão por iniciativa da CONTRATADA, esta deverá comunicar previamente a CONTRATANTE, respeitando o aviso prévio estabelecido neste instrumento, e realizar o encerramento organizado das atividades.',
        '7.6. Caso a CONTRATADA encerre a prestação dos serviços após o recebimento antecipado de valores referentes a períodos não executados, deverá realizar a restituição proporcional dos valores correspondentes, observadas as obrigações pendentes e os serviços efetivamente prestados.',
        '7.7. O descumprimento de obrigações contratuais deverá ser comunicado formalmente à parte responsável, concedendo-se prazo razoável para regularização, quando cabível, antes da adoção das medidas de rescisão.',
      ],
    },
    {
      title: 'CLÁUSULA 8ª — DA EXECUÇÃO, REPROGRAMAÇÃO E COMPENSAÇÃO DE DEMANDAS',
      paragraphs: [
        '8.1. As captações e entregas previstas serão executadas conforme cronograma previamente alinhado entre as partes.',
        '8.2. Caso ocorra a não execução de uma captação ou entrega por responsabilidade exclusiva da CONTRATADA, a atividade pendente poderá ser reprogramada sem custo adicional, em data acordada entre as partes.',
        '8.3. As reprogramações deverão respeitar o escopo originalmente contratado, o limite de até uma captação por semana e a disponibilidade operacional da CONTRATADA.',
        '8.4. Caso a não execução de uma captação decorra de responsabilidade da CONTRATANTE, incluindo ausência, indisponibilidade, falta de materiais, informações ou pessoas necessárias à gravação, a atividade poderá ser reprogramada conforme disponibilidade de agenda da CONTRATADA.',
        '8.5. A impossibilidade de realização de uma captação por responsabilidade da CONTRATANTE não implicará automaticamente suspensão, desconto ou abatimento da remuneração contratual.',
        '8.6. As entregas reprogramadas estarão sujeitas à organização do cronograma vigente e não poderão ser transferidas para terceiros ou convertidas em valores financeiros, salvo acordo formal entre as partes.',
        '8.7. As regras desta cláusula não afastam eventual direito de reembolso, abatimento ou reparação quando legalmente aplicável.',
      ],
    },
    {
      title: 'CLÁUSULA 9ª — DA REMUNERAÇÃO E DAS CONDIÇÕES DE PAGAMENTO',
      paragraphs: [
        `9.1. Pela prestação dos serviços descritos neste instrumento, a CONTRATANTE pagará à CONTRATADA o valor de R$ ${v.val.numeric} (${v.val.words}), com periodicidade ${v.periodicidade}, referente ao pacote de produção audiovisual contratado.`,
        `9.2. A contratação compreende ${v.qtdVideos} vídeos, conforme as condições comerciais acordadas entre as partes.`,
        `9.3. O pagamento será realizado conforme as seguintes condições: ${v.condPg}.`,
        `9.4. O primeiro pagamento será realizado em ${v.primeiroPg}, observadas as condições acordadas para início da prestação dos serviços.`,
        '9.5. O pagamento poderá ser realizado por PIX, transferência bancária, boleto ou outro meio previamente acordado entre as partes.',
        '9.6. Em caso de atraso no pagamento, será concedido prazo de tolerância de até 15 (quinze) dias corridos, sem incidência de encargos, desde que não haja reincidência.',
        '9.7. Após o prazo de tolerância, incidirá multa moratória de 2% (dois por cento) sobre o valor em atraso, acrescida de juros de mora de 1% (um por cento) ao mês, calculados proporcionalmente aos dias de atraso.',
        '9.8. O atraso superior a 30 (trinta) dias autoriza a CONTRATADA, mediante comunicação prévia, a suspender temporariamente a execução dos serviços até a regularização integral dos valores pendentes.',
        '9.9. A suspensão dos serviços por inadimplência poderá ocasionar a reprogramação das captações e entregas, sem obrigação de manutenção dos prazos originalmente estabelecidos.',
        '9.10. Despesas extraordinárias e serviços adicionais não estão incluídos na remuneração contratada, salvo quando expressamente previstos neste instrumento.',
      ],
    },
    {
      title: 'CLÁUSULA 10ª — DOS LIMITES DA PRESTAÇÃO DE SERVIÇOS E DA AUSÊNCIA DE GARANTIA DE RESULTADOS',
      paragraphs: [
        '10.1. A CONTRATADA assume a obrigação de executar os serviços contratados com diligência, qualidade técnica e observância dos direcionamentos criativos estabelecidos, caracterizando-se a prestação como obrigação de meio, e não de resultado.',
        '10.2. A CONTRATADA não garante resultados comerciais, financeiros ou quantitativos específicos decorrentes da utilização dos vídeos produzidos, incluindo vendas, conversões, alcance, engajamento, crescimento de seguidores ou faturamento.',
        '10.3. Os resultados dos conteúdos dependem de fatores diversos, incluindo qualidade dos produtos e serviços, estratégia de distribuição, comportamento do público, concorrência e funcionamento das plataformas digitais.',
        '10.4. A prestação dos serviços não contempla publicação, programação ou gestão dos conteúdos nas redes sociais da CONTRATANTE, salvo contratação expressa.',
        '10.5. Também não estão incluídos neste contrato:',
        'I. Gestão de redes sociais;',
        'II. Planejamento estratégico mensal de conteúdo;',
        'III. Gestão de comunidade;',
        'IV. Gestão de tráfego pago;',
        'V. Investimento publicitário;',
        'VI. Criação de identidade visual;',
        'VII. Desenvolvimento de campanhas institucionais completas;',
        'VIII. Produções extraordinárias não previstas no escopo.',
      ],
    },
    {
      title: 'CLÁUSULA 11ª — DA PROPRIEDADE INTELECTUAL E DOS DIREITOS AUTORAIS',
      paragraphs: [
        '11.1. Os vídeos finais desenvolvidos pela CONTRATADA especificamente para a CONTRATANTE poderão ser utilizados por esta para as finalidades relacionadas à contratação, após a quitação integral dos valores correspondentes.',
        '11.2. A autorização de utilização dos vídeos finais não implica transferência automática da titularidade dos métodos, processos, estruturas de edição, modelos de trabalho, ferramentas, conhecimentos técnicos e materiais preexistentes da CONTRATADA.',
        '11.3. Não estão incluídos na entrega regular, salvo previsão expressa ou contratação adicional:',
        'I. Arquivos brutos de captação;',
        'II. Projetos editáveis de edição;',
        'III. Arquivos-fonte;',
        'IV. Templates e estruturas internas de produção;',
        'V. Materiais originais utilizados na construção dos vídeos;',
        'VI. Outros elementos técnicos utilizados na produção dos materiais finais.',
        '11.4. A utilização de músicas, imagens, fontes, vídeos, fotografias e demais recursos de terceiros estará sujeita às respectivas licenças e condições de uso.',
        '11.5. A CONTRATANTE será responsável pela utilização dos vídeos em conformidade com as licenças dos recursos empregados e com as finalidades autorizadas.',
        '11.6. A entrega dos vídeos finais não implica obrigação de fornecimento dos arquivos originais de produção, salvo quando expressamente acordado entre as partes.',
      ],
    },
    {
      title: 'CLÁUSULA 12ª — DO USO DE IMAGEM E PORTFÓLIO',
      paragraphs: [
        '12.1. A utilização dos vídeos e demais trabalhos desenvolvidos pela CONTRATADA em seu portfólio, redes sociais, apresentações comerciais e materiais de divulgação institucional dependerá da autorização expressa da CONTRATANTE, conforme opção abaixo:',
        ...v.portfolioLines,
        '12.2. A autorização, quando concedida, não implica obrigação de pagamento adicional, desde que respeitados os limites estabelecidos nesta cláusula.',
        '12.3. A utilização de imagens e vozes de pessoas que participem das gravações dependerá das respectivas autorizações legais, quando exigíveis.',
        '12.4. A CONTRATANTE será responsável por obter as autorizações necessárias das pessoas cuja participação nas gravações tenha sido organizada ou solicitada por ela, sem prejuízo das responsabilidades legais de cada parte.',
        '12.5. A CONTRATADA compromete-se a não divulgar informações confidenciais, dados pessoais protegidos ou informações comerciais não autorizadas sob a justificativa de utilização em portfólio.',
      ],
    },
    {
      title: 'CLÁUSULA 13ª — DA CONFIDENCIALIDADE E PROTEÇÃO DE DADOS PESSOAIS',
      paragraphs: [
        '13.1. As partes comprometem-se a manter sigilo sobre informações comerciais, financeiras, estratégicas, operacionais, documentos, processos internos e demais informações confidenciais às quais tenham acesso em razão deste contrato.',
        '13.2. As informações confidenciais não poderão ser divulgadas, compartilhadas ou utilizadas para finalidades distintas da execução contratual, salvo mediante autorização da parte responsável ou por obrigação legal.',
        '13.3. As partes comprometem-se a observar a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD), tratando os dados pessoais envolvidos na relação contratual de acordo com as finalidades legítimas e as bases legais aplicáveis.',
        '13.4. A CONTRATADA compromete-se a adotar medidas técnicas e administrativas razoáveis para proteger os dados pessoais contra acessos não autorizados, perda, alteração, divulgação ou qualquer forma de tratamento inadequado.',
        '13.5. Eventuais incidentes de segurança que possam comprometer dados pessoais tratados no âmbito deste contrato deverão ser comunicados à outra parte em prazo razoável, observadas as obrigações legais e regulamentares aplicáveis.',
        '13.6. Ao término da relação contratual, os dados pessoais serão tratados conforme as finalidades, obrigações legais e prazos de conservação aplicáveis.',
        '13.7. As obrigações de confidencialidade permanecerão vigentes mesmo após o encerramento deste contrato.',
      ],
    },
    {
      title: 'CLÁUSULA 14ª — DO CASO FORTUITO E DA FORÇA MAIOR',
      paragraphs: [
        '14.1. Nenhuma das partes será responsabilizada pelo descumprimento de obrigações diretamente decorrente de eventos imprevisíveis ou inevitáveis que caracterizem caso fortuito ou força maior, nos termos da legislação aplicável.',
        '14.2. A parte afetada deverá comunicar a outra parte sobre a ocorrência do evento, informando, sempre que possível, seus impactos e a previsão de regularização das atividades.',
        '14.3. As obrigações diretamente afetadas poderão ser reprogramadas mediante alinhamento entre as partes, preservadas as responsabilidades legalmente aplicáveis.',
        '14.4. Caso a situação impossibilite a continuidade da prestação dos serviços por período prolongado, as partes poderão negociar a suspensão ou o encerramento contratual.',
      ],
    },
    {
      title: 'CLÁUSULA 15ª — DAS DISPOSIÇÕES GERAIS',
      paragraphs: [
        '15.1. O presente contrato representa o acordo integral entre as partes em relação aos serviços nele descritos.',
        '15.2. Qualquer alteração de escopo, valores, prazos, condições ou obrigações deverá ser formalizada por escrito, mediante termo aditivo ou outro instrumento de concordância expressa entre as partes.',
        '15.3. A tolerância de qualquer das partes quanto ao descumprimento de obrigações contratuais não constituirá renúncia de direitos ou alteração das condições estabelecidas.',
        '15.4. As partes reconhecem que a relação estabelecida por este instrumento possui natureza de prestação de serviços, sem formação de vínculo empregatício, societário ou de representação comercial entre elas.',
        '15.5. As comunicações relacionadas à execução contratual poderão ser realizadas por e-mail ou WhatsApp, utilizando os contatos informados na qualificação das partes.',
        '15.6. As partes comprometem-se a buscar inicialmente a resolução consensual de eventuais divergências decorrentes deste instrumento, por meio de negociação direta ou mediação.',
        '15.7. Não sendo possível solucionar a controvérsia de forma consensual, serão adotadas as medidas judiciais cabíveis, observadas as regras legais de competência e proteção aplicáveis.',
        '15.8. O presente instrumento poderá ser assinado física ou eletronicamente, reconhecendo as partes a validade jurídica das assinaturas realizadas por meios eletrônicos admitidos pela legislação brasileira.',
        ...(ctx.notes?.trim() ? [`15.9. Observações específicas acordadas entre as partes: ${ctx.notes.trim()}`] : []),
      ],
    },
    {
      title: 'CLÁUSULA 16ª — DO FORO',
      paragraphs: [
        `16.1. Para dirimir eventuais controvérsias decorrentes deste contrato, as partes elegem o foro da Comarca de ${v.forumCity}, observadas as regras legais de competência e eventual proteção de foro aplicável à CONTRATANTE.`,
      ],
    },
  ]

  return {
    modelLabel: 'CONTRATO 03 — STUDIO NUAGE',
    subtitle: 'Prestação de serviços de produção audiovisual',
    title: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PRODUÇÃO AUDIOVISUAL',
    contratanteLine: v.contratanteLine,
    contratadaLine: v.contratadaLine,
    preamble: 'As partes acima identificadas resolvem celebrar o presente Contrato de Prestação de Serviços de Produção Audiovisual, mediante as cláusulas e condições seguintes.',
    closingLine: 'E, por estarem de acordo com as condições estabelecidas, as partes assinam o presente instrumento, juntamente com duas testemunhas, para que produza seus efeitos jurídicos e legais.',
    dateLine: `${v.forumCity}, ______ de ______________________ de ________.`,
    clauses,
    forumCity: v.forumCity,
  }
}

// ======================================================================
// COMPOSIÇÃO UNIFICADA (quando 2+ frentes são contratadas juntas)
// Junta todas as cláusulas e subcláusulas integrais sem omitir nenhuma regra.
// ======================================================================
function buildUnified(ctx: ContractDocContext): ContractDocument {
  const models = ctx.templates
  const hasAg = models.includes('agencia')
  const hasSm = models.includes('social_media')
  const hasSt = models.includes('studio')
  const baseAg = hasAg ? buildAgencia(ctx) : null
  const baseSm = hasSm ? buildSocialMedia(ctx) : null
  const baseSt = hasSt ? buildStudio(ctx) : null
  const primary = baseAg ?? baseSm ?? baseSt!
  const names = models.map((m) => (m === 'agencia' ? 'Agência Nuage' : m === 'social_media' ? 'Social Media' : 'Studio Nuage')).join(' + ')

  // Renumera os títulos das cláusulas em ordem sequencial mantendo o texto integral das subcláusulas de cada frente contratada
  const clauses: ContractClause[] = []
  let num = 1
  const push = (headingWithoutNumber: string, paragraphs: string[]) => {
    clauses.push({ title: `CLÁUSULA ${num}ª — ${headingWithoutNumber}`, paragraphs })
    num += 1
  }

  // Cláusula 1ª: Objetos integrais de cada frente contratada
  const objParas: string[] = []
  if (baseAg) {
    objParas.push('FRENTE 01 — AGÊNCIA NUAGE (GESTÃO INTEGRADA DA COMUNICAÇÃO):', ...baseAg.clauses[0].paragraphs)
  }
  if (baseSm) {
    objParas.push('FRENTE 02 — SOCIAL MEDIA NUAGE (GESTÃO DE REDES SOCIAIS):', ...baseSm.clauses[0].paragraphs)
  }
  if (baseSt) {
    objParas.push('FRENTE 03 — STUDIO NUAGE (PRODUÇÃO AUDIOVISUAL):', ...baseSt.clauses[0].paragraphs)
  }
  push('DO OBJETO DO CONTRATO', objParas)

  // Cláusula 2ª: Planejamento, execução, captação e entrega
  const execParas: string[] = []
  if (baseAg) execParas.push('Diretrizes Agência Nuage:', ...baseAg.clauses[1].paragraphs)
  if (baseSm) execParas.push('Diretrizes Social Media Nuage:', ...baseSm.clauses[1].paragraphs)
  if (baseSt) execParas.push('Diretrizes Studio Nuage (Planejamento, Captação e Entregas):', ...baseSt.clauses[1].paragraphs, ...baseSt.clauses[2].paragraphs)
  push('DO PLANEJAMENTO, EXECUÇÃO, CAPTAÇÃO E ENTREGA DOS SERVIÇOS', execParas)

  // Cláusula 3ª (se Agência): Tráfego pago
  if (baseAg) {
    push('DO TRÁFEGO PAGO E INVESTIMENTO PUBLICITÁRIO', baseAg.clauses[2].paragraphs)
  }

  // Demais cláusulas usando a redação integral do modelo principal (com inclusões específicas de Studio/Social Media quando aplicável)
  const v = vars(ctx)
  const docSource = baseAg ?? baseSm!
  const offset = baseAg ? 3 : 2 // índice da Cláusula de Prazo e Vigência no modelo fonte

  push('DO PRAZO E DA VIGÊNCIA', docSource.clauses[offset].paragraphs)
  push('DA RESCISÃO ANTECIPADA E PENALIDADES', docSource.clauses[offset + 1].paragraphs)
  push('DA EXECUÇÃO, REPROGRAMAÇÃO E COMPENSAÇÃO DE DEMANDAS', [
    ...docSource.clauses[offset + 2].paragraphs,
    ...(baseSt ? ['Regras específicas de captação (Studio):', ...baseSt.clauses[7].paragraphs] : []),
  ])
  push('DA REMUNERAÇÃO E DAS CONDIÇÕES DE PAGAMENTO', [
    ...docSource.clauses[offset + 3].paragraphs,
    ...(baseSt ? [`Quantitativo audiovisual contratado (Studio): ${v.qtdVideos} vídeos.`, `Condição específica do pacote audiovisual: ${v.condPg}.`] : []),
  ])
  push('DAS OBRIGAÇÕES DA CONTRATANTE', [
    ...docSource.clauses[offset + 4].paragraphs,
    ...(baseSt ? ['Autorização de imagem e voz em gravações (Studio):', ...baseSt.clauses[3].paragraphs.slice(-2)] : []),
  ])
  push('DAS OBRIGAÇÕES DA CONTRATADA', [
    ...docSource.clauses[offset + 5].paragraphs,
    ...(baseSt ? ['Autonomia audiovisual e captação (Studio):', baseSt.clauses[4].paragraphs.slice(-2)[0]] : []),
  ])
  push('DOS LIMITES DA PRESTAÇÃO DE SERVIÇOS E DA AUSÊNCIA DE GARANTIA DE RESULTADOS', docSource.clauses[offset + 6].paragraphs)
  push('DA PROPRIEDADE INTELECTUAL E DOS DIREITOS AUTORAIS', docSource.clauses[offset + 7].paragraphs)
  push('DO USO DE IMAGEM E PORTFÓLIO', docSource.clauses[offset + 8].paragraphs)
  push('DA CONFIDENCIALIDADE E PROTEÇÃO DE DADOS PESSOAIS', docSource.clauses[offset + 9].paragraphs)
  push('DO CASO FORTUITO E DA FORÇA MAIOR', docSource.clauses[offset + 10].paragraphs)
  push('DAS DISPOSIÇÕES GERAIS', docSource.clauses[offset + 11].paragraphs)
  push('DO FORO', docSource.clauses[offset + 12].paragraphs)

  return {
    modelLabel: `CONTRATO UNIFICADO — ${names.toUpperCase()}`,
    subtitle: `Prestação de serviços integrados (${names})`,
    title: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS — ${names.toUpperCase()}`,
    contratanteLine: primary.contratanteLine,
    contratadaLine: primary.contratadaLine,
    preamble: `As partes acima identificadas resolvem celebrar o presente Contrato de Prestação de Serviços (${names}), mediante as cláusulas e condições seguintes.`,
    closingLine: primary.closingLine,
    dateLine: primary.dateLine,
    clauses,
    forumCity: primary.forumCity,
  }
}

/**
 * Gera o documento jurídico integral fiel aos modelos oficiais da Nuage
 * (`Agência`, `Social Media`, `Studio` ou unificado quando múltiplos).
 */
export function buildContractDocument(ctx: ContractDocContext): ContractDocument {
  const models: ContractTemplateKey[] = ctx.templates.length ? ctx.templates : ['agencia']
  if (models.length === 1) {
    if (models[0] === 'social_media') return buildSocialMedia(ctx)
    if (models[0] === 'studio') return buildStudio(ctx)
    return buildAgencia(ctx)
  }
  return buildUnified(ctx)
}

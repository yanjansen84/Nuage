import { useAuth } from '../lib/auth'
import { PageHead } from '../ui/kit'
import { EquipeTab } from './EquipeTab'

/** Equipe: crachás, contatos, cargos e criação de usuários (administradores). */
export default function Equipe() {
  const { can } = useAuth()
  return (
    <>
      <PageHead title="Equipe" sub={can('configuracoes', 'write') ? 'Pessoas da agência, contatos, cargos e acessos' : 'Pessoas da agência e seus contatos'} />
      <EquipeTab />
    </>
  )
}

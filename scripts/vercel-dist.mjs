// Gera dist/vercel.json para deploy manual da pasta dist (sem build na Vercel).
// Fonte única: o vercel.json da raiz. Aqui saem só as chaves de build, que não
// fazem sentido numa pasta já compilada (lá não existe package.json).
// Também confere se o hash do CSP bate com o script inline do index.html:
// se alguém alterar esse script e esquecer o hash, a build falha em vez de
// publicar um site com o script bloqueado pelo navegador.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'))
const html = readFileSync(new URL('dist/index.html', root), 'utf8')

const csp = config.headers
  ?.flatMap((h) => h.headers)
  .find((h) => h.key.toLowerCase() === 'content-security-policy')?.value ?? ''
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const missing = inline
  .map((s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`)
  .filter((hash) => !csp.includes(hash))
if (missing.length) {
  console.error(`\n✖ O CSP do vercel.json não autoriza o script inline do index.html.\n  Adicione em script-src: ${missing.join(' ')}\n`)
  process.exit(1)
}

const { framework, buildCommand, outputDirectory, installCommand, devCommand, ...deploy } = config
void framework; void buildCommand; void outputDirectory; void installCommand; void devCommand
writeFileSync(new URL('dist/vercel.json', root), JSON.stringify(deploy, null, 2) + '\n')
console.log('✓ dist/vercel.json gerado (rotas e cabeçalhos de segurança; CSP conferido)')

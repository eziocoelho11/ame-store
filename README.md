# AME Store

Aplicativo de gestão para loja de roupas: vendas (PDV), estoque com grade de
tamanho e cor, despesas, recebíveis de cartão, fiado e DRE.

Roda no iPhone, no Android e no PC como PWA instalável. **Custo zero e sem
mensalidade**: nenhum servidor, nenhum banco hospedado, nenhuma dependência.

## Como é feito

HTML, CSS e JavaScript nativos. Sem framework, sem bundler, sem `node_modules`,
sem CDN. Não existe etapa de build: os arquivos do repositório são o app.

- **Dados no aparelho** — IndexedDB, funciona offline.
- **Log de eventos append-only** — o estado é a redução do log. Dá auditoria,
  correção não destrutiva e sincronia sem conflito de graça.
- **Sincronia opcional pelo GitHub** — cada aparelho grava só o próprio arquivo
  em `eventos/{aparelho}/{AAAA-MM}.jsonl` num repositório privado. Union merge,
  deduplicação por id de evento, histórico versionado.
- **Dinheiro em centavos inteiros** — nada de ponto flutuante em valor monetário.
- **CMV por custo médio ponderado**, recalculado no replay do log.

## Rodar

```
powershell -ExecutionPolicy Bypass -File servir.ps1
```

`http://localhost:8080/`. Adicione `-Rede` para acessar do celular na mesma wi-fi.

## Publicar

GitHub Pages a partir da branch `main`, pasta raiz. Este repositório contém
**apenas código** — os dados da loja ficam em repositório privado separado.

## Manual

[docs/manual.md](docs/manual.md) — instalação, uso diário, sincronia, backup e
como os números da DRE são calculados.

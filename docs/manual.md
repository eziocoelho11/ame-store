# AME Store — manual

Aplicativo de gestão da loja: vendas, estoque, despesas, recebíveis e DRE.
Funciona no iPhone, no Android e no PC. Custo zero, sem mensalidade, sem servidor.

**Endereço do app: https://eziocoelho11.github.io/ame-store/**

---

## 1. Como este app funciona (o essencial em 1 minuto)

**Os dados moram no seu aparelho.** Não existe servidor. O app abre e funciona
mesmo sem internet — se a wi-fi da loja cair no meio de uma venda, nada para.

**Nada é apagado de verdade.** Toda ação vira um registro com data, hora e
aparelho de origem. Cancelar uma venda não apaga a venda: cria um cancelamento.
Isso serve para auditoria e para a sincronia entre aparelhos nunca dar conflito.

**A sincronia é opcional e usa o GitHub** como caixa postal (seção 6). Cada
aparelho escreve só o próprio arquivo, então dois aparelhos nunca disputam o
mesmo lugar. E cada gravação vira uma versão salva: dá para voltar no tempo.

---

## 2. Instalar no aparelho

O app é um site que se instala. Depois de instalado, abre com ícone próprio,
tela cheia e funciona offline.

**iPhone / iPad (Safari)**
1. Abra **https://eziocoelho11.github.io/ame-store/** no Safari (tem que ser o Safari — no iPhone só ele instala).
2. Toque no botão de compartilhar (quadrado com seta para cima).
3. "Adicionar à Tela de Início" → Adicionar.

**Android (Chrome)**
1. Abra **https://eziocoelho11.github.io/ame-store/** no Chrome.
2. Menu (⋮) → "Instalar aplicativo" ou "Adicionar à tela inicial".

**PC (Chrome ou Edge)**
1. Abra **https://eziocoelho11.github.io/ame-store/**.
2. Ícone de instalar na barra de endereço, ou menu → Instalar.

---

## 3. Primeiros passos, na ordem certa

1. **Ajustes › Regime tributário** — preencha o DAS mensal e o teto anual do MEI.
   Consulte os valores vigentes no Portal do Empreendedor. O app não preenche
   valor de tributo sozinho, de propósito: esses números mudam por lei todo ano
   e um número errado aqui contamina a DRE inteira.
2. **Ajustes › Taxas da maquininha** — copie da fatura da sua operadora a taxa de
   débito e de cada faixa de crédito, e em quantos dias cada parcela cai.
   **Enquanto estiver zerado, a DRE mostra margem maior do que a real.**
3. **Ajustes › Canais de venda** — se vende em marketplace, ponha a comissão dele.
4. **Estoque › Novo produto** — cadastre a peça com os tamanhos e cores.
   Cada combinação vira um saldo separado, com SKU e código de barras próprios.
5. **Estoque › Entrada de compra** — lance o que chegou do fornecedor, com o
   custo real e o frete. O frete é rateado no custo das peças.
6. **Vender** — está pronto para o balcão.

Quer conhecer as telas antes? **Ajustes › Conhecer o app › Carregar demonstração**
cria um mês fictício completo. Depois use "Apagar dados deste aparelho" para zerar.

---

## 4. O dia a dia

### Vender
Busque pelo nome, pelo SKU ou pelo código de barras, toque na peça, ajuste a
quantidade e toque em **Cobrar**.

No pagamento, escolha as formas — dá para dividir a mesma venda entre dinheiro,
PIX, cartão e fiado. Se digitar mais dinheiro do que o total, o app calcula o
troco e não conta a diferença como receita.

- **Dinheiro e PIX** entram no caixa na hora.
- **Débito e crédito** viram parcelas a receber, já com a taxa descontada.
- **Fiado** exige um cliente selecionado na venda.

Leitor de código de barras USB funciona sem configuração: ele digita e dá Enter,
e o app entende. Pela câmera, use o botão **Ler código**.

### Devolução e troca
Abra a venda (em Vendas) e use **Registrar devolução**. Escolha quantas peças
voltam, se elas retornam ao estoque e como o valor foi devolvido. A devolução
entra no mês em que aconteceu, não no mês da venda.

### Despesas
Lance tudo que sai: aluguel, energia, embalagem, marketing, pró-labore.
Marque **fixa** (existe mesmo sem vender) ou **variável** (acompanha a venda) —
é essa separação que faz o ponto de equilíbrio funcionar.

Despesa marcada como "repete todo mês" pode ser copiada para o mês seguinte com
o botão **Repetir recorrentes**.

### Receber
Em **Financeiro › A receber** ficam as parcelas de cartão e os fiados em aberto.
Quando o repasse da maquininha cair, selecione as parcelas e marque como recebidas.

---

## 5. Entender os números

### DRE e fluxo de caixa medem coisas diferentes — e os dois estão certos
A **DRE** conta a venda no dia em que ela aconteceu, mesmo que o dinheiro do
cartão só caia em 60 dias. Ela responde: *a loja dá lucro?*

O **Fluxo de caixa** conta o dinheiro no dia em que ele entra ou sai. Ele
responde: *tem dinheiro na conta?*

Loja lucrativa que quebra por falta de caixa é exatamente a diferença entre as
duas. Por isso as duas telas existem separadas.

A compra de mercadoria mostra bem isso: sai do caixa no dia em que a mercadoria
chega, mas só entra na DRE como CMV quando a peça é vendida.

### Custo médio ponderado
Cada entrada recalcula o custo médio da peça. Se você comprou 10 a R$ 50 e depois
10 a R$ 60, o custo médio vira R$ 55 — e é esse valor que a venda seguinte usa
como CMV. É o que mantém a margem honesta quando o fornecedor reajusta.

### Taxa de cartão e comissão são dedução de receita
Não são despesa operacional. Entram antes da margem bruta, para a margem por
canal ficar real: a mesma peça rende diferente no balcão e no marketplace.

### Ponto de equilíbrio
Quanto a loja precisa faturar no mês para o resultado zerar. Calculado como
despesas fixas dividido pela margem de contribuição.

### Teto do MEI
O painel mostra o faturamento acumulado dos últimos 12 meses contra o teto.
Passar do teto obriga a mudar de regime e pagar a diferença — o medidor existe
para você ver isso chegando com meses de antecedência, não no susto.

---

## 6. Sincronia entre aparelhos

Sem sincronia, cada aparelho tem seus próprios dados. Ligando, todos ficam iguais.

### Montar (uma vez só)

1. Crie no GitHub um repositório **privado** chamado `ame-store-dados`.
   **Privado é obrigatório** — é onde ficam as vendas da loja.
2. GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → Generate new token.
   - *Repository access*: apenas `ame-store-dados`.
   - *Permissions › Repository permissions › Contents*: **Read and write**.
   - Escolha a validade e **anote a data em que o token expira**.
3. No app: **Ajustes › Sincronia › Configurar**. Cole o repositório
   (`eziocoelho11/ame-store-dados`) e o token. Use **Testar conexão** antes de
   salvar — o teste avisa se o repositório estiver público por engano.
4. Repita o passo 3 nos outros aparelhos, com o mesmo repositório.

### No dia a dia
O app sincroniza sozinho: ao abrir, poucos segundos depois de cada lançamento,
ao voltar para a tela e **de tempos em tempos enquanto estiver aberto** (a cada
45 segundos, ajustável em Ajustes › Sincronia). Na prática, uma venda feita no
celular da loja aparece no PC em menos de um minuto, sem ninguém apertar nada.
O botão de sincronizar no topo força na hora.

Duas coisas que vale entender, porque explicam o comportamento:

**Aparelho fechado não sincroniza.** Um app instalado pelo navegador não roda em
segundo plano — no iPhone, nunca. Ele busca as novidades no instante em que for
aberto. Não existe forma de contornar isso sem manter um servidor no ar, que
traria mensalidade.

**Perguntar de tempos em tempos não custa nada.** A consulta é condicional: se
nada mudou, o GitHub responde "sem novidade", sem enviar conteúdo — e esse tipo
de resposta não conta no limite de uso. Por isso o intervalo curto é seguro.

Sem internet, tudo continua funcionando: o que ficou pendente sobe na próxima vez.

### Quando o token expirar
A sincronia para e o app avisa com erro de token inválido. Gere um token novo
(passo 2) e cole em **Ajustes › Sincronia › Alterar**. Nada se perde: os
lançamentos ficam guardados no aparelho até conseguir subir.

### Se perder um aparelho
Revogue o token no GitHub (Settings → Developer settings → Tokens → Revoke).
Aquele aparelho para de acessar o repositório imediatamente.

---

## 7. Backup

**Ajustes › Backup › Baixar backup** gera um arquivo `.json` com o histórico
inteiro. Guarde no Google Drive.

Restaurar (em qualquer aparelho) reconstrói tudo: estoque, vendas, DRE,
recebíveis. Restaurar **junta** com o que já existe — lançamento repetido é
reconhecido pelo identificador e ignorado, nada é sobrescrito.

Com a sincronia ligada, o repositório do GitHub já é um backup versionado.
O arquivo `.json` é a segunda camada, para o caso de perder o acesso à conta.

---

## 8. Etiquetas e código de barras

**Estoque › Etiquetas** monta uma folha para imprimir, com nome, tamanho, cor,
código de barras e preço.

Os códigos são EAN-13 gerados pelo app com prefixo 2 — a faixa que o padrão GS1
reserva para uso interno de loja. Nunca colidem com o código de fábrica de outro
produto.

**Sobre ler pela câmera:** no Android e no PC o app usa o leitor nativo do
navegador, que é rápido e preciso. **O Safari do iPhone não tem esse recurso**,
então lá o app usa um decodificador próprio — funciona, mas erra mais com
etiqueta amassada ou luz fraca. Buscar por nome ou digitar o SKU continua
disponível em todas as telas; a câmera acelera, não é o único caminho.

---

## 9. Rodar e publicar

### Testar no PC, sem publicar
Na pasta do projeto:

```
powershell -ExecutionPolicy Bypass -File servir.ps1
```

Abre em `http://localhost:8080/`. Para abrir também no celular pela mesma wi-fi:

```
powershell -ExecutionPolicy Bypass -File servir.ps1 -Rede
```

(precisa rodar o PowerShell como administrador na primeira vez)

### Onde o app está publicado
Já está no ar, em **https://eziocoelho11.github.io/ame-store/**, servido pelo
GitHub Pages a partir do repositório público `eziocoelho11/ame-store`.

Dois repositórios, com papéis distintos e que não devem se misturar:

| Repositório | Visibilidade | Conteúdo |
|---|---|---|
| `eziocoelho11/ame-store` | público | só o código do app |
| `eziocoelho11/ame-store-dados` | privado | só os lançamentos da loja |

O repositório do app é público porque o GitHub Pages grátis exige isso. Nenhum
dado da loja entra nele — as vendas ficam no repositório privado.

### Atualizar o app depois de mexer no código

```
cd C:\Projetos\ame-store
git add -A
git commit -m "descrição do que mudou"
git push
```

Os aparelhos pegam a versão nova ao abrir, e o app avisa quando há atualização.

**Ao mudar qualquer arquivo de código, suba também a versão do cache**: abra
`sw.js` e incremente a constante `VERSAO` (de `ame-store-v1` para `ame-store-v2`,
e assim por diante). Sem isso os aparelhos continuam servindo a versão antiga
guardada offline, e a atualização parece não ter funcionado.

### Gerar este manual em PDF

```
powershell -ExecutionPolicy Bypass -File docs\gerar-pdf.ps1
```

Lê o `manual.md`, converte para HTML e manda o Chrome imprimir em PDF. Rode de
novo sempre que editar o manual.

---

## 10. Problemas comuns

**"Não consegui abrir os dados neste aparelho"**
Janela anônima bloqueia o armazenamento local. Abra numa janela normal.

**Os números da DRE parecem altos demais**
Confira as taxas da maquininha em Ajustes. Zeradas, elas não descontam nada.

**O estoque ficou negativo**
Alguém vendeu uma peça que o sistema não sabia que existia. Corrija em
Estoque → abra o produto → Ajustar, com o motivo. O histórico registra o acerto.

**Uma venda foi lançada errada**
Cancele (a venda fica no histórico marcada como cancelada, o estoque volta e os
recebíveis são cancelados) e lance de novo. Não existe editar venda de propósito:
apagar rastro de dinheiro é o tipo de coisa que ninguém consegue auditar depois.

**A sincronia parou**
Veja Ajustes › Sincronia. Erro de token = token expirado ou revogado (seção 6).

**Apaguei sem querer os dados de um aparelho**
Se a sincronia estava ligada, reconfigure a sincronia nele: os dados voltam do
repositório. Se não estava, restaure o último backup.

---

## 11. Onde ficam as coisas

```
index.html          a página do app
sw.js               o que faz o app funcionar offline
servir.ps1          servidor local para testar no PC
css/app.css         toda a aparência
js/core/            base: banco local, log de eventos, estado, sincronia
js/domain/          as regras de negócio (estoque, vendas, DRE, relatórios)
js/ui/              as telas
docs/manual.md      este arquivo
```

O app não usa nenhuma biblioteca externa. É HTML, CSS e JavaScript puros: não há
dependência para atualizar, nem pacote para apodrecer, nem fornecedor para
cobrar mensalidade.

// ajustes.js — configuracao da loja, taxas, sincronia e backup.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import * as sync from '../../core/sync.js';
import * as db from '../../core/db.js';
import { deviceNome, setDeviceNome, deviceId } from '../../core/id.js';
import { brl, esc, iso, num, dataBR } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { liga, toast, modalFormulario, confirmar, abrirModal, baixarArquivo, lerArquivo, tag , vista } from '../ui.js';

export async function render(raiz) {
  const desenhar = vista(raiz, html, ligar);
  return log.assinar(desenhar);
}

async function html() {
  const e = log.estado();
  const s = sync.estadoSincronia();
  const pend = await sync.pendentes();
  const uso = await db.usoDeArmazenamento();
  const mei = e.config.mei || {};
  const tema = document.documentElement.getAttribute('data-tema') || 'auto';

  return `
  <div class="cartao">
    <div class="cartao-cabecalho"><h3>${icone('loja', 18)} Loja</h3>
      <button class="btn btn-p" data-acao="loja">Editar</button></div>
    <div class="texto-2 pequeno">
      <div><strong>${esc(e.config.loja.nome)}</strong></div>
      ${e.config.loja.cnpj ? `<div>CNPJ ${esc(e.config.loja.cnpj)}</div>` : ''}
      ${e.config.loja.telefone ? `<div>${esc(e.config.loja.telefone)}</div>` : ''}
      ${e.config.loja.endereco ? `<div>${esc(e.config.loja.endereco)}</div>` : ''}
    </div>
  </div>

  <div class="cartao">
    <div class="cartao-cabecalho"><h3>${icone('recibo', 18)} Regime tributário</h3>
      <button class="btn btn-p" data-acao="mei">Editar</button></div>
    ${!mei.confirmado ? `<div class="aviso aviso-alerta">${icone('alerta')}<div>
      <strong>Valores ainda não confirmados.</strong>
      O DAS mensal e o teto anual do MEI mudam por lei. Consulte o valor vigente no Portal do Empreendedor e preencha aqui —
      eu não preencho valor de tributo por conta própria.</div></div>` : ''}
    <table><tbody>
      <tr><td>Regime</td><td class="dir">${mei.ativo ? 'MEI' : 'Sem regime configurado'}</td></tr>
      <tr><td>DAS mensal</td><td class="dir num">${mei.dasMensal ? brl(mei.dasMensal) : '<span class="texto-3">não informado</span>'}</td></tr>
      <tr><td>Teto anual</td><td class="dir num">${brl(mei.tetoAnual || 0)}</td></tr>
      <tr><td>Valores conferidos em</td><td class="dir">${mei.dataReferencia ? dataBR(mei.dataReferencia) : '<span class="texto-3">—</span>'}</td></tr>
    </tbody></table>
  </div>

  <div class="cartao">
    <div class="cartao-cabecalho"><h3>${icone('dinheiro', 18)} Taxas da maquininha</h3>
      <button class="btn btn-p" data-acao="nova-taxa">${icone('mais', 14)} Faixa</button></div>
    ${(e.config.taxas || []).every((t) => !t.taxaPct) ? `<div class="aviso aviso-alerta">${icone('alerta')}<div>
      <strong>Todas as taxas estão em zero.</strong>
      Enquanto ficarem assim, a margem na DRE aparece maior do que a real. Cada operadora cobra o seu — copie da sua fatura.</div></div>` : ''}
    <div class="rolagem-x"><table>
      <thead><tr><th>Forma</th><th>Parcelas</th><th class="dir">Taxa</th><th class="dir">Prazo</th><th></th></tr></thead>
      <tbody>${(e.config.taxas || []).map((t, i) => `<tr>
        <td>${t.forma === 'debito' ? 'Débito' : 'Crédito'}</td>
        <td>${t.parcelasDe === t.parcelasAte ? t.parcelasDe + 'x' : `${t.parcelasDe}x a ${t.parcelasAte}x`}</td>
        <td class="dir num">${String(t.taxaPct).replace('.', ',')}%</td>
        <td class="dir num">${t.prazoDias} dias</td>
        <td class="dir"><button class="btn btn-p" data-taxa="${i}">Editar</button></td></tr>`).join('')}
      </tbody></table></div>
    <p class="dica">Prazo é quando cada parcela cai na conta. Crédito costuma ser 30 dias por parcela.</p>
  </div>

  <div class="cartao">
    <div class="cartao-cabecalho"><h3>${icone('carrinho', 18)} Canais de venda</h3>
      <button class="btn btn-p" data-acao="novo-canal">${icone('mais', 14)} Canal</button></div>
    <div class="rolagem-x"><table>
      <thead><tr><th>Canal</th><th class="dir">Comissão</th><th></th></tr></thead>
      <tbody>${(e.config.canais || []).map((c, i) => `<tr>
        <td>${esc(c.nome)}</td>
        <td class="dir num">${String(c.comissaoPct || 0).replace('.', ',')}%</td>
        <td class="dir"><button class="btn btn-p" data-canal="${i}">Editar</button></td></tr>`).join('')}
      </tbody></table></div>
    <p class="dica">Comissão de marketplace entra como dedução da receita, para a margem por canal ficar honesta.</p>
  </div>

  <div class="cartao">
    <div class="cartao-cabecalho"><h3>${icone('nuvem', 18)} Sincronia entre aparelhos</h3>
      <span class="tag ${s.configurada ? 'tag-ok' : ''}">${s.configurada ? 'ligada' : 'desligada'}</span></div>
    ${s.configurada ? `
      <table><tbody>
        <tr><td>Repositório</td><td class="dir mono">${esc(s.repo)}</td></tr>
        <tr><td>Última sincronia</td><td class="dir">${s.ultima || 'ainda não'}</td></tr>
        <tr><td>Eventos pendentes</td><td class="dir num">${pend}</td></tr>
        <tr><td>Atualização automática</td><td class="dir">${sync.intervalo() > 0
          ? 'a cada ' + sync.intervalo() + ' segundos'
          : '<span class="texto-3">desligada</span>'}</td></tr>
      </tbody></table>
      <div class="campo-grupo mt">
        <label for="sync-intervalo">Buscar novidades dos outros aparelhos</label>
        <select id="sync-intervalo">
          <option value="20"${sync.intervalo() === 20 ? ' selected' : ''}>A cada 20 segundos</option>
          <option value="45"${sync.intervalo() === 45 ? ' selected' : ''}>A cada 45 segundos (recomendado)</option>
          <option value="120"${sync.intervalo() === 120 ? ' selected' : ''}>A cada 2 minutos</option>
          <option value="300"${sync.intervalo() === 300 ? ' selected' : ''}>A cada 5 minutos</option>
          <option value="0"${sync.intervalo() === 0 ? ' selected' : ''}>Só quando eu mandar</option>
        </select>
        <div class="dica">Só roda com o app aberto e na frente. Consulta que não traz novidade
          não conta no limite do GitHub, então intervalo curto não custa nada.</div>
      </div>
      <div class="barra-botoes mt">
        <button class="btn btn-primario" data-acao="sincronizar">${icone('sincronizar', 16)} Sincronizar agora</button>
        <button class="btn" data-acao="config-sync">Alterar</button>
        <button class="btn btn-perigo" data-acao="desligar-sync">Desligar</button>
      </div>`
      : `<p class="texto-2 pequeno">Sem sincronia, os dados ficam só neste aparelho. Ligando, cada aparelho grava seu próprio
         arquivo num repositório privado do GitHub — grátis, sem servidor, e cada gravação vira uma versão salva.</p>
      <button class="btn btn-primario" data-acao="config-sync">${icone('nuvem', 16)} Configurar sincronia</button>`}
  </div>

  <div class="cartao">
    <h3>${icone('baixar', 18)} Backup</h3>
    <p class="texto-2 pequeno">O backup guarda o histórico inteiro de lançamentos. Restaurar num aparelho novo reconstrói tudo:
      estoque, vendas, DRE, recebíveis.</p>
    <div class="barra-botoes">
      <button class="btn" data-acao="exportar">${icone('baixar', 16)} Baixar backup</button>
      <button class="btn" data-acao="importar">${icone('enviar', 16)} Restaurar backup</button>
    </div>
  </div>

  <div class="cartao">
    <h3>${icone('ajustes', 18)} Este aparelho</h3>
    <div class="linha">
      <div class="campo-grupo"><label for="dev-nome">Apelido</label>
        <input id="dev-nome" value="${esc(deviceNome())}"></div>
      <div class="campo-grupo"><label for="tema">Aparência</label>
        <select id="tema">
          <option value="auto"${tema === 'auto' ? ' selected' : ''}>Automática</option>
          <option value="claro"${tema === 'claro' ? ' selected' : ''}>Clara</option>
          <option value="escuro"${tema === 'escuro' ? ' selected' : ''}>Escura</option>
        </select></div>
    </div>
    <table><tbody>
      <tr><td>Identificador</td><td class="dir mono pequeno">${esc(deviceId())}</td></tr>
      <tr><td>Eventos guardados</td><td class="dir num">${num(log.eventos().length)}</td></tr>
      ${uso ? `<tr><td>Espaço usado</td><td class="dir">${(uso.usage / 1048576).toFixed(1).replace('.', ',')} MB</td></tr>` : ''}
    </tbody></table>
  </div>

  <div class="cartao">
    <h3>Listas</h3>
    <div class="barra-botoes">
      <button class="btn" data-lista="categoriasProduto">Categorias de produto</button>
      <button class="btn" data-lista="tamanhos">Tamanhos</button>
      <button class="btn" data-lista="categoriasDespesa">Categorias de despesa</button>
    </div>
  </div>

  <div class="cartao">
    <h3>Conhecer o app</h3>
    <p class="texto-2 pequeno">Carrega um mês fictício — produtos, vendas, despesas e recebíveis — para você navegar por
      todas as telas antes de lançar dado de verdade. Só aparece enquanto o aparelho está vazio.</p>
    ${log.eventos().length
      ? '<p class="dica">Este aparelho já tem lançamentos, então a demonstração está desligada para não misturar com dado real.</p>'
      : '<button class="btn" data-acao="demo">Carregar demonstração</button>'}
  </div>

  <div class="cartao">
    <h3 style="color:var(--vermelho)">Zona de risco</h3>
    <p class="texto-2 pequeno">Apagar remove tudo <strong>deste aparelho</strong>. Se a sincronia estiver ligada, os dados
      voltam do repositório na próxima sincronia — o que está no GitHub não é apagado por aqui.</p>
    <button class="btn btn-perigo" data-acao="apagar">Apagar dados deste aparelho</button>
  </div>

  <p class="texto-3 pequeno" style="text-align:center;margin-top:2rem">
    AME Store · aplicativo local-first, sem servidor e sem mensalidade.<br>
    Manual em <span class="mono">docs/manual.md</span>
  </p>`;
}

function ligar(raiz, redesenhar) {
  const e = log.estado();

  liga(raiz, 'click', '[data-acao="loja"]', () => {
    modalFormulario({
      titulo: 'Dados da loja', valores: e.config.loja,
      campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true },
        { nome: 'cnpj', rotulo: 'CNPJ', meia: true },
        { nome: 'telefone', rotulo: 'Telefone', meia: true },
        { nome: 'endereco', rotulo: 'Endereço' },
      ],
      aoSalvar: async (d, fechar) => {
        await acoes.definirConfig('loja', d);
        fechar(); toast('Dados salvos.', 'ok'); redesenhar();
      },
    });
  });

  liga(raiz, 'click', '[data-acao="mei"]', () => {
    const mei = e.config.mei || {};
    modalFormulario({
      titulo: 'Regime tributário',
      valores: { ...mei, dataReferencia: mei.dataReferencia || iso() },
      campos: [
        { nome: 'ativo', rotulo: 'A loja é MEI', tipo: 'checkbox', valor: mei.ativo !== false },
        { nome: 'dasMensal', rotulo: 'DAS mensal', tipo: 'moeda', meia: true,
          dica: 'Valor da guia do mês.' },
        { nome: 'tetoAnual', rotulo: 'Teto anual de faturamento', tipo: 'moeda', meia: true },
        { nome: 'dataReferencia', rotulo: 'Conferido em', tipo: 'data',
          dica: 'Anote quando você conferiu esses valores. Eles mudam por lei — vale revisar todo janeiro.' },
      ],
      aoSalvar: async (d, fechar) => {
        await acoes.definirConfig('mei', { ...d, confirmado: true });
        fechar(); toast('Regime atualizado.', 'ok'); redesenhar();
      },
    });
  });

  const editarTaxa = (indice) => {
    const lista = [...(e.config.taxas || [])];
    const t = indice === null
      ? { id: 't' + Date.now(), forma: 'credito', parcelasDe: 1, parcelasAte: 1, taxaPct: 0, prazoDias: 30 }
      : lista[indice];
    modalFormulario({
      titulo: indice === null ? 'Nova faixa de taxa' : 'Editar taxa',
      valores: t,
      campos: [
        { nome: 'forma', rotulo: 'Forma', tipo: 'select', meia: true,
          opcoes: [{ v: 'debito', t: 'Débito' }, { v: 'credito', t: 'Crédito' }] },
        { nome: 'taxaPct', rotulo: 'Taxa (%)', tipo: 'pct', meia: true },
        { nome: 'parcelasDe', rotulo: 'De (parcelas)', tipo: 'inteiro', meia: true },
        { nome: 'parcelasAte', rotulo: 'Até (parcelas)', tipo: 'inteiro', meia: true },
        { nome: 'prazoDias', rotulo: 'Prazo por parcela (dias)', tipo: 'inteiro',
          dica: 'Quantos dias até cada parcela cair na conta.' },
      ],
      botoesExtras: indice === null ? [] : [{
        texto: 'Remover', classe: 'btn-perigo',
        acao: async (fechar) => {
          lista.splice(indice, 1);
          await acoes.definirConfig('taxas', lista);
          fechar(); toast('Faixa removida.'); redesenhar();
        },
      }],
      aoSalvar: async (d, fechar) => {
        const nova = { ...t, ...d };
        if (indice === null) lista.push(nova); else lista[indice] = nova;
        await acoes.definirConfig('taxas', lista);
        fechar(); toast('Taxa salva.', 'ok'); redesenhar();
      },
    });
  };
  liga(raiz, 'click', '[data-taxa]', (ev, el) => editarTaxa(Number(el.dataset.taxa)));
  liga(raiz, 'click', '[data-acao="nova-taxa"]', () => editarTaxa(null));

  const editarCanal = (indice) => {
    const lista = [...(e.config.canais || [])];
    const c = indice === null ? { id: 'canal-' + Date.now(), nome: '', comissaoPct: 0 } : lista[indice];
    modalFormulario({
      titulo: indice === null ? 'Novo canal' : 'Editar canal', valores: c,
      campos: [
        { nome: 'nome', rotulo: 'Nome do canal', obrigatorio: true, attrs: 'placeholder="Shopee"' },
        { nome: 'comissaoPct', rotulo: 'Comissão do canal (%)', tipo: 'pct',
          dica: 'Quanto o canal fica de cada venda. Loja física normalmente é zero.' },
      ],
      botoesExtras: indice === null || lista.length <= 1 ? [] : [{
        texto: 'Remover', classe: 'btn-perigo',
        acao: async (fechar) => {
          lista.splice(indice, 1);
          await acoes.definirConfig('canais', lista);
          fechar(); toast('Canal removido.'); redesenhar();
        },
      }],
      aoSalvar: async (d, fechar) => {
        const novo = { ...c, ...d };
        if (indice === null) lista.push(novo); else lista[indice] = novo;
        await acoes.definirConfig('canais', lista);
        fechar(); toast('Canal salvo.', 'ok'); redesenhar();
      },
    });
  };
  liga(raiz, 'click', '[data-canal]', (ev, el) => editarCanal(Number(el.dataset.canal)));
  liga(raiz, 'click', '[data-acao="novo-canal"]', () => editarCanal(null));

  liga(raiz, 'click', '[data-lista]', (ev, el) => {
    const chave = el.dataset.lista;
    const atual = e.config[chave] || [];
    const ehObjeto = chave === 'categoriasDespesa';
    const texto = ehObjeto
      ? atual.map((c) => `${c.nome} | ${c.tipo === 'fixa' ? 'fixa' : 'variavel'}`).join('\n')
      : atual.join('\n');
    abrirModal({
      titulo: 'Editar lista',
      corpo: `<div class="campo-grupo">
        <label for="lst">Um item por linha${ehObjeto ? ', no formato <span class="mono">Nome | fixa</span> ou <span class="mono">Nome | variavel</span>' : ''}</label>
        <textarea id="lst" style="min-height:260px;font-family:var(--mono);font-size:.85rem">${esc(texto)}</textarea></div>`,
      botoes: [
        { texto: 'Cancelar', acao: (f) => f() },
        {
          texto: 'Salvar', classe: 'btn-primario',
          acao: async (fechar, r) => {
            const linhas = r.querySelector('#lst').value.split('\n').map((l) => l.trim()).filter(Boolean);
            const valor = ehObjeto
              ? linhas.map((l) => {
                const [nome, tipo] = l.split('|').map((x) => (x || '').trim());
                return { nome, tipo: tipo === 'fixa' ? 'fixa' : 'variavel' };
              })
              : linhas;
            await acoes.definirConfig(chave, valor);
            fechar(); toast('Lista salva.', 'ok'); redesenhar();
          },
        },
      ],
    });
  });

  const nome = raiz.querySelector('#dev-nome');
  if (nome) nome.addEventListener('change', () => { setDeviceNome(nome.value.trim() || 'Aparelho'); toast('Apelido salvo.'); });
  const tema = raiz.querySelector('#tema');
  if (tema) tema.addEventListener('change', () => {
    if (tema.value === 'auto') document.documentElement.removeAttribute('data-tema');
    else document.documentElement.setAttribute('data-tema', tema.value);
    localStorage.setItem('ame.tema', tema.value);
  });

  // ---------------- sincronia ----------------

  const selIntervalo = raiz.querySelector('#sync-intervalo');
  if (selIntervalo) selIntervalo.addEventListener('change', async () => {
    const s = await sync.definirIntervalo(selIntervalo.value);
    toast(s > 0 ? `Vou buscar novidades a cada ${s} segundos.` : 'Atualização automática desligada.', 'ok');
    redesenhar();
  });

  liga(raiz, 'click', '[data-acao="sincronizar"]', async () => {
    try {
      const r = await sync.sincronizar({ manual: true });
      toast(`Sincronizado — ${r.enviados} enviados, ${r.recebidos} recebidos.`, 'ok');
      redesenhar();
    } catch (err) { toast(err.message || 'Falhou.', 'erro'); }
  });

  liga(raiz, 'click', '[data-acao="desligar-sync"]', async () => {
    const ok = await confirmar('Desligar sincronia',
      'Este aparelho para de enviar e receber. Os dados que já estão aqui continuam. O repositório não é apagado.',
      { textoOk: 'Desligar', perigo: true });
    if (!ok) return;
    await sync.desligar(); toast('Sincronia desligada.'); redesenhar();
  });

  liga(raiz, 'click', '[data-acao="config-sync"]', () => {
    const cfg = sync.configuracao();
    const m = modalFormulario({
      titulo: 'Sincronia pelo GitHub',
      valores: cfg,
      textoOk: 'Salvar e sincronizar',
      extras: `<div class="aviso aviso-info">${icone('info')}<div>
        <strong>Como montar isso uma vez só:</strong>
        1. Crie no GitHub um repositório <strong>privado</strong> chamado <span class="mono">ame-store-dados</span>.<br>
        2. Em Settings › Developer settings › Personal access tokens › <strong>Fine-grained tokens</strong>, gere um token
           com acesso <em>somente</em> a esse repositório e permissão <span class="mono">Contents: Read and write</span>.<br>
        3. Cole aqui. Repita nos outros aparelhos com o mesmo repositório.<br>
        <strong>Anote a data de validade do token</strong> — quando ele expira, a sincronia para em silêncio.</div></div>
        <div id="teste-sync" class="mt"></div>`,
      campos: [
        { nome: 'repo', rotulo: 'Repositório', obrigatorio: true, attrs: 'placeholder="seu-usuario/ame-store-dados"' },
        { nome: 'token', rotulo: 'Token de acesso', obrigatorio: true, attrs: 'placeholder="github_pat_..." autocomplete="off"' },
        { nome: 'ramo', rotulo: 'Branch', valor: cfg.ramo || 'main', meia: true },
      ],
      botoesExtras: [{
        texto: 'Testar conexão',
        acao: async (fechar, r) => {
          const f = r.querySelector('form');
          const alvo = r.querySelector('#teste-sync');
          alvo.innerHTML = '<p class="dica">Testando…</p>';
          try {
            const res = await sync.testarConexao(f.elements.repo.value, f.elements.token.value, f.elements.ramo.value);
            alvo.innerHTML = `<div class="aviso aviso-${res.privado ? 'ok' : 'alerta'}">${icone(res.privado ? 'check' : 'alerta')}
              <div><strong>Conectado a ${esc(res.nome)}.</strong>
              ${res.privado ? 'Repositório privado — correto.' : 'ATENÇÃO: este repositório é PÚBLICO. Os dados da loja ficariam visíveis para qualquer pessoa. Troque para privado antes de usar.'}</div></div>`;
          } catch (err) {
            alvo.innerHTML = `<div class="aviso aviso-erro">${icone('alerta')}<div>${esc(err.message)}</div></div>`;
          }
        },
      }],
      aoSalvar: async (d, fechar) => {
        await sync.salvarConfiguracao(d);
        fechar();
        try {
          const r = await sync.sincronizar({ manual: true });
          toast(`Sincronia ligada — ${r.enviados} enviados, ${r.recebidos} recebidos.`, 'ok');
        } catch (err) { toast(err.message || 'Salvei, mas a primeira sincronia falhou.', 'erro'); }
        redesenhar();
      },
    });
    void m;
  });

  // ---------------- backup ----------------

  liga(raiz, 'click', '[data-acao="exportar"]', () => {
    const backup = log.exportarBackup();
    baixarArquivo(`AME Store - backup ${iso()}.json`, JSON.stringify(backup, null, 1));
    toast(`Backup com ${num(backup.totalEventos)} lançamentos.`, 'ok');
  });

  liga(raiz, 'click', '[data-acao="importar"]', async () => {
    const arq = await lerArquivo('.json');
    if (!arq) return;
    let obj;
    try { obj = JSON.parse(arq.conteudo); }
    catch { toast('Arquivo inválido.', 'erro'); return; }
    if (obj.formato !== 'ame-store-backup') { toast('Este arquivo não é um backup da AME Store.', 'erro'); return; }

    const ok = await confirmar('Restaurar backup',
      `O arquivo tem ${num((obj.eventos || []).length)} lançamentos de ${esc(obj.aparelho || 'outro aparelho')}.
       Eles se juntam ao que já existe aqui — lançamento repetido é reconhecido e ignorado, nada é sobrescrito.`,
      { textoOk: 'Restaurar' });
    if (!ok) return;
    try {
      const n = await log.restaurarBackup(obj);
      toast(n ? `${num(n)} lançamentos incorporados.` : 'Nada novo: este aparelho já tinha tudo.', 'ok');
      redesenhar();
    } catch (err) { toast(err.message, 'erro'); }
  });


  liga(raiz, 'click', '[data-acao="demo"]', async (ev, el) => {
    if (log.eventos().length) { toast('Só em aparelho sem dados.', 'erro'); return; }
    el.disabled = true;
    el.textContent = 'Montando…';
    try {
      const { carregarDemonstracao } = await import('../../domain/demo.js');
      const r = await carregarDemonstracao();
      toast(`Demonstração pronta: ${r.produtos} produtos e ${r.vendas} vendas.`, 'ok');
      location.hash = '/';
    } catch (err) {
      toast(err.message || 'Não consegui montar a demonstração.', 'erro');
      el.disabled = false;
      el.textContent = 'Carregar demonstração';
    }
  });
  liga(raiz, 'click', '[data-acao="apagar"]', async () => {
    const um = await confirmar('Apagar tudo deste aparelho',
      'Vendas, estoque, despesas, clientes e configurações somem daqui. Faça o backup antes.',
      { textoOk: 'Continuar', perigo: true });
    if (!um) return;
    const dois = await confirmar('Tem certeza mesmo?',
      'Última confirmação. Se a sincronia estiver ligada, os dados voltam do repositório; se não estiver, isso é definitivo.',
      { textoOk: 'Apagar definitivamente', perigo: true });
    if (!dois) return;
    await log.apagarTudo();
    await sync.desligar();
    toast('Dados apagados.');
    location.hash = '/';
    location.reload();
  });

  void tag;
}

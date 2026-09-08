// ajustes.js — configuracao da loja, taxas, sincronia e backup.
import * as log from '../../core/eventlog.js';
import * as acoes from '../../domain/acoes.js';
import * as sync from '../../core/sync.js';
import * as db from '../../core/db.js';
import { deviceNome, setDeviceNome, deviceId } from '../../core/id.js';
import { brl, esc, iso, num, dataBR } from '../../core/fmt.js';
import { icone } from '../icones.js';
import { taxaPara } from '../../core/state.js';

/** Nome da maquininha de uma faixa de taxa. Faixa sem maquininha e' regra geral. */
function nomeOperadora(config, operadoraId) {
  if (!operadoraId) return '';
  const o = (config.operadoras || []).find((x) => x.id === operadoraId);
  return o ? o.nome : '(maquininha removida)';
}

/**
 * As tres taxas que toda maquininha cobra: debito, credito 1x e credito
 * parcelado. Sao editadas DENTRO da maquininha, e nao numa tabela separada,
 * porque e' assim que a fatura da operadora chega e e' assim que a dona pensa —
 * "a taxa da Nubank e' tanto, a da PagSeguro e' tanto".
 *
 * Faixa extra (por exemplo 7x a 12x com taxa propria) continua existindo na
 * tabela avancada e NAO e' tocada por aqui: o campo "parcelado" edita so' a
 * faixa que comeca em 2x, preservando ate' onde ela ia.
 */
function taxasDaOperadora(config, operadoraId) {
  const lista = (config.taxas || []).filter((t) => t.operadoraId === operadoraId);
  const debito = lista.find((t) => t.forma === 'debito' && t.parcelasDe <= 1 && t.parcelasAte >= 1);
  const credito1 = lista.find((t) => t.forma === 'credito' && t.parcelasDe <= 1 && t.parcelasAte >= 1);
  const parcelado = lista.find((t) => t.forma === 'credito' && t.parcelasDe === 2);
  const extras = lista.filter((t) => t !== debito && t !== credito1 && t !== parcelado);
  return { debito, credito1, parcelado, extras };
}

/** Prazo que a maquininha ja' usa nas faixas dela, para nao perguntar duas vezes. */
function prazoDaOperadora(config, operadoraId) {
  const { debito, credito1, parcelado } = taxasDaOperadora(config, operadoraId);
  const alguma = credito1 || parcelado || debito;
  return alguma && alguma.prazoDias !== undefined ? alguma.prazoDias : 0;
}
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
    <div class="cartao-cabecalho"><h3>${icone('raio', 18)} Maquininhas</h3>
      <button class="btn btn-p" data-acao="nova-operadora">${icone('mais', 14)} Maquininha</button></div>
    ${!(e.config.operadoras || []).length ? `<div class="aviso aviso-info">${icone('info')}<div>
      <strong>Nenhuma maquininha cadastrada.</strong>
      Cadastre cada uma com as taxas dela — Nubank e PagSeguro cobram diferente, e cada uma tem taxa
      própria para débito, crédito 1× e crédito parcelado.</div></div>` : `<div class="rolagem-x"><table>
      <thead><tr><th>Maquininha</th><th class="dir">Débito</th><th class="dir">Crédito 1×</th>
        <th class="dir">Parcelado</th><th class="dir">Prazo</th><th>Antecipa?</th><th></th></tr></thead>
      <tbody>${(e.config.operadoras || []).map((o, i) => {
        const t = taxasDaOperadora(e.config, o.id);
        const celula = (faixa, forma, parcelas) => {
          if (faixa) return `<span class="num">${String(faixa.taxaPct).replace('.', ',')}%</span>`;
          const herdada = taxaPara(e.config, forma, parcelas, o.id);
          return `<span class="texto-3 pequeno">${String(herdada.taxaPct).replace('.', ',')}%<br>regra geral</span>`;
        };
        const prazo = t.credito1 || t.parcelado || t.debito
          ? prazoDaOperadora(e.config, o.id)
          : taxaPara(e.config, 'credito', 1, o.id).prazoDias;
        return `<tr>
        <td>${esc(o.nome)} ${o.ativa === false ? tag('fora de uso', 'erro') : ''}
          ${t.extras.length ? `<br><span class="texto-3 pequeno">+ ${t.extras.length} faixa(s) especial(is)</span>` : ''}</td>
        <td class="dir">${celula(t.debito, 'debito', 1)}</td>
        <td class="dir">${celula(t.credito1, 'credito', 1)}</td>
        <td class="dir">${celula(t.parcelado, 'credito', 3)}${t.parcelado ? `<br><span class="texto-3 pequeno">2× a ${t.parcelado.parcelasAte}×</span>` : ''}</td>
        <td class="dir num">${prazo} d</td>
        <td>${o.antecipa !== false ? tag('sim — cai de uma vez', 'ok') : 'não — parcela por parcela'}</td>
        <td class="dir"><button class="btn btn-p" data-operadora="${i}">Editar</button></td></tr>`;
      }).join('')}
      </tbody></table></div>`}
    ${(e.config.operadoras || []).some((o) => !taxasDaOperadora(e.config, o.id).credito1)
      ? `<p class="dica"><strong>Maquininha marcada como "regra geral"</strong> ainda não tem taxa própria:
          ela está usando a faixa geral, igual a todas as outras. Toque em Editar e ponha as taxas dela.</p>` : ''}
    <p class="dica">Antecipação é o padrão hoje: a operadora paga a venda inteira de uma vez, já sem as taxas.
      Com ela ligada, crédito em 3× deixa de ser três entradas futuras e passa a ser uma entrada agora — e a
      taxa cobrada é a da faixa de 3×, que é mais alta. Vendas já lançadas não mudam.</p>
  </div>

  <div class="cartao">
    <div class="cartao-cabecalho"><h3>${icone('dinheiro', 18)} Faixas de taxa (avançado)</h3>
      <button class="btn btn-p" data-acao="nova-taxa">${icone('mais', 14)} Faixa</button></div>
    <p class="dica">O normal é configurar as taxas dentro de cada maquininha, acima. Esta tabela é para o
      caso de precisar de mais faixas — por exemplo, 7× a 12× com taxa diferente de 2× a 6×.</p>
    ${(e.config.taxas || []).every((t) => !t.taxaPct) ? `<div class="aviso aviso-alerta">${icone('alerta')}<div>
      <strong>Todas as taxas estão em zero.</strong>
      Enquanto ficarem assim, a margem na DRE aparece maior do que a real. Cada operadora cobra o seu — copie da sua fatura.</div></div>` : ''}
    <div class="rolagem-x"><table>
      <thead><tr><th>Maquininha</th><th>Forma</th><th>Parcelas</th><th class="dir">Taxa</th>
        <th class="dir">Prazo</th><th></th></tr></thead>
      <tbody>${(e.config.taxas || []).map((t, i) => `<tr>
        <td>${esc(nomeOperadora(e.config, t.operadoraId)) || '<span class="texto-3">regra geral</span>'}</td>
        <td>${t.forma === 'debito' ? 'Débito' : 'Crédito'}</td>
        <td>${t.parcelasDe === t.parcelasAte ? t.parcelasDe + 'x' : `${t.parcelasDe}x a ${t.parcelasAte}x`}</td>
        <td class="dir num">${String(t.taxaPct).replace('.', ',')}%</td>
        <td class="dir num">${t.prazoDias} dias</td>
        <td class="dir"><button class="btn btn-p" data-taxa="${i}">Editar</button></td></tr>`).join('')}
      </tbody></table></div>
    <p class="dica">Prazo é quando o dinheiro cai. Com antecipação, é o prazo do valor inteiro — hoje quase
      sempre <strong>0 dias</strong>, e aí a venda entra no caixa no mesmo dia, sem precisar dar baixa. Sem
      antecipação, é o prazo de cada parcela (crédito costuma ser 30 dias por parcela).
      Faixa em <em>regra geral</em> (sem maquininha) vale para qualquer operadora que não tenha faixa própria.</p>
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
      ${s.ultimoErro ? `<div class="aviso aviso-erro mt">${icone('alerta')}<div>
        <strong>Última tentativa falhou.</strong> ${esc(s.ultimoErro.mensagem)}
        ${s.ultimoErro.quando ? '<br><span class="pequeno">em ' + esc(new Date(s.ultimoErro.quando).toLocaleString('pt-BR')) + '</span>' : ''}
        </div></div>` : ''}
      <div class="barra-botoes mt">
        <button class="btn btn-primario" data-acao="sincronizar">${icone('sincronizar', 16)} Sincronizar agora</button>
        <button class="btn" data-acao="reparar-sync">Buscar tudo de novo</button>
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
      <tr><td>Versão do app</td><td class="dir mono pequeno" id="aj-versao">conferindo…</td></tr>
      <tr><td>Eventos guardados</td><td class="dir num">${num(log.eventos().length)}</td></tr>
      ${uso ? `<tr><td>Espaço usado</td><td class="dir">${(uso.usage / 1048576).toFixed(1).replace('.', ',')} MB</td></tr>` : ''}
    </tbody></table>
    <div class="barra-botoes mt">
      <button class="btn" data-acao="buscar-atualizacao">${icone('sincronizar', 16)} Buscar atualização</button>
    </div>
    <p class="dica">A versão sai do que está guardado offline neste aparelho. Se ela estiver atrás da versão
      publicada, toque em "Buscar atualização" — o app baixa a nova e recarrega sozinho.</p>
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

  const editarOperadora = (indice) => {
    const lista = [...(e.config.operadoras || [])];
    const o = indice === null
      ? { id: 'op' + Date.now(), nome: '', antecipa: true, ativa: true }
      : lista[indice];
    const atuais = taxasDaOperadora(e.config, o.id);
    // Abre com a taxa que ESTA' VALENDO, mesmo quando ela vem da regra geral:
    // abrir em zero faria a pessoa achar que a maquininha nao cobra nada, e
    // salvar sem mexer zeraria a taxa dela. Salvando, essas passam a ser as
    // taxas proprias da maquininha.
    const valendo = (faixa, forma, parcelas) => (faixa
      ? faixa.taxaPct
      : taxaPara(e.config, forma, parcelas, o.id).taxaPct);
    modalFormulario({
      titulo: indice === null ? 'Nova maquininha' : 'Editar ' + (o.nome || 'maquininha'),
      valores: {
        ...o,
        prazoDias: indice === null ? 0
          : (atuais.credito1 || atuais.parcelado || atuais.debito
            ? prazoDaOperadora(e.config, o.id)
            : taxaPara(e.config, 'credito', 1, o.id).prazoDias),
        taxaDebito: indice === null ? 0 : valendo(atuais.debito, 'debito', 1),
        taxaCredito1: indice === null ? 0 : valendo(atuais.credito1, 'credito', 1),
        taxaCreditoParcelado: indice === null ? 0 : valendo(atuais.parcelado, 'credito', 3),
      },
      campos: [
        { nome: 'nome', rotulo: 'Nome', obrigatorio: true,
          dica: 'Como você chama ela no dia a dia: Nubank, PagSeguro, Mercado Pago…' },
        { nome: 'separador-taxas', tipo: 'separador', rotulo: 'Taxas desta maquininha' },
        { nome: 'taxaDebito', rotulo: 'Débito (%)', tipo: 'pct', meia: true },
        { nome: 'taxaCredito1', rotulo: 'Crédito 1× (%)', tipo: 'pct', meia: true },
        { nome: 'taxaCreditoParcelado',
          rotulo: `Crédito parcelado 2× a ${atuais.parcelado ? atuais.parcelado.parcelasAte : 12}× (%)`,
          tipo: 'pct',
          dica: atuais.credito1
            ? 'Copie da fatura da operadora. Parcelado costuma ser mais caro que 1×.'
            : 'Estes valores vieram da regra geral. Ao salvar, passam a ser as taxas desta maquininha.' },
        { nome: 'prazoDias', rotulo: 'Prazo em dias', tipo: 'inteiro',
          dica: 'Quantos dias até o dinheiro cair. Com antecipação, 0 = no mesmo dia da venda.' },
        { nome: 'separador-como', tipo: 'separador', rotulo: 'Como ela paga' },
        { nome: 'antecipa', rotulo: 'Antecipa (paga a venda inteira de uma vez)', tipo: 'checkbox',
          dica: 'É o padrão hoje. Ligado, o crédito em 3× cai numa entrada só, já sem as taxas.' },
        { nome: 'ativa', rotulo: 'Em uso', tipo: 'checkbox',
          dica: 'Desmarque a maquininha que você não usa mais: ela sai do PDV e o histórico continua.' },
      ],
      extras: atuais.extras.length
        ? `<p class="dica">Esta maquininha também tem ${atuais.extras.length} faixa(s) especial(is)
            (${atuais.extras.map((t) => (t.forma === 'debito' ? 'débito' : 'crédito') + ' '
              + t.parcelasDe + '× a ' + t.parcelasAte + '×').join(', ')}).
            Elas não são alteradas aqui — edite em <strong>Faixas de taxa (avançado)</strong>, abaixo.</p>`
        : '',
      botoesExtras: indice === null ? [] : [{
        texto: 'Remover', classe: 'btn-perigo',
        acao: async (fechar) => {
          // Remover a maquininha NAO apaga as faixas dela: elas viram orfas e
          // continuam visiveis na tabela de taxas, para nao sumir configuracao
          // sem a pessoa ver. Quem quiser limpa faixa por faixa.
          lista.splice(indice, 1);
          await acoes.definirConfig('operadoras', lista);
          fechar(); toast('Maquininha removida. As faixas de taxa dela continuam na lista.');
          redesenhar();
        },
      }],
      aoSalvar: async (d, fechar) => {
        // Os campos de taxa nao moram na operadora: viram faixas em config.taxas,
        // que e' de onde o PDV e o replay leem. Guardar nos dois lugares criaria
        // duas verdades e um dia elas discordariam.
        const { taxaDebito, taxaCredito1, taxaCreditoParcelado, prazoDias, ...campos } = d;
        const nova = { ...o, ...campos };
        if (!String(nova.nome || '').trim()) { toast('Dê um nome à maquininha.', 'erro'); return; }
        if (indice === null) lista.push(nova); else lista[indice] = nova;

        const prazo = Number(prazoDias) || 0;
        const faixas = [...(e.config.taxas || [])];
        // Grava por cima da faixa que existe, ou cria. Faixa especial da mesma
        // maquininha (7x a 12x, por exemplo) fica intocada.
        const upsert = (achada, modelo) => {
          const i = achada ? faixas.indexOf(achada) : -1;
          if (i >= 0) faixas[i] = { ...faixas[i], ...modelo, prazoDias: prazo };
          else faixas.push({ id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
            operadoraId: nova.id, ...modelo, prazoDias: prazo });
        };
        upsert(atuais.debito, { forma: 'debito', parcelasDe: 1, parcelasAte: 1, taxaPct: taxaDebito || 0 });
        upsert(atuais.credito1, { forma: 'credito', parcelasDe: 1, parcelasAte: 1, taxaPct: taxaCredito1 || 0 });
        upsert(atuais.parcelado, { forma: 'credito', parcelasDe: 2,
          parcelasAte: atuais.parcelado ? atuais.parcelado.parcelasAte : 12,
          taxaPct: taxaCreditoParcelado || 0 });

        await acoes.definirConfig('operadoras', lista);
        await acoes.definirConfig('taxas', faixas);
        fechar(); toast('Maquininha e taxas salvas.', 'ok'); redesenhar();
      },
    });
  };
  liga(raiz, 'click', '[data-operadora]', (ev, el) => editarOperadora(Number(el.dataset.operadora)));
  liga(raiz, 'click', '[data-acao="nova-operadora"]', () => editarOperadora(null));

  const editarTaxa = (indice) => {
    const lista = [...(e.config.taxas || [])];
    const t = indice === null
      ? { id: 't' + Date.now(), operadoraId: '', forma: 'credito', parcelasDe: 1, parcelasAte: 1,
          taxaPct: 0, prazoDias: 0 }
      : lista[indice];
    const maquinas = e.config.operadoras || [];
    modalFormulario({
      titulo: indice === null ? 'Nova faixa de taxa' : 'Editar taxa',
      valores: t,
      campos: [
        { nome: 'operadoraId', rotulo: 'Maquininha', tipo: 'select',
          opcoes: [{ v: '', t: '— regra geral (qualquer maquininha) —' }]
            .concat(maquinas.map((o) => ({ v: o.id, t: o.nome }))),
          dica: maquinas.length ? 'Cada maquininha cobra o seu: crie uma faixa para cada uma.'
            : 'Cadastre as maquininhas acima para dar taxa diferente a cada uma.' },
        { nome: 'forma', rotulo: 'Forma', tipo: 'select', meia: true,
          opcoes: [{ v: 'debito', t: 'Débito' }, { v: 'credito', t: 'Crédito' }] },
        { nome: 'taxaPct', rotulo: 'Taxa (%)', tipo: 'pct', meia: true },
        { nome: 'parcelasDe', rotulo: 'De (parcelas)', tipo: 'inteiro', meia: true },
        { nome: 'parcelasAte', rotulo: 'Até (parcelas)', tipo: 'inteiro', meia: true },
        { nome: 'prazoDias', rotulo: 'Prazo em dias', tipo: 'inteiro',
          dica: 'Com antecipação: dias até o valor inteiro cair — 0 = no mesmo dia. '
            + 'Sem antecipação: dias até cada parcela cair (crédito costuma ser 30).' },
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

  liga(raiz, 'click', '[data-acao="reparar-sync"]', async (ev, el) => {
    el.disabled = true;
    try {
      const r = await sync.repararLeitura();
      toast(r.recebidos
        ? `${num(r.recebidos)} lançamento(s) recuperado(s) do repositório.`
        : 'Nada faltando: este aparelho já está completo.', 'ok');
    } catch (err) {
      toast('Não consegui: ' + (err.message || err), 'erro');
    } finally { el.disabled = false; }
  });

  // ---------------- versao do app ----------------

  // A versao vem do nome do cache do service worker: e' exatamente o que este
  // aparelho esta' servindo offline, e nao o que o servidor tem.
  (async () => {
    const el = raiz.querySelector('#aj-versao');
    if (!el) return;
    try {
      const chaves = await caches.keys();
      const minha = chaves.find((k) => k.startsWith('ame-store-'));
      el.textContent = minha || 'sem cache (sempre online)';
    } catch { el.textContent = 'não disponível'; }
  })();

  liga(raiz, 'click', '[data-acao="buscar-atualizacao"]', async (ev, el) => {
    el.disabled = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { toast('Este aparelho não guarda o app offline.'); return; }
      await reg.update();
      // O `controllerchange` em main.js recarrega sozinho quando a nova assume.
      // Se nao houver versao nova, avisa para nao parecer que travou.
      setTimeout(() => {
        if (!reg.installing && !reg.waiting) toast('Já está na versão mais nova.', 'ok');
      }, 2500);
    } catch (err) {
      toast('Não consegui verificar: ' + (err.message || err), 'erro');
    } finally {
      el.disabled = false;
    }
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
